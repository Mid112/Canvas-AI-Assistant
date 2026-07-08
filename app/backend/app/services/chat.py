# app/backend/app/services/chat.py
import asyncio
import json
import re
from datetime import UTC, date, datetime

import httpx
from fastapi import HTTPException
from sqlalchemy import desc, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.mcp_tools.dispatcher import ToolExecutionError, execute_tool, parse_action
from app.mcp_tools.schemas import ACTION_SCHEMAS, WRITE_ACTIONS, IntentPreviewAction
from app.models.audit_log import AuditLog
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message import Message
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow
from app.services.llm.llm_setting import get_llm_adapter

LLM_TIMEOUT_SECONDS = 90.0
HISTORY_WINDOW = 10
# Failure paths (parse errors, timeouts, HTTP errors) log the full raw
# diagnostic — for a "thinking" model that can mean the entire verbose
# <think> block, hundreds to thousands of tokens — as the assistant message
# content for that turn. _get_recent_messages then feeds that same content
# back to the LLM as conversation history on the *next* turn, which both
# wastes context on text the LLM never meant as an answer and can cascade
# into the next request itself being rejected as too large (observed live:
# a JSON-parse-failure turn's full raw output got included as history and
# the following request failed with a 413 from Groq). Cap any single
# history message's contribution regardless of why it got large.
HISTORY_MESSAGE_MAX_CHARS = 2000

# WRITE_ACTIONS (imported from app.mcp_tools.schemas) is also the set of
# actions that get a Workflow row (the replay-safe confirm state machine).
# Read actions are structurally free to be wrapped in an intent_preview too
# (see dispatcher.py's intent_preview case), but replaying a read is
# harmless, so they're deliberately excluded — scoping this to writes only
# also avoids a real collision: a modify-turn's Workflow lookup keys off
# preview_message_id, and a stray read-preview sharing that id with an
# unrelated pending write could otherwise corrupt it.

# action_name -> (resource_type, operation) for AuditLog rows.
# send_message's entry here is only a default: the action can produce
# either a public announcement or a private conversation depending on
# recipient_canvas_user_ids, and the actual outcome is resolved dynamically
# from the write result below rather than assumed from action_name alone.
_AUDIT_RESOURCE_MAP = {
    "create_assignment": ("assignment", "create"),
    "update_assignment": ("assignment", "update"),
    "send_message": ("announcement", "create"),
}


def _normalize_course_text(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _json_dumps(obj) -> str:
    """json.dumps with datetime serialization support.
    Pydantic model_dump() returns Python datetime objects for
    DateTime fields — standard json.dumps can't handle these."""
    def default(o):
        if isinstance(o, datetime | date):
            return o.isoformat()
        raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")
    return json.dumps(obj, default=default)

async def get_or_create_conversation(
    db: AsyncSession,
    user: User,
    conversation_id: int | None,
    local_course_id: int | None,
) -> Conversation:
    if conversation_id is not None:
        conversation = await db.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.user_id == user.id,
            )
        )
        if conversation:
            if conversation.course_id is None and local_course_id is not None:
                conversation.course_id = local_course_id
                return conversation
            if (
                local_course_id is not None
                and conversation.course_id is not None
                and conversation.course_id != local_course_id
            ):
                conversation_id = None
            else:
                return conversation

    conversation = Conversation(user_id=user.id, course_id=local_course_id)
    db.add(conversation)
    await db.flush()
    return conversation


