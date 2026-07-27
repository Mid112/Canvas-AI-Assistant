# Import all models here so SQLAlchemy registers them with Base.metadata.
from app.models.ai_call_health import AiCallHealth
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.canvas_idempotency_key import CanvasIdempotencyKey
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.deferred_assistant_request import DeferredAssistantRequest
from app.models.failed_operation import FailedOperation
from app.models.grade_history import GradeHistory
from app.models.health_check import HealthCheck
from app.models.instructor_llm_connection import InstructorLlmConnection
from app.models.llm_response_cache import LlmResponseCache
from app.models.message import Message
from app.models.message_draft import MessageDraft
from app.models.message_template import MessageTemplate
from app.models.password_reset_token import PasswordResetToken
from app.models.resolved_set import ResolvedSet
from app.models.session import Session
from app.models.student import Student
from app.models.submission import Submission
from app.models.support_ticket import SupportTicket
from app.models.system_setting import SystemSetting
from app.models.tool_call_log import ToolCallLog
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow

__all__ = [
    "AiCallHealth",
    "Assignment",
    "AuditLog",
    "AuditLogSession",
    "CanvasConnection",
    "CanvasCourseName",
    "CanvasIdempotencyKey",
    "Conversation",
    "Course",
    "DeferredAssistantRequest",
    "FailedOperation",
    "GradeHistory",
    "HealthCheck",
    "InstructorLlmConnection",
    "LlmResponseCache",
    "Message",
    "MessageDraft",
    "MessageTemplate",
    "PasswordResetToken",
    "ResolvedSet",
    "Session",
    "Student",
    "Submission",
    "SupportTicket",
    "SystemSetting",
    "ToolCallLog",
    "User",
    "UserPreference",
    "Workflow",
]
