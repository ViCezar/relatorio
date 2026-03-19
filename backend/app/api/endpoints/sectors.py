from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.branch import Branch
from app.models.sector import Sector
from app.models.user import User
from app.schemas.sector import SectorCreate, SectorOut, SectorUpdate

router = APIRouter()


@router.get('', response_model=list[SectorOut])
def list_sectors(
    branch_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SectorOut]:
    query = db.query(Sector)
    if branch_id is not None:
        query = query.filter(Sector.branch_id == branch_id)
    return query.order_by(Sector.name.asc()).all()


@router.post('', response_model=SectorOut, status_code=status.HTTP_201_CREATED)
def create_sector(payload: SectorCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> SectorOut:
    branch = db.query(Branch).filter(Branch.id == payload.branch_id).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Filial nao encontrada')

    existing = (
        db.query(Sector)
        .filter(Sector.branch_id == payload.branch_id, func.lower(Sector.name) == payload.name.lower())
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Setor ja cadastrado para a filial')

    sector = Sector(
        branch_id=payload.branch_id,
        name=payload.name,
        color=payload.color,
        active=payload.active,
    )
    db.add(sector)
    db.commit()
    db.refresh(sector)
    return sector


@router.put('/{sector_id}', response_model=SectorOut)
def update_sector(
    sector_id: int,
    payload: SectorUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> SectorOut:
    sector = db.query(Sector).filter(Sector.id == sector_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Setor nao encontrado')

    if payload.name is not None:
        existing = (
            db.query(Sector)
            .filter(
                Sector.branch_id == sector.branch_id,
                func.lower(Sector.name) == payload.name.lower(),
                Sector.id != sector.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Setor com mesmo nome ja existe na filial')
        sector.name = payload.name

    if payload.color is not None:
        sector.color = payload.color
    if payload.active is not None:
        sector.active = payload.active

    db.commit()
    db.refresh(sector)
    return sector


@router.delete('/{sector_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_sector(sector_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)) -> None:
    sector = db.query(Sector).filter(Sector.id == sector_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Setor nao encontrado')

    db.delete(sector)
    db.commit()
    return None