async def _resolve_chat_course_context(
    db: AsyncSession,
    user: User,
    message: str,
    requested_local_course_id: int | None,
) -> Course | None:
    """Find the course context in deterministic app code before the LLM runs.

    Local models cannot know our database IDs. Prefer an explicit local ID
    from the client, then a course name mentioned in the prompt, then the
    user's active-course preference.
    """
    if requested_local_course_id is not None:
        return await db.scalar(
            select(Course).where(
                Course.id == requested_local_course_id,
                Course.instructor_id == user.id,
            )
        )

    courses = list(
        await db.scalars(select(Course).where(Course.instructor_id == user.id))
    )
    normalized_message = _normalize_course_text(message)
    for course in courses:
        # Course names are synced locally, so resolve phrases like "COSC 499"
        # before asking the model to choose a database-local course ID.
        normalized_name = _normalize_course_text(course.name)
        if normalized_name and normalized_name in normalized_message:
            return course

    active_course_id = await db.scalar(
        select(UserPreference.active_course_id).where(UserPreference.user_id == user.id)
    )
    if active_course_id is None:
        return None

    return next(
        (course for course in courses if course.id == active_course_id),
        None,
    )


async def _load_stored_intent_preview(
    db: AsyncSession, conversation_id: int, message_id: int
) -> dict | None:
    """Loads and parses a stored message's content, returning it only if
    it's a well-formed intent_preview (has a dict proposed_action) —
    None for anything else (missing row, unparseable JSON, or any other
    shape), so callers don't need to repeat that validation."""
    content = await db.scalar(
        select(Message.content).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not content:
        return None
    try:
        parsed = json.loads(content)
    except json.JSONDecodeError:
        return None
    if (
        isinstance(parsed, dict)
        and parsed.get("intent_preview")
        and isinstance(parsed.get("proposed_action"), dict)
    ):
        return parsed
    return None


def _build_llm_message(
    message: str,
    course: Course | None,
    current_proposed_action: dict | None,
) -> str:
    """Wraps the user's raw message with whatever structured context the
    model needs, rather than leaving it to re-derive that context from
    free text or conversation history — both have proven unreliable in
    practice: a course name in the message can disagree with the actual
    active course, and a modify turn that only restates the part being
    changed (e.g. just the date) can lose already-answered fields
    (description, points_possible) that the model fails to carry forward
    from scrollback on its own."""
    parts = []

    if course is not None:
        parts.append(
            "Course context for this request:\n"
            f"- local_course_id: {course.id}\n"
            f"- course_name: {course.name}\n"
            f"- canvas_course_id: {course.canvas_course_id}\n"
            "Use this local_course_id for course-specific actions; do not "
            "ask the user for internal IDs."
        )

    if current_proposed_action is not None:
        parts.append(
            "Current proposed plan (before this edit):\n"
            f"{json.dumps(current_proposed_action)}\n"
            "The user below is revising this plan, not starting a new "
            "request. Apply their requested change to it and keep every "
            "other field exactly as it is — do not drop description, "
            "points_possible, or any other already-answered field just "
            "because this message doesn't repeat it."
        )

    parts.append(f"User request: {message}")
    return "\n\n".join(parts)


def _plain_text_response(raw_output: str) -> dict | None:
    """Treat plain local-model text as a normal assistant reply.

    If braces are present, assume the model attempted structured JSON and keep
    the stricter parser/error path so malformed internals are not echoed back.
    """
    stripped = raw_output.strip()
    # A local model may answer in ordinary prose. If it looks like attempted
    # JSON, keep the strict parser so malformed structured output is logged
    # safely instead of echoed back to the user.
    if stripped and "{" not in stripped and "}" not in stripped:
        return {"action": "respond", "message": stripped}
    return None


async def log_message(
    db: AsyncSession,
    conversation: Conversation,
    role: str,
    content: str,
) -> Message:
    message = Message(
        conversation_id=conversation.id, role=role, content=content
    )
    db.add(message)
    await db.flush()
    await db.refresh(message)
    return message


async def update_message_content(
    db: AsyncSession,
    conversation_id: int,
    message_id: int,
    new_content: str,
) -> Message:
    """Updates the content of an existing message row in place.
    Used when a user modifies a proposed action — the old intent_preview
    message is overwritten with the new preview so conversation history
    reflects only the latest agreed plan. This prevents the LLM from
    seeing both the old and new preview on the next turn, and keeps the
    messages table as a clean record of current state rather than an
    append-only log of every intermediate draft.

    Ownership is enforced via conversation_id — only messages belonging
    to the given conversation can be updated."""
    message = await db.scalar(
        select(Message).where(
            Message.id == message_id,
            Message.conversation_id == conversation_id,
        )
    )
    if not message:
        raise ToolExecutionError(
            "Preview message not found.",
            log_detail=f"message_id={message_id} not found in conversation_id={conversation_id}",
        )
    message.content = new_content
    await db.flush()
    await db.refresh(message)
    return message


async def _sync_workflow_for_preview(
    db: AsyncSession,
    conversation: Conversation,
    user: User,
    source_user_message_id: int,
    pending_message_id: int | None,
    preview_message_id: int,
    user_prompt: str,
    proposed_action: dict,
    affected_resources: list[dict] | None = None,
) -> None:
    """Creates or updates the Workflow row backing an intent_preview — the
    state machine handle_confirmed_action checks to guarantee an action
    executes at most once. Covers every action, not just WRITE_ACTIONS:
    the system prompt requires *every* action, read or write, to go
    through intent_preview -> confirm, so scoping this to writes only
    would 404 every read-action confirm (e.g. "what courses do I have?")
    — a real regression caught during manual verification, not a
    deliberate design choice. AuditLog writing in handle_confirmed_action
    stays gated to WRITE_ACTIONS separately, since audit rows are only
    ever about actual Canvas mutations.

    Also backfills conversation.course_id from the proposed action the
    first time one is seen, since the client (e.g. the manual test
    harness) doesn't always send local_course_id up front. Only backfills
    when that course actually exists and belongs to this user — both
    conversations.course_id and workflows.course_id are real foreign keys,
    so blindly trusting an LLM-echoed local_course_id here (e.g. one the
    model hallucinated, or a stale/invalid id from client input) raises an
    unhandled IntegrityError instead of the graceful "course not found"
    message _resolve_course already produces at confirm time. Leaving it
    unset here means that existing, tested error path still fires."""
    action_name = proposed_action.get("action")
    resources = affected_resources or []

    if conversation.course_id is None:
        local_course_id = proposed_action.get("local_course_id")
        if local_course_id is not None:
            owned_course = await db.scalar(
                select(Course.id).where(Course.id == local_course_id, Course.instructor_id == user.id)
            )
            if owned_course is not None:
                conversation.course_id = local_course_id

    existing = None
    if pending_message_id:
        existing = await db.scalar(
            select(Workflow).where(
                Workflow.preview_message_id == pending_message_id,
                Workflow.conversation_id == conversation.id,
            )
        )

    if existing:
        # preview_message_id is unique, so a second Workflow can never be
        # created for the same message row — reuse this one regardless of
        # its current status. Reopening an already-settled workflow (only
        # reachable if a client replays a modify against a message id that
        # was already confirmed/cancelled) resets it back to pending with
        # the new proposed action, clearing the stale execution outcome.
        existing.action_name = action_name
        existing.user_prompt = user_prompt
        existing.proposed_action = proposed_action
        existing.affected_resources = resources
        existing.course_id = conversation.course_id
        existing.status = "pending"
        existing.error_detail = None
        existing.executed_at = None
        existing.result_message_id = None
        return

    db.add(
        Workflow(
            conversation_id=conversation.id,
            user_id=user.id,
            course_id=conversation.course_id,
            source_user_message_id=source_user_message_id,
            preview_message_id=preview_message_id,
            action_name=action_name,
            user_prompt=user_prompt,
            proposed_action=proposed_action,
            affected_resources=resources,
            status="pending",
        )
    )


async def _get_recent_messages(
    db: AsyncSession, conversation_id: int
) -> list[dict]:
    """Fetch the last N messages for LLM context. Excludes the most
    recently logged message since generate() appends the current user
    turn explicitly — including it here would cause the current message
    to appear twice in the LLM's context window.

    In a future iteration this step gets replaced by a vector retrieval
    call that fetches semantically relevant history rather than just
    the most recent N messages."""
    rows = await db.scalars(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(desc(Message.id))
        .limit(HISTORY_WINDOW + 1)
    )
    messages = list(rows)
    messages.reverse()
    # drop the last message — it's the current user turn, which generate()
    # will append separately, and including it here causes duplication
    if messages:
        messages = messages[:-1]
    return [
        {"role": m.role, "content": _truncate_history_content(m.content)}
        for m in messages
    ]


def _truncate_history_content(content: str) -> str:
    if len(content) <= HISTORY_MESSAGE_MAX_CHARS:
        return content
    return content[:HISTORY_MESSAGE_MAX_CHARS] + " …[truncated]"


def build_system_prompt() -> str:
    tool_list = "\n".join(
        f"- {name}: {schema.model_json_schema()}"
        for name, schema in ACTION_SCHEMAS.items()
        if name not in {"out_of_scope", "clarify", "intent_preview", "respond"}
    )
    # Nothing else grounds the model in the actual current date — without
    # this, a bare "due October 1st" gets a fabricated, often past, year
    # (observed defaulting to 2024), which then fails the future-date
    # validation on confirm.
    today = datetime.now(UTC).strftime("%Y-%m-%d")

    return f"""You are a Canvas LMS assistant for instructors. You help
with course management, assignments, student submissions, and
communicating with students.

TODAY'S DATE is {today} (YYYY-MM-DD). When the user gives a date without
an explicit year (e.g. "October 1st", "next Friday"), use the nearest
occurrence of that date that falls on or after today — never assume a
past year. due_date must always resolve to a date in the future.

""" + """SCOPE CHECK — do this first, before anything else:
Decide whether the request is about Canvas course management or student
communication. If the request is not about Canvas (e.g. creative
writing, roleplay, general coding help, personal advice, anything
unrelated to teaching), respond ONLY with:
{"action": "out_of_scope", "message": "<brief description of the request>"}

AMBIGUITY CHECK — if the request is in scope but missing information:
If you cannot confidently identify which course, assignment, or
students the user means, respond ONLY with:
{"action": "clarify", "question": "<one specific question>", "partial_plan": <dict>}
Only ask ONE question per turn. Do not ask for information you can infer.

REQUIRED FIELDS — before proposing any write action (create_assignment,
update_assignment, send_message), check every field listed as "required"
in that action's schema below. This includes the action/task type itself
(e.g. don't guess whether the user wants create_assignment vs
update_assignment), and fields like title, description, and due_date.
If any required field is missing or was not stated by the user, use the
AMBIGUITY CHECK format to ask for it. Never invent a placeholder value
and never silently omit a required field from proposed_action.

INTENT PREVIEW — if the request is clear enough to act on:
Before executing any action, always show the user what you are about to do:
{"action": "intent_preview", "summary": "<plain English description>", "proposed_action": <dict>}
The user will confirm, modify, or cancel from here.

CONVERSATION HISTORY:
Previous messages in this conversation are provided below. If this is
a follow-up to a clarification question or a refinement of a previous
plan, incorporate the user's feedback into the updated partial_plan
before responding.

COURSE CONTEXT MISMATCH:
If the user's message names a course that does not match the injected
course_name, always use the injected local_course_id anyway — never ask
which course to use, and never treat this as an AMBIGUITY CHECK case.
Add one short sentence noting the mismatch in your summary or response
text instead.

META QUESTIONS — if the user asks what you can do, asks for help,
or needs a natural language reply that isn't a Canvas tool call, respond with:
{"action": "respond", "message": "<your natural language answer here>"}
Use this for greetings, capability questions, and clarifying what is in scope.

UPDATING AN ASSIGNMENT:
Do not propose update_assignment unless you already know the assignment's
Canvas ID from this conversation (e.g. from a previous fetch_assignments or
fetch_submissions result). If you don't have it yet, propose fetch_assignments
first instead of guessing an ID. assignment_id must come from that data's
"id" field, not "local_id". Only include the fields the user actually wants
changed — leave every other field out of proposed_action entirely, since
anything omitted is preserved automatically.

MESSAGING STUDENTS:
send_message can either post a public class announcement (when
recipient_canvas_user_ids is omitted) or send a private Canvas conversation
to specific students (when recipient_canvas_user_ids is provided). Use
fetch_students or fetch_submissions first when you need to identify the
correct Canvas user IDs. Always require local_course_id. Get clear subject
and body content from the user before proposing the action rather than
inventing wording yourself. The user can ask you to revise the draft before
confirming — treat that like any other follow-up refinement.

AVAILABLE ACTIONS (only used inside proposed_action):
""" + tool_list


async def handle_chat_message(
    db: AsyncSession,
    user: User,
    message: str,
    local_course_id: int | None,
    conversation_id: int | None,
    pending_message_id: int | None = None,
) -> tuple[Conversation, dict, bool]:
    """Main chat handler. Two distinct flows:

    Normal turn (pending_message_id=None):
      logs user message, calls LLM, parses response, executes tool,
      logs assistant message as a new row, returns result.

    Modify turn (pending_message_id=<id>):
      same as normal, but if the result is an intent_preview, the old
      preview message is overwritten in place rather than a new row
      being appended. This keeps conversation history clean so the LLM
      sees only the latest agreed plan on subsequent turns."""

    course_context = await _resolve_chat_course_context(
        db, user, message, local_course_id
    )
    resolved_local_course_id = course_context.id if course_context else local_course_id
    conversation = await get_or_create_conversation(
        db, user, conversation_id, resolved_local_course_id
    )
    if course_context is None and conversation.course_id is not None:
        course_context = await db.scalar(
            select(Course).where(
                Course.id == conversation.course_id,
                Course.instructor_id == user.id,
            )
        )
    if conversation.course_id is None and course_context is not None:
        conversation.course_id = course_context.id
    user_msg = await log_message(db, conversation, role="user", content=message)

    history = await _get_recent_messages(db, conversation.id)

    stored_preview = None
    current_proposed_action = None
    if pending_message_id is not None:
        stored_preview = await _load_stored_intent_preview(
            db, conversation.id, pending_message_id
        )
        if stored_preview:
            current_proposed_action = stored_preview.get("proposed_action")

    system_prompt = build_system_prompt()
    adapter = get_llm_adapter({"provider": settings.DEFAULT_LLM_PROVIDER})

    try:
        raw_output = await asyncio.wait_for(
            adapter.generate(
                system_prompt,
                _build_llm_message(message, course_context, current_proposed_action),
                history=history,
                timeout=LLM_TIMEOUT_SECONDS,
            ),
            timeout=LLM_TIMEOUT_SECONDS,
        )
    except TimeoutError:
        log_detail = f"LLM request timed out after {LLM_TIMEOUT_SECONDS}s"
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return (
            conversation,
            {"error": "The assistant took too long to respond. Please try again."},
            True,
        )
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 429:
            log_detail = "Groq rate limit hit"
            user_message = "The assistant is temporarily rate-limited. Please wait a moment and try again."
        else:
            log_detail = f"LLM API error: {e.response.status_code}"
            user_message = "The assistant service returned an error. Please try again shortly."
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return conversation, {"error": user_message}, True
    except Exception as e:
        log_detail = f"LLM request failed: {type(e).__name__}: {e}"
        await log_message(db, conversation, role="assistant", content=log_detail)
        await db.commit()
        return (
            conversation,
            {"error": "The assistant is currently unavailable. Please try again shortly."},
            True,
        )

    try:
        text_reply = _plain_text_response(raw_output)
        if text_reply is not None:
            result = text_reply
        else:
            action = parse_action(raw_output)
            if action.action in WRITE_ACTIONS:
                # The model named a Canvas-mutating action directly instead
                # of wrapping it in intent_preview like the system prompt
                # asks. Not every model follows that instruction reliably
                # (smaller local models especially) — forcing it through
                # the same intent_preview path here, rather than trusting
                # the LLM, is what actually guarantees nothing mutates
                # Canvas without the user seeing and confirming a preview
                # first, regardless of which provider generated the reply.
                action = IntentPreviewAction(
                    summary=f"I'll {action.action.replace('_', ' ')} as described below. Please review before confirming.",
                    proposed_action=action.model_dump(),
                )
            result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="assistant", content=e.log_detail)
        await db.commit()
        return conversation, {"error": e.user_message}, True
    except HTTPException as e:
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        error_detail = f"HTTPException {e.status_code}: {detail}"
        await log_message(db, conversation, role="assistant", content=error_detail)
        await db.commit()
        return conversation, {"error": detail}, True

    # Log the assistant result — if this is a modify turn superseding a
    # previous intent_preview, overwrite that message in place rather than
    # appending a new row, so the LLM's next turn sees only the updated plan.
    # Before overwriting, snapshot the version being replaced (already
    # loaded above as stored_preview, to build the modify context) onto
    # the new result as previous_*, so the client can show a one-step diff
    # (current vs. the immediately preceding revision only — anything
    # older than that was already discarded the same way on the prior
    # modify round).
    if result.get("intent_preview") and pending_message_id:
        if stored_preview:
            result["previous_proposed_action"] = stored_preview.get("proposed_action")
            result["previous_summary"] = stored_preview.get("summary")

        assistant_msg = await update_message_content(
            db, conversation.id, pending_message_id, _json_dumps(result)
        )
    else:
        assistant_msg = await log_message(
            db, conversation, role="assistant", content=_json_dumps(result)
        )

    if result.get("intent_preview"):
        preview_metadata = result.get("preview_metadata") or {}
        await _sync_workflow_for_preview(
            db, conversation, user,
            source_user_message_id=user_msg.id,
            pending_message_id=pending_message_id,
            preview_message_id=assistant_msg.id,
            user_prompt=message,
            proposed_action=result.get("proposed_action", {}),
            affected_resources=preview_metadata.get("affected_resources", []),
        )

    await db.commit()

    # attach the stored message ID so the client can confirm by ID
    if result.get("intent_preview"):
        result["pending_message_id"] = assistant_msg.id

    return conversation, result, False


