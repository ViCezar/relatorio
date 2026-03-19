from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.core.security import get_password_hash
from app.db.session import get_db
from app.models.user import User, UserRole
from app.schemas.user import UserCreate, UserOut, UserPasswordUpdate

router = APIRouter()


@router.get('', response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)) -> list[UserOut]:
    return db.query(User).order_by(User.created_at.desc(), User.id.desc()).all()


@router.post('', response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(payload: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> UserOut:
    normalized_email = payload.email.lower().strip()
    existing = db.query(User).filter(func.lower(User.email) == normalized_email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Email ja cadastrado')

    user = User(
        name=payload.name.strip(),
        email=normalized_email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        active=payload.active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Usuario nao encontrado')
    return user


def ensure_standard_profile(user: User) -> None:
    if user.role != UserRole.USER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Somente usuarios com perfil Padrao podem ser alterados nesta acao',
        )


@router.put('/me/password', status_code=status.HTTP_204_NO_CONTENT)
def update_my_admin_password(
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
    current_admin: User = Depends(require_admin),
) -> None:
    current_admin.password_hash = get_password_hash(payload.password)
    db.commit()
    return None


@router.put('/{user_id}/password', status_code=status.HTTP_204_NO_CONTENT)
def update_standard_user_password(
    user_id: int,
    payload: UserPasswordUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    user = get_user_or_404(db, user_id)
    ensure_standard_profile(user)
    user.password_hash = get_password_hash(payload.password)
    db.commit()
    return None


@router.delete('/{user_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_standard_user(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    user = get_user_or_404(db, user_id)
    ensure_standard_profile(user)

    try:
        db.delete(user)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Nao foi possivel excluir usuario com dados vinculados',
        )
    return None
