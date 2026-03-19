from __future__ import annotations

from io import BytesIO

import pandas as pd
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.agent import Agent
from app.models.branch import Branch
from app.models.report import MonthlyReport, MonthlyReportItem, PendingImportItem
from app.models.sector import Sector

EXPECTED_COLUMNS = ['Atendente', 'Tickets finalizados']


def _parse_tickets(value: object) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Valor invalido em Tickets finalizados: {value}',
        )


def get_report_or_404(db: Session, branch_id: int, year: int, month: int) -> MonthlyReport:
    report = (
        db.query(MonthlyReport)
        .filter(
            MonthlyReport.branch_id == branch_id,
            MonthlyReport.year == year,
            MonthlyReport.month == month,
        )
        .first()
    )
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Relatorio nao encontrado')
    return report


def get_or_create_report(db: Session, branch_id: int, year: int, month: int, created_by: int) -> MonthlyReport:
    report = (
        db.query(MonthlyReport)
        .filter(
            MonthlyReport.branch_id == branch_id,
            MonthlyReport.year == year,
            MonthlyReport.month == month,
        )
        .first()
    )
    if report:
        return report

    report = MonthlyReport(branch_id=branch_id, year=year, month=month, created_by=created_by)
    db.add(report)
    db.flush()
    return report


def clear_report_rows(db: Session, report_id: int, preserve_manual_baldussi: bool = False) -> None:
    db.query(PendingImportItem).filter(PendingImportItem.report_id == report_id).delete()

    if not preserve_manual_baldussi:
        db.query(MonthlyReportItem).filter(MonthlyReportItem.report_id == report_id).delete()
        return

    existing_items = db.query(MonthlyReportItem).filter(MonthlyReportItem.report_id == report_id).all()
    for item in existing_items:
        # Mantem os valores manuais de Baldussi e zera apenas o BLIP importado.
        # Linhas que eram somente do Excel (sem Baldussi manual) sao removidas.
        if item.baldussi_destino == 0 and item.baldussi_origem == 0:
            db.delete(item)
            continue

        item.blip = 0
        item.tickets_finalizados = item.baldussi_destino + item.baldussi_origem


def _find_agent_by_excel_name(db: Session, branch_id: int, excel_name: str) -> Agent | None:
    return (
        db.query(Agent)
        .filter(
            Agent.branch_id == branch_id,
            func.lower(Agent.name) == excel_name.lower(),
        )
        .first()
    )


def _upsert_report_item(
    db: Session,
    report_id: int,
    agent_id: int,
    raw_name_from_excel: str,
    tickets: int,
    update_blip_from_tickets: bool = False,
) -> None:
    item = (
        db.query(MonthlyReportItem)
        .filter(MonthlyReportItem.report_id == report_id, MonthlyReportItem.agent_id == agent_id)
        .first()
    )
    if item:
        item.tickets_finalizados += tickets
        if update_blip_from_tickets:
            item.blip += tickets
        item.raw_name_from_excel = raw_name_from_excel
        return

    db.add(
        MonthlyReportItem(
            report_id=report_id,
            agent_id=agent_id,
            baldussi_destino=0,
            baldussi_origem=0,
            blip=tickets if update_blip_from_tickets else 0,
            tickets_finalizados=tickets,
            raw_name_from_excel=raw_name_from_excel,
        )
    )


def _upsert_pending_item(db: Session, report_id: int, excel_name: str, tickets: int) -> PendingImportItem:
    pending = (
        db.query(PendingImportItem)
        .filter(
            PendingImportItem.report_id == report_id,
            PendingImportItem.resolved.is_(False),
            PendingImportItem.raw_name_from_excel == excel_name,
        )
        .first()
    )
    if pending:
        pending.tickets_finalizados += tickets
        return pending

    pending = PendingImportItem(
        report_id=report_id,
        raw_name_from_excel=excel_name,
        tickets_finalizados=tickets,
        resolved=False,
    )
    db.add(pending)
    return pending


