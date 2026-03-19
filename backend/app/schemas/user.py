from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.user import UserRole


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=6, max_length=64)
    role: UserRole = UserRole.USER
    active: bool = True

    @field_validator('email')
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if '@' not in normalized:
            raise ValueError('Email invalido')
        return normalized


class UserPasswordUpdate(BaseModel):
    password: str = Field(min_length=6, max_length=64)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: UserRole
    active: bool
    created_at: datetime
    last_seen_at: datetime | None
    is_online: bool
