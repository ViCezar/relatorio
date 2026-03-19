from io import BytesIO

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, require_admin
from app.db.session import get_db
from app.models.user import User
from app.schemas.report import (
    BaldussiManualBoardOut,
    BaldussiManualBulkUpsertPayload,
    ImportResult,
    PendingOut,
    ReportConsolidatedOut,
    ResolveCreateAgentPayload,
    ResolveLinkAgentPayload,
)
from app.services.report_service import (
    bulk_upsert_baldussi_manual,
    create_agent_and_resolve_pending,
    export_report_excel,
    get_baldussi_manual_board,
    get_consolidated_report,
    get_report_or_404,
    get_report_pending_items,
    import_report_from_excel,
    resolve_pending_with_agent,
)

router = APIRouter()


def validate_month_year(month: int, year: int) -> None:
    if month < 1 or month > 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Mes deve estar entre 1 e 12')
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail='Ano fora do intervalo permitido')


@router.post('/import', response_model=ImportResult)
async def import_report(
    file: UploadFile = File(...),
    branch_id: int = Form(...),
    month: int = Form(...),
    year: int = Form(...),
    mode: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ImportResult:
    validate_month_year(month=month, year=year)
    if not file.filename or not file.filename.lower().endswith('.xlsx'):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail='Arquivo invalido. Envie um .xlsx',
        )

    content = await file.read()
    result = import_report_from_excel(
        db,
        excel_content=content,
        branch_id=branch_id,
        month=month,
        year=year,
        created_by=current_user.id,
        mode=mode,
    )
    db.commit()
    return ImportResult(**result)


@router.get('/{branch_id}/{year}/{month}', response_model=ReportConsolidatedOut)
def get_monthly_report(
    branch_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ReportConsolidatedOut:
    validate_month_year(month=month, year=year)
    data = get_consolidated_report(db, branch_id=branch_id, year=year, month=month)
    return ReportConsolidatedOut(**data)


@router.get('/{branch_id}/{year}/{month}/pending', response_model=list[PendingOut])
def get_pending(
    branch_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[PendingOut]:
    validate_month_year(month=month, year=year)
    report = get_report_or_404(db, branch_id=branch_id, year=year, month=month)
    items = get_report_pending_items(db, report.id)
    return [PendingOut.model_validate(item) for item in items]


@router.post('/{report_id}/pending/{pending_id}/create-agent-and-resolve', response_model=PendingOut)
def create_agent_resolve(
    report_id: int,
    pending_id: int,
    payload: ResolveCreateAgentPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> PendingOut:
    pending = create_agent_and_resolve_pending(
        db,
        report_id=report_id,
        pending_id=pending_id,
        sector_id=payload.sector_id,
    )
    db.commit()
    db.refresh(pending)
    return PendingOut.model_validate(pending)


@router.post('/{report_id}/pending/{pending_id}/link-agent-and-resolve', response_model=PendingOut)
def link_agent_resolve(
    report_id: int,
    pending_id: int,
    payload: ResolveLinkAgentPayload,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> PendingOut:
    pending = resolve_pending_with_agent(
        db,
        report_id=report_id,
        pending_id=pending_id,
        agent_id=payload.agent_id,
    )
    db.commit()
    db.refresh(pending)
    return PendingOut.model_validate(pending)


@router.get('/{branch_id}/{year}/{month}/export')
def export_monthly_report(
    branch_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> StreamingResponse:
    validate_month_year(month=month, year=year)
    file_bytes = export_report_excel(db, branch_id=branch_id, year=year, month=month)
    filename = f'relatorio_{branch_id}_{year}_{month}.xlsx'
    return StreamingResponse(
        BytesIO(file_bytes),
        media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename={filename}'},
    )


@router.get('/{branch_id}/{year}/{month}/manual-baldussi', response_model=BaldussiManualBoardOut)
def get_manual_baldussi_board(
    branch_id: int,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> BaldussiManualBoardOut:
    validate_month_year(month=month, year=year)
    board = get_baldussi_manual_board(db, branch_id=branch_id, year=year, month=month)
    return BaldussiManualBoardOut(**board)


@router.post('/{branch_id}/{year}/{month}/manual-baldussi/bulk-upsert', response_model=BaldussiManualBoardOut)
def save_manual_baldussi_board(
    branch_id: int,
    year: int,
    month: int,
    payload: BaldussiManualBulkUpsertPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> BaldussiManualBoardOut:
    validate_month_year(month=month, year=year)
    board = bulk_upsert_baldussi_manual(
        db,
        branch_id=branch_id,
        year=year,
        month=month,
        created_by=current_user.id,
        items=[item.model_dump() for item in payload.items],
    )
    db.commit()
    return BaldussiManualBoardOut(**board)