def import_report_from_excel(
    db: Session,
    excel_content: bytes,
    branch_id: int,
    year: int,
    month: int,
    created_by: int,
    mode: str,
) -> dict:
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.active.is_(True)).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Filial nao encontrada ou inativa')

    report = get_or_create_report(db, branch_id=branch_id, year=year, month=month, created_by=created_by)

    if mode == 'overwrite':
        clear_report_rows(db, report.id, preserve_manual_baldussi=True)
    elif mode != 'sum':
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Modo invalido')

    try:
        dataframe = pd.read_excel(BytesIO(excel_content), engine='openpyxl')
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Falha ao ler o arquivo Excel') from exc

    missing_columns = [col for col in EXPECTED_COLUMNS if col not in dataframe.columns]
    if missing_columns:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Colunas ausentes no Excel: {", ".join(missing_columns)}',
        )

    matched_rows = 0
    pending_rows = 0
    total_rows = 0

    for _, row in dataframe.iterrows():
        excel_name = row['Atendente']
        if pd.isna(excel_name):
            continue

        excel_name = str(excel_name)
        tickets = _parse_tickets(row['Tickets finalizados'])
        total_rows += 1

        agent = _find_agent_by_excel_name(db, branch_id=branch_id, excel_name=excel_name)
        if agent:
            _upsert_report_item(
                db,
                report_id=report.id,
                agent_id=agent.id,
                raw_name_from_excel=excel_name,
                tickets=tickets,
                update_blip_from_tickets=True,
            )
            matched_rows += 1
            continue

        _upsert_pending_item(db, report_id=report.id, excel_name=excel_name, tickets=tickets)
        pending_rows += 1

    db.flush()

    pending_items = (
        db.query(PendingImportItem)
        .filter(PendingImportItem.report_id == report.id, PendingImportItem.resolved.is_(False))
        .order_by(PendingImportItem.id.asc())
        .all()
    )

    return {
        'report_id': report.id,
        'mode': mode,
        'matched_rows': matched_rows,
        'pending_rows': pending_rows,
        'total_rows': total_rows,
        'pending_items': pending_items,
    }


def get_report_pending_items(db: Session, report_id: int) -> list[PendingImportItem]:
    return (
        db.query(PendingImportItem)
        .filter(PendingImportItem.report_id == report_id, PendingImportItem.resolved.is_(False))
        .order_by(PendingImportItem.id.asc())
        .all()
    )


def get_consolidated_report(db: Session, branch_id: int, year: int, month: int) -> dict:
    report = get_report_or_404(db, branch_id=branch_id, year=year, month=month)

    rows = (
        db.query(MonthlyReportItem, Agent, Sector)
        .join(Agent, Agent.id == MonthlyReportItem.agent_id)
        .join(Sector, Sector.id == Agent.sector_id)
        .filter(MonthlyReportItem.report_id == report.id)
        .all()
    )

    by_agent = []
    sector_totals: dict[int, dict] = {}
    total_tickets = 0

    for item, agent, sector in rows:
        total_tickets += item.tickets_finalizados
        by_agent.append(
            {
                'id': item.id,
                'agent_id': agent.id,
                'agent_name': agent.name,
                'sector_id': sector.id,
                'sector_name': sector.name,
                'baldussi_destino': item.baldussi_destino,
                'baldussi_origem': item.baldussi_origem,
                'blip': item.blip,
                'tickets_finalizados': item.tickets_finalizados,
            }
        )

        if sector.id not in sector_totals:
            sector_totals[sector.id] = {
                'sector_id': sector.id,
                'sector_name': sector.name,
                'color': sector.color,
                'tickets_finalizados': 0,
            }
        sector_totals[sector.id]['tickets_finalizados'] += item.tickets_finalizados

    by_agent = sorted(by_agent, key=lambda x: x['tickets_finalizados'], reverse=True)
    by_sector = sorted(sector_totals.values(), key=lambda x: x['tickets_finalizados'], reverse=True)

    if total_tickets > 0:
        for sector in by_sector:
            sector['percentual'] = round((sector['tickets_finalizados'] / total_tickets) * 100, 2)
    else:
        for sector in by_sector:
            sector['percentual'] = 0

    total_pending = (
        db.query(PendingImportItem)
        .filter(PendingImportItem.report_id == report.id, PendingImportItem.resolved.is_(False))
        .count()
    )

    return {
        'report_id': report.id,
        'branch_id': report.branch_id,
        'month': report.month,
        'year': report.year,
        'created_at': report.created_at,
        'total_tickets': total_tickets,
        'total_agents_with_tickets': len(by_agent),
        'total_pending': total_pending,
        'by_sector': by_sector,
        'by_agent': by_agent,
    }