async def _claim_pending_workflow(db: AsyncSession, workflow: Workflow, new_status: str) -> bool:
    """Atomically transitions a workflow from pending to new_status via a
    conditional UPDATE, not a read-then-check race — two simultaneous
    requests each run in their own DB transaction, so a plain
    SELECT-then-check would let both pass under READ COMMITTED. The
    conditional UPDATE takes a row lock instead: a concurrent duplicate
    blocks until the first transaction commits, then correctly
    re-evaluates against committed state and affects 0 rows. Returns
    whether the claim succeeded; caller must commit immediately after a
    successful claim to release the row lock before doing anything slow.
    Shared by handle_confirmed_action (pending->executing) and
    handle_cancelled_action (pending->cancelled) — same race, same fix."""
    claim = await db.execute(
        sa_update(Workflow)
        .where(Workflow.id == workflow.id, Workflow.status == "pending")
        .values(status=new_status)
    )
    if claim.rowcount > 0:
        return True
    # SQLAlchemy's default synchronize_session='evaluate' strategy re-checks
    # the bulk UPDATE's WHERE clause against workflow's in-memory attributes,
    # not the DB row — on a 0-row update it can still apply .values() to the
    # loaded object, leaving workflow.status holding the just-attempted
    # target instead of the row's real, currently-committed value. Refresh
    # just the status column (not attribute_names=None / the whole object)
    # so callers building a 409 message report what's actually true, without
    # expiring the eagerly-loaded `user` relationship some callers depend on
    # — an async lazy-load on that would fail outside a greenlet context.
    await db.refresh(workflow, attribute_names=["status"])
    return False


