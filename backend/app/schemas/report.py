from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


ImportMode = Literal['overwrite', 'sum']


class PendingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    report_id: int
    raw_name_from_excel: str
    tickets_finalizados: int
    resolved: bool
    resolved_agent_id: int | None


class ReportItemOut(BaseModel):
    id: int
    agent_id: int
    agent_name: str
    sector_id: int
    sector_name: str
    baldussi_destino: int = 0
    baldussi_origem: int = 0
    blip: int = 0
    tickets_finalizados: int


class ReportConsolidatedOut(BaseModel):
    report_id: int
    branch_id: int
    month: int
    year: int
    created_at: datetime
    total_tickets: int
    total_agents_with_tickets: int
    total_pending: int
    by_sector: list[dict]
    by_agent: list[ReportItemOut]


class ImportResult(BaseModel):
    report_id: int
    mode: ImportMode
    matched_rows: int
    pending_rows: int
    total_rows: int
    pending_items: list[PendingOut]


class ResolveCreateAgentPayload(BaseModel):
    sector_id: int


class ResolveLinkAgentPayload(BaseModel):
    agent_id: int


class ReportExportRow(BaseModel):
    setor: str
    atendente: str
    tickets_finalizados: int


class BaldussiManualItemInput(BaseModel):
    agent_id: int
    baldussi_destino: int = 0
    baldussi_origem: int = 0
    blip: int = 0


class BaldussiManualBulkUpsertPayload(BaseModel):
    items: list[BaldussiManualItemInput]


class BaldussiManualAgentOut(BaseModel):
    agent_id: int
    agent_name: str
    baldussi_destino: int
    baldussi_origem: int
    blip: int
    total: int


class BaldussiManualSectorOut(BaseModel):
    sector_id: int
    sector_name: str
    color: str | None
    total: int
    agents: list[BaldussiManualAgentOut]


class BaldussiManualBoardOut(BaseModel):
    report_id: int | None
    branch_id: int
    month: int
    year: int
    grand_total: int
    sectors: list[BaldussiManualSectorOut]