def resolve_pending_with_agent(db: Session, report_id: int, pending_id: int, agent_id: int) -> PendingImportItem:
    pending = (
        db.query(PendingImportItem)
        .filter(
            PendingImportItem.id == pending_id,
            PendingImportItem.report_id == report_id,
            PendingImportItem.resolved.is_(False),
        )
        .first()
    )
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Pendencia nao encontrada')

    report = db.query(MonthlyReport).filter(MonthlyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Relatorio nao encontrado')

    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if not agent or agent.branch_id != report.branch_id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Atendente invalido para a filial do relatorio')

    _upsert_report_item(
        db,
        report_id=report.id,
        agent_id=agent.id,
        raw_name_from_excel=pending.raw_name_from_excel,
        tickets=pending.tickets_finalizados,
        update_blip_from_tickets=True,
    )

    pending.resolved = True
    pending.resolved_agent_id = agent.id
    db.flush()
    return pending


def create_agent_and_resolve_pending(db: Session, report_id: int, pending_id: int, sector_id: int) -> PendingImportItem:
    pending = (
        db.query(PendingImportItem)
        .filter(
            PendingImportItem.id == pending_id,
            PendingImportItem.report_id == report_id,
            PendingImportItem.resolved.is_(False),
        )
        .first()
    )
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Pendencia nao encontrada')

    report = db.query(MonthlyReport).filter(MonthlyReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Relatorio nao encontrado')

    sector = db.query(Sector).filter(Sector.id == sector_id, Sector.branch_id == report.branch_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Setor invalido para a filial do relatorio')

    existing_agent = (
        db.query(Agent)
        .filter(
            Agent.branch_id == report.branch_id,
            func.lower(Agent.name) == pending.raw_name_from_excel.lower(),
        )
        .first()
    )
    if existing_agent:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Ja existe atendente com esse nome na filial. Use a vinculacao manual.',
        )

    new_agent = Agent(
        branch_id=report.branch_id,
        sector_id=sector.id,
        name=pending.raw_name_from_excel,
        active=True,
    )
    db.add(new_agent)
    db.flush()

    return resolve_pending_with_agent(db, report_id=report_id, pending_id=pending_id, agent_id=new_agent.id)


def export_report_excel(db: Session, branch_id: int, year: int, month: int) -> bytes:
    report = get_report_or_404(db, branch_id=branch_id, year=year, month=month)

    rows = (
        db.query(MonthlyReportItem, Agent, Sector)
        .join(Agent, Agent.id == MonthlyReportItem.agent_id)
        .join(Sector, Sector.id == Agent.sector_id)
        .filter(MonthlyReportItem.report_id == report.id)
        .order_by(Sector.name.asc(), Agent.name.asc())
        .all()
    )

    dataframe = pd.DataFrame(
        [
            {
                'Setor': sector.name,
                'Atendente': agent.name,
                'Baldussi Destino': item.baldussi_destino,
                'Baldussi Origem': item.baldussi_origem,
                'Blip': item.blip,
                'Tickets finalizados': item.tickets_finalizados,
            }
            for item, agent, sector in rows
        ]
    )

    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        dataframe.to_excel(writer, index=False, sheet_name='Relatorio')
    return output.getvalue()


def _validate_manual_fields(baldussi_destino: int, baldussi_origem: int, blip: int) -> None:
    if baldussi_destino < 0 or baldussi_origem < 0 or blip < 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Valores manuais nao podem ser negativos',
        )


def _upsert_manual_item_for_agent(
    db: Session,
    report_id: int,
    agent: Agent,
    baldussi_destino: int,
    baldussi_origem: int,
    blip: int,
    update_blip: bool,
) -> None:
    existing = (
        db.query(MonthlyReportItem)
        .filter(
            MonthlyReportItem.report_id == report_id,
            MonthlyReportItem.agent_id == agent.id,
        )
        .first()
    )

    if existing:
        existing.baldussi_destino = baldussi_destino
        existing.baldussi_origem = baldussi_origem
        if update_blip:
            existing.blip = blip
        existing.tickets_finalizados = existing.baldussi_destino + existing.baldussi_origem + existing.blip
        if not existing.raw_name_from_excel:
            existing.raw_name_from_excel = agent.name
        return

    initial_blip = blip if update_blip else 0
    db.add(
        MonthlyReportItem(
            report_id=report_id,
            agent_id=agent.id,
            baldussi_destino=baldussi_destino,
            baldussi_origem=baldussi_origem,
            blip=initial_blip,
            tickets_finalizados=baldussi_destino + baldussi_origem + initial_blip,
            raw_name_from_excel=agent.name,
        )
    )


def get_baldussi_manual_board(db: Session, branch_id: int, year: int, month: int) -> dict:
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if not branch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='Filial nao encontrada')

    report = (
        db.query(MonthlyReport)
        .filter(
            MonthlyReport.branch_id == branch_id,
            MonthlyReport.year == year,
            MonthlyReport.month == month,
        )
        .first()
    )

    items_by_agent: dict[int, MonthlyReportItem] = {}
    if report:
        items = db.query(MonthlyReportItem).filter(MonthlyReportItem.report_id == report.id).all()
        items_by_agent = {item.agent_id: item for item in items}

    sectors = (
        db.query(Sector)
        .filter(Sector.branch_id == branch_id, Sector.active.is_(True))
        .order_by(Sector.name.asc())
        .all()
    )
    report_agent_ids = list(items_by_agent.keys())
    if report_agent_ids:
        agents = (
            db.query(Agent)
            .filter(
                Agent.branch_id == branch_id,
                Agent.active.is_(True),
                Agent.id.in_(report_agent_ids),
            )
            .order_by(Agent.name.asc())
            .all()
        )
    else:
        agents = []

    agents_by_sector: dict[int, list[Agent]] = {}
    for agent in agents:
        agents_by_sector.setdefault(agent.sector_id, []).append(agent)

    sectors_out: list[dict] = []
    grand_total = 0

    for sector in sectors:
        sector_agents = agents_by_sector.get(sector.id, [])
        agent_rows: list[dict] = []
        sector_total = 0

        for agent in sector_agents:
            item = items_by_agent.get(agent.id)
            baldussi_destino = item.baldussi_destino if item else 0
            baldussi_origem = item.baldussi_origem if item else 0
            blip = item.blip if item else 0
            total = item.tickets_finalizados if item else 0

            # Retrocompatibilidade: itens antigos importados antes da coluna blip
            # tinham apenas tickets_finalizados preenchido.
            if item:
                inferred_blip = item.tickets_finalizados - item.baldussi_destino - item.baldussi_origem
                if item.blip == 0 and inferred_blip > 0:
                    blip = inferred_blip
                    total = item.baldussi_destino + item.baldussi_origem + blip

            sector_total += total
            agent_rows.append(
                {
                    'agent_id': agent.id,
                    'agent_name': agent.name,
                    'baldussi_destino': baldussi_destino,
                    'baldussi_origem': baldussi_origem,
                    'blip': blip,
                    'total': total,
                }
            )

        grand_total += sector_total
        sectors_out.append(
            {
                'sector_id': sector.id,
                'sector_name': sector.name,
                'color': sector.color,
                'total': sector_total,
                'agents': agent_rows,
            }
        )

    return {
        'report_id': report.id if report else None,
        'branch_id': branch_id,
        'month': month,
        'year': year,
        'grand_total': grand_total,
        'sectors': sectors_out,
    }