async def handle_confirmed_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
) -> tuple[Conversation, dict, bool]:
    """Executes the action stored in a previous intent_preview message.
    The client confirms by message ID only — it cannot redefine what
    action gets executed. The server loads the proposed_action from its
    own Workflow record, verifying ownership and that the workflow is
    still pending, before executing anything.

    Replay safety: the pending->executing transition is an atomic
    conditional UPDATE (`WHERE status='pending'`), not a Python-side
    read-then-check — two simultaneous confirm requests each run in
    their own DB transaction, so a plain SELECT-then-check race would let
    both pass under READ COMMITTED. The conditional UPDATE takes a row
    lock instead: a concurrent duplicate blocks until the first
    transaction commits, then correctly re-evaluates against committed
    state and affects 0 rows. Committing immediately after (rather than
    holding the lock through the Canvas call) means a concurrent
    duplicate gets an instant 409 instead of hanging.

    This is PATH B in the dispatcher's two-path architecture: by the
    time execute_tool is called here, the user has already confirmed,
    so write action cases call Canvas directly without generating another
    preview."""

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    workflow = await db.scalar(
        select(Workflow).where(
            Workflow.preview_message_id == pending_message_id,
            Workflow.conversation_id == conversation_id,
        )
    )
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail="Preview not found in this conversation.",
        )

    if not await _claim_pending_workflow(db, workflow, "executing"):
        raise HTTPException(
            status_code=409,
            detail=f"This action is no longer pending (status: {workflow.status}).",
        )
    await db.commit()
    workflow.status = "executing"

    # reload user with relationships eagerly loaded for this db session —
    # the user object from get_current_user may have canvas_connections
    # loaded in a different session context, causing greenlet errors when
    # execute_tool accesses them during async execution
    from sqlalchemy import select as sa_select
    user = await db.scalar(
        sa_select(User)
        .where(User.id == user.id)
        .options(selectinload(User.canvas_connections))
    )

    await log_message(db, conversation, role="user", content="[confirmed action]")

    try:
        action = parse_action(json.dumps(workflow.proposed_action))
        result = await execute_tool(db, user, action)
    except ToolExecutionError as e:
        await log_message(db, conversation, role="assistant", content=e.log_detail)
        workflow.status = "failed"
        workflow.error_detail = e.log_detail
        await db.commit()
        return conversation, {"error": e.user_message}, True
    except HTTPException as e:
        # Semantic validators (e.g. validate_assignment_for_create) and
        # services/canvas.py raise HTTPException directly rather than
        # ToolExecutionError. Left uncaught, this propagates past
        # ChatResponse and the client gets a bare {"detail": ...} body
        # with no "reply" key. Fold it into the same error-reply shape
        # so the user actually sees why the confirmed action failed.
        detail = e.detail if isinstance(e.detail, str) else str(e.detail)
        error_detail = f"HTTPException {e.status_code}: {detail}"
        await log_message(db, conversation, role="assistant", content=error_detail)
        workflow.status = "failed"
        workflow.error_detail = error_detail
        await db.commit()
        return conversation, {"error": detail}, True

    result_msg = await log_message(
        db, conversation, role="assistant", content=_json_dumps(result)
    )
    workflow.status = "executed"
    workflow.executed_at = datetime.now(UTC)
    workflow.result_message_id = result_msg.id
    if result.get("affected_resources"):
        workflow.affected_resources = result["affected_resources"]

    # AuditLog is only ever about actual Canvas mutations — read actions
    # (e.g. fetch_courses) now get Workflow rows too (see
    # _sync_workflow_for_preview), but must NOT get an audit row: their
    # action_name isn't in _AUDIT_RESOURCE_MAP and would violate
    # audit_logs' resource_type/operation CHECK constraints if written.
    if workflow.action_name in WRITE_ACTIONS:
        resource_type, operation = _AUDIT_RESOURCE_MAP.get(
            workflow.action_name, (workflow.action_name, "create")
        )
        if workflow.action_name == "send_message":
            # Use the resource type the write actually produced (announcement
            # vs. conversation) instead of the static default above, since
            # the same action can go either way depending on whether
            # recipient_canvas_user_ids was set.
            created_resource = next(
                (
                    resource
                    for resource in result.get("affected_resources", [])
                    if resource.get("status") == "created"
                ),
                None,
            )
            if created_resource and created_resource.get("type"):
                resource_type = created_resource["type"]
        # result["data"] comes from CanvasWriteResult.to_dict()'s plain
        # .model_dump() (not mode="json"), so it can still contain native
        # datetime objects — JSONB needs JSON-safe values. Round-trip
        # through the same _json_dumps used for Message.content to
        # normalize them.
        data = json.loads(_json_dumps(result.get("data") or {}))
        resource_id = str(data["id"]) if isinstance(data, dict) and data.get("id") is not None else None
        db.add(
            AuditLog(
                user_id=user.id,
                workflow_id=workflow.id,
                course_id=workflow.course_id,
                action=workflow.action_name,
                resource_type=resource_type,
                resource_id=resource_id,
                operation=operation,
                status="success",
                after_data=data,
                request_payload=workflow.proposed_action,
            )
        )

    await db.commit()
    return conversation, result, False


