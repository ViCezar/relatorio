from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.branch import Branch
from app.models.user import User
from app.schemas.branch import BranchCreate, BranchOut, BranchUpdate

router = APIRouter()


@router.get('', response_model=list[BranchOut])
def list_branches(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> list[BranchOut]:
    return db.query(Branch).order_by(Branch.name.asc()).all()


@router.post('', response_model=BranchOut, status_code=status.HTTP_201_CREATED)
def create_branch(payload: BranchCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> BranchOut:
    existing = db.query(Branch).filter(func.lower(Branch.name) == payload.name.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Filial ja cadastrada')

    branch = Branch(name=payload.name, active=payload.active)
    db.add(branch)
    db.commit()
    db.refresh(branch)
    return branch


@router.put('/{branch_id}', response_model=BranchOut)
def update_branch(
    branch_id: int,
    payload: BranchUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> BranchOut:
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Filial nao encontrada')

    if payload.name is not None:
        existing = (
            db.query(Branch)
            .filter(func.lower(Branch.name) == payload.name.lower(), Branch.id != branch_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Filial com mesmo nome ja existe')
        branch.name = payload.name

    if payload.active is not None:
        branch.active = payload.active

    db.commit()
    db.refresh(branch)
    return branch


@router.delete('/{branch_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(branch_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> None:
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Filial nao encontrada')

    db.delete(branch)
    db.commit()
    return None
