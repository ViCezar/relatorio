import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { Agent, PendingItem, ReportConsolidated, Sector } from '@/types'

export function ReportsPage() {
  const { selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()

  const [report, setReport] = useState<ReportConsolidated | null>(null)
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])

  const [pendingToAgent, setPendingToAgent] = useState<Record<number, number>>({})
  const [pendingToSector, setPendingToSector] = useState<Record<number, number>>({})
  const [error, setError] = useState('')

  const loadData = async () => {
    if (!selectedBranchId) {
      setReport(null)
      setPendingItems([])
      setAgents([])
      setSectors([])
      return
    }

    setError('')

    try {
      const [agentsRes, sectorsRes] = await Promise.all([
        api.get<Agent[]>('/agents', { params: { branch_id: selectedBranchId } }),
        api.get<Sector[]>('/sectors', { params: { branch_id: selectedBranchId } }),
      ])

      setAgents(agentsRes.data)
      setSectors(sectorsRes.data)

      try {
        const reportRes = await api.get<ReportConsolidated>(`/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}`)
        setReport(reportRes.data)

        const pendingRes = await api.get<PendingItem[]>(`/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}/pending`)
        setPendingItems(pendingRes.data)
      } catch {
        setReport(null)
        setPendingItems([])
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  useEffect(() => {
    loadData().catch(() => {
      setError('Falha ao carregar dados')
    })
  }, [selectedBranchId, selectedMonth, selectedYear])

  const resolveLink = async (pending: PendingItem) => {
    const agentId = pendingToAgent[pending.id]
    if (!report || !agentId) {
      return
    }

    try {
      await api.post(`/reports/${report.report_id}/pending/${pending.id}/link-agent-and-resolve`, {
        agent_id: agentId,
      })
      await loadData()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const resolveCreate = async (pending: PendingItem) => {
    const sectorId = pendingToSector[pending.id]
    if (!report || !sectorId) {
      return
    }

    try {
      await api.post(`/reports/${report.report_id}/pending/${pending.id}/create-agent-and-resolve`, {
        sector_id: sectorId,
      })
      await loadData()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const exportExcel = async () => {
    if (!selectedBranchId) {
      return
    }

    try {
      const response = await api.get(`/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}/export`, {
        responseType: 'blob',
      })
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `relatorio_${selectedBranchId}_${selectedYear}_${selectedMonth}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Relatorios e Pendências'
        subtitle='Resolva nomes nao encontrados e exporte o consolidado mensal em Excel.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Consulta mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-3 md:grid-cols-3'>
            <Button variant='outline' onClick={loadData}>
              Recarregar
            </Button>
            <Button onClick={exportExcel} disabled={!report}>
              Exportar Excel
            </Button>
            <p className='rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700'>
              Mês/ano global: {selectedMonth}/{selectedYear}
            </p>
          </div>
          {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
        </CardContent>
      </Card>

      {!report ? (
        <Card>
          <CardContent className='pt-5 text-sm text-slate-600'>
            Nenhum relatorio encontrado para os filtros atuais.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Resumo do relatorio</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 md:grid-cols-4'>
              <MiniMetric title='Relatorio ID' value={report.report_id} />
              <MiniMetric title='Total tickets' value={report.total_tickets} />
              <MiniMetric title='Atendentes' value={report.total_agents_with_tickets} />
              <MiniMetric title='Pendencias' value={report.total_pending} />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Pendências de importação</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome no Excel</TableHead>
                <TableHead>Tickets</TableHead>
                <TableHead>Vincular atendente existente</TableHead>
                <TableHead>Criar atendente no setor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingItems.map((pending) => (
                <TableRow key={pending.id}>
                  <TableCell>{pending.raw_name_from_excel}</TableCell>
                  <TableCell>{pending.tickets_finalizados}</TableCell>
                  <TableCell>
                    <div className='flex gap-2'>
                      <Select
                        value={pendingToAgent[pending.id] ? String(pendingToAgent[pending.id]) : ''}
                        onChange={(e) =>
                          setPendingToAgent((prev) => ({ ...prev, [pending.id]: Number(e.target.value) }))
                        }
                      >
                        <option value='' disabled>
                          Selecione
                        </option>
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </Select>
                      <Button size='sm' onClick={() => resolveLink(pending)}>
                        Vincular
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className='flex gap-2'>
                      <Select
                        value={pendingToSector[pending.id] ? String(pendingToSector[pending.id]) : ''}
                        onChange={(e) =>
                          setPendingToSector((prev) => ({ ...prev, [pending.id]: Number(e.target.value) }))
                        }
                      >
                        <option value='' disabled>
                          Selecione
                        </option>
                        {sectors.map((sector) => (
                          <option key={sector.id} value={sector.id}>
                            {sector.name}
                          </option>
                        ))}
                      </Select>
                      <Button size='sm' variant='secondary' onClick={() => resolveCreate(pending)}>
                        Criar e resolver
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MiniMetric({ title, value }: { title: string; value: number }) {
  return (
    <div className='rounded-lg border border-border bg-slate-50 p-3'>
      <p className='text-xs uppercase tracking-wider text-slate-500'>{title}</p>
      <p className='font-display text-xl font-bold text-slate-900'>{value}</p>
    </div>
  )
}
