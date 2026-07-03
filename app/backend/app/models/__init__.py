# Import all models here so SQLAlchemy registers them with Base.metadata.
# This file is imported by main.py to ensure all tables are created
# on startup and all relationships can be resolved correctly.
from app.models.assignment import Assignment
from app.models.audit_log_session import AuditLogSession
from app.models.canvas_connection import CanvasConnection
from app.models.conversation import Conversation
from app.models.course import Course
from app.models.message import Message
from app.models.message_template import MessageTemplate
from app.models.session import Session
from app.models.student import Student
from app.models.submission import Submission
from app.models.user import User
from app.models.user_preference import UserPreference
from app.models.workflow import Workflow

__all__ = [
    "Assignment",
    "AuditLogSession",
    "CanvasConnection",
    "Conversation",
    "Course",
    "Message",
    "MessageTemplate",
    "Session",
    "Student",
    "Submission",
    "User",
    "UserPreference",
    "Workflow",
]
