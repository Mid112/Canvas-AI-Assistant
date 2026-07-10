# Import all models here so SQLAlchemy registers them with Base.metadata.
from app.models.assignment import Assignment
from app.models.audit_log import AuditLog
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.canvas_course_name import CanvasCourseName
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message import Message
from app.models.message_draft import MessageDraft
from app.models.message_template import MessageTemplate
from app.models.password_reset_token import PasswordResetToken
from app.models.session import Session
from app.models.student import Student
from app.models.submission import Submission
from app.models.system_setting import SystemSetting
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow

__all__ = [
    "Assignment",
    "AuditLog",
    "AuditLogSession",
    "CanvasConnection",
    "CanvasCourseName",
    "Conversation",
    "Course",
    "Message",
    "MessageDraft",
    "MessageTemplate",
    "PasswordResetToken",
    "Session",
    "Student",
    "Submission",
    "SystemSetting",
    "User",
    "UserPreference",
    "Workflow",
]
