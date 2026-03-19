from datetime import datetime

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = 'bearer'


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    role: str
    active: bool
    created_at: datetime
    last_seen_at: datetime | None
    is_online: bool
