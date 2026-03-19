export type Role = 'admin' | 'user'

export interface User {
  id: number
  name: string
  email: string
  role: Role
  active: boolean
  created_at: string
  last_seen_at: string | null
  is_online: boolean
}

export interface Branch {
  id: number
  name: string
  active: boolean
}

export interface Sector {
  id: number
  branch_id: number
  name: string
  color?: string | null
  active: boolean
}

export interface Agent {
  id: number
  branch_id: number
  sector_id: number
  name: string
  active: boolean
}

export interface PendingItem {
  id: number
  report_id: number
  raw_name_from_excel: string
  tickets_finalizados: number
  resolved: boolean
  resolved_agent_id?: number | null
}

export interface ReportAgentItem {
  id: number
  agent_id: number
  agent_name: string
  sector_id: number
  sector_name: string
  baldussi_destino: number
  baldussi_origem: number
  blip: number
  tickets_finalizados: number
}

export interface ReportSectorItem {
  sector_id: number
  sector_name: string
  color?: string | null
  tickets_finalizados: number
  percentual: number
}

export interface ReportConsolidated {
  report_id: number
  branch_id: number
  month: number
  year: number
  created_at: string
  total_tickets: number
  total_agents_with_tickets: number
  total_pending: number
  by_sector: ReportSectorItem[]
  by_agent: ReportAgentItem[]
}

export interface ImportResult {
  report_id: number
  mode: 'overwrite' | 'sum'
  matched_rows: number
  pending_rows: number
  total_rows: number
  pending_items: PendingItem[]
}

export interface BaldussiManualAgent {
  agent_id: number
  agent_name: string
  baldussi_destino: number
  baldussi_origem: number
  blip: number
  total: number
}

export interface BaldussiManualSector {
  sector_id: number
  sector_name: string
  color?: string | null
  total: number
  agents: BaldussiManualAgent[]
}

export interface BaldussiManualBoard {
  report_id?: number | null
  branch_id: number
  month: number
  year: number
  grand_total: number
  sectors: BaldussiManualSector[]
}
