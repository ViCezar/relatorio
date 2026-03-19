from datetime import UTC, datetime, timedelta
from enum import Enum

from sqlalchemy import Boolean, DateTime, Enum as SqlEnum, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, Enum):
    ADMIN = 'admin'
    USER = 'user'


ONLINE_WINDOW = timedelta(minutes=3)


class User(Base):
    __tablename__ = 'users'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(SqlEnum(UserRole, name='user_role'), default=UserRole.USER, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_online(self) -> bool:
        if not self.active or self.last_seen_at is None:
            return False

        last_seen = self.last_seen_at
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=UTC)
        return (datetime.now(UTC) - last_seen) <= ONLINE_WINDOW
