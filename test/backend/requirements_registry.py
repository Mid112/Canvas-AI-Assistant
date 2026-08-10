"""Requirement IDs and their wording, for the traceability report.

This is the full UR/FR list from the project requirements document, copied here
so the report can show a plain-English statement next to the tests that
demonstrate it instead of a file path and a line range that goes stale the
moment someone edits.

Listing every requirement — not only the ones with tests — is the point. A
traceability matrix that omits untested requirements cannot show a gap, and the
gaps are the part worth reading.

Tag a test with ``@pytest.mark.requirement("FR10.4")`` and it appears in the
report automatically. Nothing else needs updating.
"""

from __future__ import annotations

USER_REQUIREMENTS: dict[str, str] = {
    # 1.1 Administrator
    "UR1.1": "Must log in securely and access administrative functions.",
    "UR1.2": (
        "Must be able to create, update, enable, disable, and manage "
        "instructor accounts."
    ),
    "UR1.3": "Must be able to revoke instructor access when required.",
    "UR1.4": "Must be able to monitor system health and operational status.",
    "UR1.5": "Must be able to review audit logs and security-related events.",
    "UR1.6": "Must be able to review failed Canvas and AI operations.",
    "UR1.7": (
        "Must be able to troubleshoot the system without accessing sensitive "
        "credentials."
    ),
    # 1.2 Instructor
    "UR2.1": (
        "Must be able to securely create account, authenticate and access the "
        "application."
    ),
    "UR2.2": "Must be able to securely connect a Canvas API token.",
    "UR2.3": "Must be able to replace or remove a stored Canvas API token.",
    "UR2.4": "Must be able to view Canvas courses associated with the connected token.",
    "UR2.5": "Must be able to select an active course.",
    "UR2.6": (
        "Must be able to view course information, students, assignments, and "
        "submissions."
    ),
    "UR2.7": "Must be able to analyze missing submissions.",
    "UR2.8": "Must be able to analyze late submissions.",
    "UR2.9": "Must be able to search and filter course information.",
    "UR2.10": "Must be able to access a dashboard summarizing course activity.",
    "UR2.11": "Must be able to interact with the system using natural-language requests.",
    "UR2.12": "Must be able to ask questions about course data.",
    "UR2.13": "Must be able to receive explanations of proposed actions before execution.",
    "UR2.14": "Must be able to create Canvas assignments.",
    "UR2.15": "Must be able to update assignment details and dates.",
    "UR2.16": "Must be able to create Canvas quizzes.",
    "UR2.17": "Must be able to list submissions for assignments.",
    "UR2.18": "Must be able to draft Canvas messages to selected students.",
    "UR2.19": "Must be able to review and edit messages before sending.",
    "UR2.20": "Must be able to draft feedback comments for selected submissions.",
    "UR2.21": "Must be able to review and approve feedback before posting.",
    "UR2.22": "Must be able to modify grades through approved workflows.",
    "UR2.23": "Must be able to preview Canvas-modifying actions before execution.",
    "UR2.24": "Must explicitly approve Canvas-modifying actions before execution.",
    "UR2.25": "Must be able to cancel a proposed action before execution.",
    "UR2.26": "Must be able to view a history of previous actions.",
    "UR2.27": "Must be able to view previous assistant requests and their outcomes.",
    "UR2.28": "Must be able to determine whether a previous action can be reversed.",
    "UR2.29": "Must receive clear feedback when requests cannot be completed safely.",
}

