from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.agent import Agent
from app.models.report import MonthlyReport, MonthlyReportItem
from app.models.sector import Sector
from app.models.user import User
from app.schemas.agent import AgentCreate, AgentOut, AgentUpdate
from app.services.report_service import get_or_create_report

router = APIRouter()


@router.get('', response_model=list[AgentOut])
def list_agents(
    branch_id: int | None = Query(default=None),
    sector_id: int | None = Query(default=None),
    month: int | None = Query(default=None),
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AgentOut]:
    if (month is None) != (year is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Informe mes e ano juntos para filtrar por periodo',
        )
    if month is not None and (month < 1 or month > 12):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Mes deve estar entre 1 e 12')
    if year is not None and (year < 2000 or year > 2100):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Ano fora do intervalo permitido')

    query = db.query(Agent)
    if branch_id is not None:
        query = query.filter(Agent.branch_id == branch_id)
    if sector_id is not None:
        query = query.filter(Agent.sector_id == sector_id)
    if month is not None and year is not None:
        query = (
            query.join(MonthlyReportItem, MonthlyReportItem.agent_id == Agent.id)
            .join(MonthlyReport, MonthlyReport.id == MonthlyReportItem.report_id)
            .filter(MonthlyReport.month == month, MonthlyReport.year == year)
            .distinct()
        )
    return query.order_by(Agent.name.asc()).all()


@router.post('', response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(payload: AgentCreate, db: Session = Depends(get_db), current_user: User = Depends(require_admin)) -> AgentOut:
    if (payload.month is None) != (payload.year is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Informe mes e ano juntos para cadastro por periodo',
        )
    if payload.month is not None and (payload.month < 1 or payload.month > 12):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Mes deve estar entre 1 e 12')
    if payload.year is not None and (payload.year < 2000 or payload.year > 2100):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Ano fora do intervalo permitido')

    sector = db.query(Sector).filter(Sector.id == payload.sector_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Setor nao encontrado')
    if sector.branch_id != payload.branch_id:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Setor nao pertence a filial informada',
        )

    existing = (
        db.query(Agent)
        .filter(Agent.branch_id == payload.branch_id, func.lower(Agent.name) == payload.name.lower())
        .first()
    )
    if existing:
        if payload.month is None or payload.year is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Atendente ja cadastrado na filial')

        report = get_or_create_report(
            db,
            branch_id=payload.branch_id,
            year=payload.year,
            month=payload.month,
            created_by=current_user.id,
        )
        existing_item = (
            db.query(MonthlyReportItem)
            .filter(MonthlyReportItem.report_id == report.id, MonthlyReportItem.agent_id == existing.id)
            .first()
        )
        if existing_item:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail='Atendente ja cadastrado para o mes/ano selecionado',
            )

        db.add(
            MonthlyReportItem(
                report_id=report.id,
                agent_id=existing.id,
                baldussi_destino=0,
                baldussi_origem=0,
                blip=0,
                tickets_finalizados=0,
                raw_name_from_excel=existing.name,
            )
        )
        db.commit()
        db.refresh(existing)
        return existing

    agent = Agent(
        branch_id=payload.branch_id,
        sector_id=payload.sector_id,
        name=payload.name,
        active=payload.active,
    )
    db.add(agent)
    db.flush()

    if payload.month is not None and payload.year is not None:
        report = get_or_create_report(
            db,
            branch_id=payload.branch_id,
            year=payload.year,
            month=payload.month,
            created_by=current_user.id,
        )
        db.add(
            MonthlyReportItem(
                report_id=report.id,
                agent_id=agent.id,
                baldussi_destino=0,
                baldussi_origem=0,
                blip=0,
                tickets_finalizados=0,
                raw_name_from_excel=agent.name,
            )
        )

    db.commit()
    db.refresh(agent)
    return agent


@router.put('/{agent_id}', response_model=AgentOut)
def update_agent(
    agent_id: int,
    payload: AgentUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> AgentOut:
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Atendente nao encontrado')

    if payload.sector_id is not None:
        sector = db.query(Sector).filter(Sector.id == payload.sector_id).first()
        if not sector:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Setor nao encontrado')
        if sector.branch_id != agent.branch_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail='Setor nao pertence a filial do atendente',
            )
        agent.sector_id = payload.sector_id

    if payload.name is not None:
        existing = (
            db.query(Agent)
            .filter(
                Agent.branch_id == agent.branch_id,
                func.lower(Agent.name) == payload.name.lower(),
                Agent.id != agent.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='Nome de atendente ja cadastrado na filial')
        agent.name = payload.name

    if payload.active is not None:
        agent.active = payload.active

    db.commit()
    db.refresh(agent)
    return agent


@router.delete('/{agent_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_agent(
    agent_id: int,
    month: int | None = Query(default=None),
    year: int | None = Query(default=None),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    if (month is None) != (year is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Informe mes e ano juntos para exclusao por periodo',
        )
    if month is not None and (month < 1 or month > 12):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Mes deve estar entre 1 e 12')
    if year is not None and (year < 2000 or year > 2100):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Ano fora do intervalo permitido')

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Atendente nao encontrado')

    if month is not None and year is not None:
        report = (
            db.query(MonthlyReport)
            .filter(
                MonthlyReport.branch_id == agent.branch_id,
                MonthlyReport.month == month,
                MonthlyReport.year == year,
            )
            .first()
        )
        if not report:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Relatorio do periodo nao encontrado')

        item = (
            db.query(MonthlyReportItem)
            .filter(MonthlyReportItem.report_id == report.id, MonthlyReportItem.agent_id == agent.id)
            .first()
        )
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Atendente nao cadastrado nesse periodo')

        db.delete(item)
        db.commit()
        return None

    db.delete(agent)
    db.commit()
    return None
