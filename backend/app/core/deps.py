from datetime import UTC, datetime, timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.db.session import get_db
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/auth/login')
PRESENCE_TOUCH_INTERVAL = timedelta(seconds=30)


def touch_user_presence(db: Session, user: User) -> None:
    now = datetime.now(UTC)
    last_seen = user.last_seen_at
    if last_seen is not None and last_seen.tzinfo is None:
        last_seen = last_seen.replace(tzinfo=UTC)

    if last_seen is not None and (now - last_seen) < PRESENCE_TOUCH_INTERVAL:
        return

    user.last_seen_at = now
    db.commit()


def get_current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail='Nao autenticado',
        headers={'WWW-Authenticate': 'Bearer'},
    )

    try:
        payload = decode_access_token(token)
    except ValueError:
        raise credentials_error

    email = payload.get('sub')
    if not email:
        raise credentials_error

    user = db.query(User).filter(User.email == email, User.active.is_(True)).first()
    if not user:
        raise credentials_error

    touch_user_presence(db, user)
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Apenas admin pode executar esta acao')
    return current_user