FUNCTIONAL_REQUIREMENTS: dict[str, str] = {
    # 2.1 Authentication, Accounts and Canvas Credentials
    "FR1.1": (
        "The system must support instructor login before any Canvas-related "
        "functionality is accessible."
    ),
    "FR1.2": (
        "The system will allow administrators to create, update, enable, "
        "disable, and manage instructor accounts."
    ),
    "FR1.3": "The system will allow administrators to revoke instructor access.",
    "FR1.4": (
        "The system will allow instructors to enter, replace, or remove a "
        "Canvas API token."
    ),
    "FR1.5": "Canvas API tokens must be encrypted before storage.",
    "FR1.6": "The system must validate Canvas API tokens before use.",
    "FR1.7": (
        "Stored Canvas API tokens must never be exposed to users after submission."
    ),
    "FR1.8": (
        "Canvas operations must be performed using the authenticated "
        "instructor's stored Canvas API token."
    ),
    "FR1.9": (
        "The system must prevent one instructor from accessing another "
        "instructor's Canvas API token."
    ),
    "FR1.10": "The system must support logout and session expiration.",
    # 2.2 Course Dashboard and Canvas Data Access
    "FR2.1": "The system will retrieve courses available to the connected instructor.",
    "FR2.2": "The system will allow instructors to select an active course.",
    "FR2.3": "The system will retrieve students for the selected course.",
    "FR2.4": "The system will retrieve assignments for the selected course.",
    "FR2.5": "The system will retrieve submissions for selected assignments.",
    "FR2.6": "The dashboard will display course-level summary information.",
    "FR2.7": (
        "The dashboard will display assignment-level information and "
        "submission status."
    ),
    "FR2.8": (
        "The system will identify submitted, missing, late, and graded "
        "submissions where Canvas provides the required information."
    ),
    "FR2.9": "The dashboard will provide suggested actions and workflow shortcuts.",
    "FR2.10": (
        "Canvas will be treated as the source of truth for course and "
        "assignment information."
    ),
    # 2.3 Natural-Language Assistant
    "FR3.1": "The system will provide a chat-style natural-language interface.",
    "FR3.2": "The assistant will support approved Canvas course-management workflows.",
    "FR3.3": (
        "The assistant will interpret user requests and convert them into "
        "structured actions."
    ),
    "FR3.4": (
        "The assistant will request clarification when information is "
        "ambiguous or incomplete."
    ),
    "FR3.5": "The assistant will display the interpreted intent before execution.",
    "FR3.6": (
        "The assistant will support: listing courses, students, assignments "
        "and submissions; creating assignments; updating assignment dates; "
        "drafting student messages; drafting feedback comments; creating "
        "quizzes; modifying grades."
    ),
    "FR3.7": "The assistant will explain unsupported requests and prevent execution.",
    "FR3.8": (
        "The assistant must not invent Canvas information that has not been "
        "retrieved from Canvas."
    ),
    "FR3.9": (
        "The assistant will scope requests to the selected active course "
        "unless another course is explicitly specified."
    ),
    # 2.4 Assignment and Quiz Management
    "FR4.1": "The system will support creation of Canvas assignments.",
    "FR4.2": (
        "The system will support updating assignment details including "
        "assignment dates."
    ),
    "FR4.3": "The system will support creation of Canvas quizzes.",
    "FR4.4": (
        "Assignment and quiz information must be validated before submission "
        "to Canvas."
    ),
    "FR4.5": (
        "Assignment and quiz creation or modification must require preview and "
        "confirmation."
    ),
    # 2.5 Submission Analysis and Grading
    "FR5.1": (
        "The system will identify students with missing submissions for a "
        "selected assignment."
    ),
    "FR5.2": (
        "The system will identify students with late submissions for a "
        "selected assignment."
    ),
    "FR5.3": "The system will display submission summaries and affected student lists.",
    "FR5.4": (
        "The system will support grade modification workflows through approved "
        "Canvas operations."
    ),
    "FR5.5": "Grade modifications must require preview and confirmation.",
    # 2.6 Canvas Messaging and Feedback
    "FR6.1": "The system will support generation of draft Canvas messages.",
    "FR6.2": "Instructors will be able to review and edit messages before sending.",
    "FR6.3": "Message delivery must require preview and confirmation.",
    "FR6.4": (
        "The system will support generation of text feedback comments for "
        "selected submissions."
    ),
    "FR6.5": "Feedback posting must require preview and confirmation.",
    "FR6.6": "Messaging and feedback actions must be recorded in action history.",
    # 2.7 Dry-Run Preview and Confirmation
    "FR7.1": (
        "Every Canvas-modifying action must generate a dry-run preview before "
        "execution."
    ),
    "FR7.2": (
        "The preview must summarize the proposed action and affected Canvas "
        "resources."
    ),
    "FR7.3": "The preview must identify whether an action is reversible.",
    "FR7.4": "Users must explicitly confirm Canvas-modifying actions before execution.",
    "FR7.5": "Users must be able to cancel proposed actions.",
    "FR7.6": (
        "The system will classify actions as read-only, modifying, or irreversible."
    ),
    # 2.8 Action History and Limited Reversal
    "FR8.1": "The system must maintain a user-visible action history.",
    "FR8.2": (
        "Action history must include the original request, action performed, "
        "execution status, timestamp, and affected Canvas resources."
    ),
    "FR8.3": (
        "The system will maintain a history of assistant requests and "
        "associated actions."
    ),
    "FR8.4": (
        "The system will support limited reversal of supported actions where "
        "safe and practical."
    ),
    "FR8.5": "The system must explain when reversal is unavailable.",
    # 2.9 AI Validation and MCP Integration
    "FR9.1": "The AI model must not directly access Canvas APIs.",
    "FR9.2": (
        "All Canvas operations must be routed through the backend and "
        "MCP/tool-server layer."
    ),
    "FR9.3": "The backend must validate AI-generated actions before execution.",
    "FR9.4": (
        "The backend must reject malformed, unsupported, ambiguous, "
        "unauthorized, or unsafe actions."
    ),
    "FR9.5": "The MCP/tool-server layer will expose only approved Canvas operations.",
    "FR9.6": (
        "The project must include a Dockerized MCP server or equivalent "
        "tool-execution layer."
    ),
    # 2.10 Security and Privacy
    "FR10.1": "Canvas API tokens and AI API keys must be encrypted at rest.",
    "FR10.2": (
        "Sensitive credentials must never appear in logs, error messages, API "
        "responses, repositories, or user interfaces."
    ),
    "FR10.3": "Student information must only be visible to authorized users.",
    "FR10.4": (
        "The system must minimize student-identifiable information sent to AI "
        "services."
    ),
    "FR10.5": (
        "The backend must validate all Canvas-modifying actions before "
        "forwarding requests to Canvas."
    ),
    # 2.11 Reliability and Error Handling
    "FR11.1": "The system must provide meaningful user-facing error messages.",
    "FR11.2": "The system must safely handle Canvas API failures.",
    "FR11.3": "The system must safely handle incomplete or unavailable Canvas data.",
    "FR11.4": (
        "The system must prevent duplicate execution of Canvas-modifying actions."
    ),
    # 2.12 Administration and Deployment
    "FR12.1": (
        "The system will provide administrators with operational health information."
    ),
    "FR12.2": "The system will support monitoring of failed Canvas and AI operations.",
    "FR12.3": "The application will be implemented as a web-based system.",
    "FR12.4": (
        "The project will include a Docker Compose configuration for local "
        "deployment."
    ),
    "FR12.5": "The project will include developer setup and deployment documentation.",
    "FR12.6": (
        "The system architecture will separate the frontend, backend, "
        "database, Canvas integration layer, and MCP/tool-server components."
    ),
    # 2.13 Scope Constraints
    "FR13.1": (
        "The MVP will not support autonomous Canvas modifications without "
        "explicit instructor approval."
    ),
    "FR13.2": (
        "The MVP will not support direct Canvas API execution that bypasses "
        "backend validation."
    ),
    "FR13.3": "The MVP will not support institution-wide Canvas administration.",
    "FR13.4": "The MVP will not support unrestricted deletion of Canvas resources.",
    "FR13.5": "The MVP will not support arbitrary user-defined Canvas API calls.",
}

REQUIREMENTS: dict[str, str] = {**USER_REQUIREMENTS, **FUNCTIONAL_REQUIREMENTS}

# Requirements the team has decided are demonstrated by walking through the
# running application rather than by an automated test — marked "demo" in the
# requirements document. The report shows these as a distinct state so that
# "no automated test" reads as a deliberate choice for these and as an
# unfilled gap for everything else.
DEMO_ONLY: frozenset[str] = frozenset(
    {
        "UR1.7",
        "UR2.11",
        "UR2.12",
        "UR2.20",
    }
)

# Requirements the team has agreed on but which are not yet written into the
# requirements document. Kept separate so the report can flag them as needing a
# document update rather than silently inventing an official-looking ID.
PROPOSED: dict[str, str] = {}


def requirement_text(requirement_id: str) -> str | None:
    return REQUIREMENTS.get(requirement_id) or PROPOSED.get(requirement_id)


def is_proposed(requirement_id: str) -> bool:
    return requirement_id in PROPOSED


def is_demo_only(requirement_id: str) -> bool:
    return requirement_id in DEMO_ONLY
