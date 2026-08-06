"""Schema note: defines API-facing history request/response shapes; changes here affect frontend service contracts."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.mcp_tools.schemas import ACTION_CLASSIFICATION, is_reversible, is_undoable
from app.models.workflow import Workflow


class ReversalMetadata(BaseModel):
    status: str
    available: bool
    option_label: str | None
    warning: str | None
    unavailable_reason: str | None
    recovery_instructions: str
    result_message: str | None
    reversed_at: datetime | None


class WorkflowHistoryItem(BaseModel):
    id: int
    # Null for form-created writes that were never tied to a chat turn.
    conversation_id: int | None
    action_name: str
    user_prompt: str
    status: str
    proposed_action: dict[str, Any]
    affected_resources: list[dict[str, Any]]
    created_at: datetime
    executed_at: datetime | None = None
    user_name: str
    # Whether this action *type* has a working undo path at all (see
    # mcp_tools.schemas.UNDOABLE_ACTIONS) — the frontend still also checks
    # status == "executed" and undone_at is None before showing an Undo
    # affordance, since undoable-in-principle isn't the same as undoable
    # right now.
    undoable: bool = False
    undone_at: datetime | None = None
    reversal: ReversalMetadata

    @classmethod
    def from_workflow(cls, workflow: Workflow) -> "WorkflowHistoryItem":
        reversal = build_reversal_metadata(workflow)
        return cls(
            id=workflow.id,
            conversation_id=workflow.conversation_id,
            action_name=workflow.action_name,
            user_prompt=workflow.user_prompt,
            status=workflow.status,
            proposed_action=workflow.proposed_action,
            affected_resources=workflow.affected_resources,
            created_at=workflow.created_at,
            executed_at=workflow.executed_at,
            user_name=workflow.user.name,
            undoable=is_undoable(workflow.action_name),
            undone_at=workflow.undone_at,
            reversal=reversal,
        )


def build_reversal_metadata(workflow: Workflow) -> ReversalMetadata:
    """Builds UI-facing reversal metadata from the workflow lifecycle.

    This intentionally centralizes the wording and availability rules so the
    frontend does not need to infer why a reversal is unavailable from several
    fields (`status`, `undoable`, `undone_at`, and action classification).
    """
    action = workflow.action_name
    classification = ACTION_CLASSIFICATION.get(action)
    undoable = is_undoable(action)

    if workflow.undone_at:
        return ReversalMetadata(
            status="reversed",
            available=False,
            option_label=None,
            warning=None,
            unavailable_reason="This workflow has already been reversed.",
            recovery_instructions="Review the reversal audit entry for the Canvas change that was applied.",
            result_message=_reversal_result_message(action),
            reversed_at=workflow.undone_at,
        )

    if workflow.status != "executed":
        return ReversalMetadata(
            status="unavailable",
            available=False,
            option_label=None,
            warning=None,
            unavailable_reason=f"Only executed workflows can be reversed; this workflow is {workflow.status}.",
            recovery_instructions="Complete or cancel the pending workflow before considering reversal.",
            result_message=None,
            reversed_at=None,
        )

    if undoable:
        return ReversalMetadata(
            status="available",
            available=True,
            option_label=_reversal_option_label(action),
            warning=_reversal_warning(action),
            unavailable_reason=None,
            recovery_instructions="Use the reversal option to apply the stored rollback through Canvas.",
            result_message=None,
            reversed_at=None,
        )

    if classification == "irreversible":
        reason = "Canvas does not provide a one-click reversal path for this operation."
        instructions = _irreversible_recovery_instructions(action)
    elif is_reversible(action):
        reason = "This operation can be corrected later, but automated rollback is not implemented for it yet."
        instructions = (
            "Open Canvas and manually apply a corrective change, then keep this workflow history row as the audit trail."
        )
    else:
        reason = "This action type is not recognized by the reversal service."
        instructions = "Review the Canvas state manually before taking further action."

    return ReversalMetadata(
        status="unavailable",
        available=False,
        option_label=None,
        warning=None,
        unavailable_reason=reason,
        recovery_instructions=instructions,
        result_message=None,
        reversed_at=None,
    )


def _reversal_option_label(action: str) -> str:
    if action == "create_assignment":
        return "Delete created assignment"
    if action == "create_quiz":
        return "Delete created quiz"
    return "Restore previous assignment state"


def _reversal_warning(action: str) -> str:
    if action == "create_assignment":
        return "Reversing this workflow deletes the assignment created in Canvas."
    if action == "create_quiz":
        return "Reversing this workflow deletes the quiz created in Canvas."
    return "Reversing this workflow overwrites the current assignment fields with the stored prior values."


def _reversal_result_message(action: str) -> str:
    if action == "create_assignment":
        return "The created assignment was deleted from Canvas."
    if action == "create_quiz":
        return "The created quiz was deleted from Canvas."
    return "The previous assignment state was restored in Canvas."


def _irreversible_recovery_instructions(action: str) -> str:
    if action == "send_message":
        return "Send a follow-up Canvas message with the correction or clarification."
    if action == "update_grade":
        return "Open the gradebook and submit a corrective grade update with a note explaining the change."
    return "Open Canvas and apply a manual correction if one is appropriate."


class WorkflowHistoryResponse(BaseModel):
    items: list[WorkflowHistoryItem]
    total: int


class AuditLogResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_role: str
    workflow_id: int | None
    course_id: int | None
    action: str
    resource_type: str
    resource_id: str | None
    operation: str
    status: str
    before_data: dict[str, Any] | None
    after_data: dict[str, Any] | None
    request_payload: dict[str, Any] | None
    timestamp: datetime
