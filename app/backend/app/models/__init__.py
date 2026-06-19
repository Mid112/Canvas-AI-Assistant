# Import all models here so SQLAlchemy registers them with Base.metadata.
# This file is imported by main.py to ensure all tables are created
# on startup and all relationships can be resolved correctly.
from app.models.user import User
from app.models.canvas_connection import CanvasConnection
from app.models.session import Session
from app.models.course import Course
from app.models.assignment import Assignment
from app.models.submission import Submission
from app.models.conversation import Conversation
from app.models.message import Message
from app.models.workflow import Workflow
from app.models.audit_log import AuditLog
from app.models.message_template import MessageTemplate

__all__ = [
    "User",
    "CanvasConnection",
    "Session",
    "Course",
    "Assignment",
    "Submission",
    "Conversation",
    "Message",
    "Workflow",
    "AuditLog",
    "MessageTemplate",
]