from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import create_access_token, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse, UserMe

router = APIRouter()


@router.post('/login', response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Credenciais invalidas')
    if not user.active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Usuario inativo')

    user.last_seen_at = datetime.now(UTC)
    db.commit()

    token = create_access_token(subject=user.email, role=user.role.value)
    return TokenResponse(access_token=token)


@router.get('/me', response_model=UserMe)
def me(current_user: User = Depends(get_current_user)) -> UserMe:
    return UserMe(
        id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role=current_user.role.value,
        active=current_user.active,
        created_at=current_user.created_at,
        last_seen_at=current_user.last_seen_at,
        is_online=current_user.is_online,
    )