def bulk_upsert_baldussi_manual(
    db: Session,
    branch_id: int,
    year: int,
    month: int,
    created_by: int,
    items: list[dict],
) -> dict:
    if not items:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Nenhum item informado')

    report = get_or_create_report(db, branch_id=branch_id, year=year, month=month, created_by=created_by)

    agent_ids = [item['agent_id'] for item in items]
    agents = db.query(Agent).filter(Agent.id.in_(agent_ids), Agent.branch_id == branch_id).all()
    agents_by_id = {agent.id: agent for agent in agents}

    missing_agent_ids = [agent_id for agent_id in agent_ids if agent_id not in agents_by_id]
    if missing_agent_ids:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f'Atendentes invalidos para a filial: {missing_agent_ids}',
        )

    for item_payload in items:
        baldussi_destino = int(item_payload['baldussi_destino'])
        baldussi_origem = int(item_payload['baldussi_origem'])
        blip = int(item_payload['blip'])
        _validate_manual_fields(baldussi_destino=baldussi_destino, baldussi_origem=baldussi_origem, blip=blip)

        agent_id = item_payload['agent_id']
        source_agent = agents_by_id[agent_id]

        # Salva exatamente o que veio da tela para a filial especificada.
        _upsert_manual_item_for_agent(
            db,
            report_id=report.id,
            agent=source_agent,
            baldussi_destino=baldussi_destino,
            baldussi_origem=baldussi_origem,
            blip=blip,
            update_blip=True,
        )

    db.flush()
    return get_baldussi_manual_board(db, branch_id=branch_id, year=year, month=month)