async def handle_cancelled_action(
    db: AsyncSession,
    user: User,
    conversation_id: int,
    pending_message_id: int,
) -> tuple[Conversation, dict, bool]:
    """Cancels the action stored in a previous intent_preview message.
    Mirrors handle_confirmed_action's load/verify steps, but never calls
    execute_tool — cancelling never touches Canvas, only the Workflow's
    status. Uses the same atomic claim as confirm (pending->cancelled
    instead of pending->executing), which means a second cancel attempt,
    or a confirm attempt after a cancel, both 409 for the identical
    structural reason: only one pending->X transition can ever win.

    Deliberately does NOT overwrite the preview Message's content (unlike
    the "modify" flow) — messages stays the immutable transcript of what
    was proposed, Workflow.status is the mutable state layer that actually
    blocks re-use. Blurring that line again is exactly what the
    Workflow/AuditLog redesign was for."""

    conversation = await db.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
    )
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    workflow = await db.scalar(
        select(Workflow).where(
            Workflow.preview_message_id == pending_message_id,
            Workflow.conversation_id == conversation_id,
        )
    )
    if not workflow:
        raise HTTPException(
            status_code=404,
            detail="Preview not found in this conversation.",
        )

    if not await _claim_pending_workflow(db, workflow, "cancelled"):
        raise HTTPException(
            status_code=409,
            detail=f"This action is no longer pending (status: {workflow.status}).",
        )
    await db.commit()
    workflow.status = "cancelled"

    # Workflow doesn't store the LLM's natural-language summary itself
    # (only structured action_name/proposed_action) — load the preview
    # message it's still linked to for a human-readable description.
    preview_message = await db.scalar(
        select(Message).where(Message.id == workflow.preview_message_id)
    )
    try:
        stored = json.loads(preview_message.content) if preview_message else {}
    except (json.JSONDecodeError, TypeError):
        stored = {}
    cancelled_action = stored.get("summary", workflow.action_name)

    # source_user_message_id is a direct FK, pinned to the first turn that
    # started this preview chain — reliable across any number of "modify"
    # revisions without needing to infer position from message ids.
    source_message = await db.scalar(
        select(Message).where(Message.id == workflow.source_user_message_id)
    )
    original_request = source_message.content if source_message else workflow.user_prompt

    await log_message(db, conversation, role="user", content="[cancelled action]")

    result = {
        "action": "cancelled",
        "cancelled": True,
        "cancelled_action": cancelled_action,
        "cancelled_proposed_action": workflow.proposed_action,
        "original_request": original_request,
        "message": (
            f'Cancelled — no changes were made. Your original request '
            f'("{original_request}") was not completed.'
        ),
    }
    await log_message(db, conversation, role="assistant", content=_json_dumps(result))

    await db.commit()
    return conversation, result, False


async def get_conversation_with_messages(
    db: AsyncSession, user: User, conversation_id: int
) -> Conversation | None:
    return await db.scalar(
        select(Conversation)
        .where(
            Conversation.id == conversation_id,
            Conversation.user_id == user.id,
        )
        .options(selectinload(Conversation.messages))
    )
