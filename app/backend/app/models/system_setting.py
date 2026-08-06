from datetime import UTC, datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SystemSetting(Base):
    __tablename__ = "system_settings"

    key: Mapped[str] = mapped_column(String, primary_key=True)
    # Admin settings are heterogeneous (str/bool/int today, possibly dict/list
    # later) — JSONB stores any of these natively, so the type here reflects
    # that rather than narrowing to dict.
    value: Mapped[dict | list | str | int | float | bool] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
