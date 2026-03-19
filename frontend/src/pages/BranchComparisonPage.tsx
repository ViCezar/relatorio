import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api, getApiErrorMessage } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import type { BaldussiManualBoard, Branch, ReportConsolidated } from '@/types'

type ComparisonSource = 'excel' | 'baldussi'
type ComparisonAttendanceFilter = 'baldussi_destino' | 'baldussi_origem' | 'baldussi_total' | 'blip'
type SectorBreakdown = {
  key: string
  name: string
  baldussi_destino: number
  baldussi_origem: number
  blip: number
  agents_with_tickets: number
}

type BranchComparisonRow = {
  branch_id: number
  branch_name: string
  total: number
  agents_with_tickets: number
  pending: number
  baldussi_destino: number
  baldussi_origem: number
  baldussi_total: number
  blip: number
  sectors: SectorBreakdown[]
  has_report: boolean
  load_error?: string
}

type BranchComparisonDisplayRow = BranchComparisonRow & {
  selected_total: number
  has_selected_sector: boolean
}

const attendanceFilterOptions: Array<{ value: ComparisonAttendanceFilter; label: string; color: string }> = [
  { value: 'baldussi_destino', label: 'Baldussi Destino', color: '#2f62cf' },
  { value: 'baldussi_origem', label: 'Baldussi Origem', color: '#0f9f76' },
  { value: 'baldussi_total', label: 'Baldussi', color: '#f08a24' },
  { value: 'blip', label: 'BLIP', color: '#e14e4e' },
]

function getSelectedTotalFromParts(
  baldussiDestino: number,
  baldussiOrigem: number,
  blip: number,
  filters: ComparisonAttendanceFilter[]
): number {
  const includeBaldussiDestino = filters.includes('baldussi_destino') || filters.includes('baldussi_total')
  const includeBaldussiOrigem = filters.includes('baldussi_origem') || filters.includes('baldussi_total')
  const includeBlip = filters.includes('blip')

  return (
    (includeBaldussiDestino ? baldussiDestino : 0) +
    (includeBaldussiOrigem ? baldussiOrigem : 0) +
    (includeBlip ? blip : 0)
  )
}

function normalizeSectorKey(sectorName: string): string {
  return sectorName.trim().toLocaleLowerCase('pt-BR')
}

function aggregateSectorsByAgents(
  agents: Array<{
    sector_name: string
    baldussi_destino: number
    baldussi_origem: number
    blip: number
  }>
): SectorBreakdown[] {
  const sectorsMap = new Map<string, SectorBreakdown>()

  agents.forEach((agent) => {
    const key = normalizeSectorKey(agent.sector_name)
    if (!key) {
      return
    }

    const existing = sectorsMap.get(key)
    if (existing) {
      existing.baldussi_destino += agent.baldussi_destino
      existing.baldussi_origem += agent.baldussi_origem
      existing.blip += agent.blip
      if (agent.baldussi_destino + agent.baldussi_origem + agent.blip > 0) {
        existing.agents_with_tickets += 1
      }
      return
    }

    sectorsMap.set(key, {
      key,
      name: agent.sector_name,
      baldussi_destino: agent.baldussi_destino,
      baldussi_origem: agent.baldussi_origem,
      blip: agent.blip,
      agents_with_tickets: agent.baldussi_destino + agent.baldussi_origem + agent.blip > 0 ? 1 : 0,
    })
  })

  return Array.from(sectorsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function buildZeroRow(branch: Branch): BranchComparisonRow {
  return {
    branch_id: branch.id,
    branch_name: branch.name,
    total: 0,
    agents_with_tickets: 0,
    pending: 0,
    baldussi_destino: 0,
    baldussi_origem: 0,
    baldussi_total: 0,
    blip: 0,
    sectors: [],
    has_report: false,
  }
}

function buildRowFromExcel(branch: Branch, report: ReportConsolidated): BranchComparisonRow {
  const sectors = aggregateSectorsByAgents(
    report.by_agent.map((agent) => ({
      sector_name: agent.sector_name,
      baldussi_destino: agent.baldussi_destino,
      baldussi_origem: agent.baldussi_origem,
      blip: agent.blip,
    }))
  )
  const baldussi_destino = report.by_agent.reduce((acc, agent) => acc + agent.baldussi_destino, 0)
  const baldussi_origem = report.by_agent.reduce((acc, agent) => acc + agent.baldussi_origem, 0)
  const importedBlip = report.by_agent.reduce((acc, agent) => acc + agent.blip, 0)
  const blip = baldussi_destino === 0 && baldussi_origem === 0 && importedBlip === 0 ? report.total_tickets : importedBlip
  const baldussi_total = baldussi_destino + baldussi_origem
  const total = baldussi_total + blip

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    total,
    agents_with_tickets: report.total_agents_with_tickets,
    pending: report.total_pending,
    baldussi_destino,
    baldussi_origem,
    baldussi_total,
    blip,
    sectors,
    has_report: true,
  }
}

function buildRowFromBaldussi(branch: Branch, board: BaldussiManualBoard): BranchComparisonRow {
  const allAgents = board.sectors.flatMap((sector) => sector.agents)
  const sectors = aggregateSectorsByAgents(
    board.sectors.flatMap((sector) =>
      sector.agents.map((agent) => ({
        sector_name: sector.sector_name,
        baldussi_destino: agent.baldussi_destino,
        baldussi_origem: agent.baldussi_origem,
        blip: agent.blip,
      }))
    )
  )
  const baldussi_destino = allAgents.reduce((acc, agent) => acc + agent.baldussi_destino, 0)
  const baldussi_origem = allAgents.reduce((acc, agent) => acc + agent.baldussi_origem, 0)
  const baldussi_total = baldussi_destino + baldussi_origem
  const blip = allAgents.reduce((acc, agent) => acc + agent.blip, 0)
  const total = baldussi_total + blip
  const agents_with_tickets = allAgents.filter((agent) => agent.total > 0).length

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    total,
    agents_with_tickets,
    pending: 0,
    baldussi_destino,
    baldussi_origem,
    baldussi_total,
    blip,
    sectors,
    has_report: Boolean(board.report_id),
  }
}

export function BranchComparisonPage() {
  const { branches } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const source: ComparisonSource = 'excel'
  const [sectorFilter, setSectorFilter] = useState('all')
  const [activeAttendanceFilters, setActiveAttendanceFilters] = useState<ComparisonAttendanceFilter[]>([
    'baldussi_total',
    'blip',
  ])
  const [rows, setRows] = useState<BranchComparisonRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (branches.length === 0) {
      setRows([])
      return
    }

    let active = true
    setIsLoading(true)
    setError('')

    const load = async () => {
      const resultRows = await Promise.all(
        branches.map(async (branch) => {
          try {
            if (source === 'excel') {
              const { data } = await api.get<ReportConsolidated>(`/reports/${branch.id}/${selectedYear}/${selectedMonth}`)
              return buildRowFromExcel(branch, data)
            }

            const { data } = await api.get<BaldussiManualBoard>(
              `/reports/${branch.id}/${selectedYear}/${selectedMonth}/manual-baldussi`
            )
            return buildRowFromBaldussi(branch, data)
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
              return buildZeroRow(branch)
            }
            return {
              ...buildZeroRow(branch),
              load_error: getApiErrorMessage(err),
            }
          }
        })
      )

      if (!active) {
        return
      }

      setRows(resultRows)

      if (resultRows.some((row) => row.load_error)) {
        setError('Algumas filiais tiveram falha ao carregar. Verifique a tabela para detalhes.')
      }
    }

    load()
      .catch((err) => {
        if (!active) {
          return
        }
        setRows([])
        setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (!active) {
          return
        }
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [branches, selectedMonth, selectedYear])

  const sectorOptions = useMemo(() => {
    const optionsMap = new Map<string, string>()
    rows.forEach((row) => {
      row.sectors.forEach((sector) => {
        if (!optionsMap.has(sector.key)) {
          optionsMap.set(sector.key, sector.name)
        }
      })
    })

    return Array.from(optionsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [rows])

  useEffect(() => {
    if (sectorFilter === 'all') {
      return
    }
    const stillExists = sectorOptions.some((option) => option.value === sectorFilter)
    if (!stillExists) {
      setSectorFilter('all')
    }
  }, [sectorFilter, sectorOptions])

  const rowsWithSelectedTotal = useMemo(() => {
    const mappedRows = rows.map(
      (row): BranchComparisonDisplayRow => {
        const selectedSector = sectorFilter === 'all' ? null : row.sectors.find((sector) => sector.key === sectorFilter)
        const metrics =
          sectorFilter === 'all'
            ? {
                baldussi_destino: row.baldussi_destino,
                baldussi_origem: row.baldussi_origem,
                blip: row.blip,
                agents_with_tickets: row.agents_with_tickets,
              }
            : selectedSector
              ? {
                  baldussi_destino: selectedSector.baldussi_destino,
                  baldussi_origem: selectedSector.baldussi_origem,
                  blip: selectedSector.blip,
                  agents_with_tickets: selectedSector.agents_with_tickets,
                }
              : {
                  baldussi_destino: 0,
                  baldussi_origem: 0,
                  blip: 0,
                  agents_with_tickets: 0,
                }

        const baldussi_total = metrics.baldussi_destino + metrics.baldussi_origem
        return {
          ...row,
          baldussi_destino: metrics.baldussi_destino,
          baldussi_origem: metrics.baldussi_origem,
          baldussi_total,
          blip: metrics.blip,
          total: baldussi_total + metrics.blip,
          agents_with_tickets: metrics.agents_with_tickets,
          pending: sectorFilter === 'all' ? row.pending : 0,
          has_selected_sector: sectorFilter === 'all' ? true : Boolean(selectedSector),
          selected_total: getSelectedTotalFromParts(
            metrics.baldussi_destino,
            metrics.baldussi_origem,
            metrics.blip,
            activeAttendanceFilters
          ),
        }
      }
    )

    return mappedRows.sort((a, b) => {
      if (b.selected_total !== a.selected_total) {
        return b.selected_total - a.selected_total
      }
      return a.branch_name.localeCompare(b.branch_name)
    })
  }, [activeAttendanceFilters, rows, sectorFilter])

  const summary = useMemo(() => {
    const total = rowsWithSelectedTotal.reduce((acc, row) => acc + row.selected_total, 0)
    const totalPending =
      sectorFilter === 'all' ? rowsWithSelectedTotal.reduce((acc, row) => acc + row.pending, 0) : 0
    const totalBlip = rowsWithSelectedTotal.reduce((acc, row) => acc + row.blip, 0)
    const withReport = rowsWithSelectedTotal.filter((row) => (sectorFilter === 'all' ? row.has_report : row.has_selected_sector)).length
    const avg = rowsWithSelectedTotal.length > 0 ? Math.round(total / rowsWithSelectedTotal.length) : 0
    return { total, totalPending, totalBlip, withReport, avg }
  }, [rowsWithSelectedTotal, sectorFilter])

  const selectedFilterLabels = useMemo(
    () =>
      attendanceFilterOptions
        .filter((option) => activeAttendanceFilters.includes(option.value))
        .map((option) => option.label),
    [activeAttendanceFilters]
  )
  const selectedSectorLabel = useMemo(() => {
    if (sectorFilter === 'all') {
      return 'Todos os Setores'
    }
    return sectorOptions.find((option) => option.value === sectorFilter)?.label ?? 'Todos os Setores'
  }, [sectorFilter, sectorOptions])

  const handleAttendanceFilterToggle = (filter: ComparisonAttendanceFilter) => {
    setActiveAttendanceFilters((current) => {
      const alreadySelected = current.includes(filter)
      if (alreadySelected && current.length === 1) {
        return current
      }

      const nextFilters = alreadySelected ? current.filter((currentFilter) => currentFilter !== filter) : [...current, filter]
      return attendanceFilterOptions
        .map((option) => option.value)
        .filter((optionValue) => nextFilters.includes(optionValue))
    })
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title='Comparativo entre filiais'
        subtitle='Comparacao mensal consolidada entre todas as filiais usando o mês/ano global.'
      />

      <Card className='border-[#d5deea]'>
        <CardContent className='space-y-3 p-4'>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='flex flex-wrap items-center gap-3'>
              <div className='flex items-center gap-2'>
                <p className='text-sm font-semibold text-[#20385e]'>Setor:</p>
                <Select
                  className='h-10 min-w-[220px] rounded-xl border-[#c8d5e8] bg-white text-[15px] font-semibold text-[#2a446f]'
                  value={sectorFilter}
                  onChange={(event) => setSectorFilter(event.target.value)}
                >
                  <option value='all'>Todos os Setores</option>
                  {sectorOptions.map((sectorOption) => (
                    <option key={sectorOption.value} value={sectorOption.value}>
                      {sectorOption.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className='rounded-full bg-[#e8f0fb] px-5 py-1 text-[15px] font-semibold text-[#3d5f8a]'>Filiais: {branches.length}</div>
          </div>

          <div className='flex flex-wrap items-start gap-2'>
            <p className='pt-1 text-sm font-semibold text-[#20385e]'>Dados nos Graficos:</p>
            <div className='flex flex-wrap gap-2'>
              {attendanceFilterOptions.map((option) => {
                const isActive = activeAttendanceFilters.includes(option.value)
                return (
                  <button
                    type='button'
                    key={option.value}
                    onClick={() => handleAttendanceFilterToggle(option.value)}
                    className={cn(
                      'inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors',
                      isActive
                        ? 'border-transparent text-white shadow-sm'
                        : 'border-[#c8d5e8] bg-white text-[#2a446f] hover:bg-[#f1f6fd]'
                    )}
                    style={isActive ? { backgroundColor: option.color } : undefined}
                  >
                    <span
                      className={cn('h-2.5 w-2.5 rounded-full', isActive ? 'bg-white/90' : 'bg-[#9bb0cf]')}
                      aria-hidden='true'
                    />
                    {option.label}
                  </button>
                )
              })}
            </div>
          </div>

          {error ? <p className='mt-3 text-sm text-[#b54646]'>{error}</p> : null}
        </CardContent>
      </Card>

      {isLoading ? <p className='text-sm font-medium text-[#5b7091]'>Carregando comparativo...</p> : null}

      {!isLoading && rowsWithSelectedTotal.length === 0 ? (
        <Card className='border-[#d5deea]'>
          <CardContent className='pt-5 text-sm text-[#5b7091]'>Nenhuma filial cadastrada para comparar.</CardContent>
        </Card>
      ) : null}

      {!isLoading && rowsWithSelectedTotal.length > 0 ? (
        <>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <SummaryCard title='Total Geral' value={formatNumber(summary.total)} />
            <SummaryCard title='Filiais com Relatorio' value={formatNumber(summary.withReport)} />
            <SummaryCard title='Media por Filial' value={formatNumber(summary.avg)} />
            <SummaryCard title={source === 'excel' ? 'Pendencias abertas' : 'Total BLIP'} value={formatNumber(source === 'excel' ? summary.totalPending : summary.totalBlip)} />
          </div>

          <Card className='border-[#d5deea]'>
            <CardContent className='flex flex-wrap items-center gap-2 p-4'>
              <p className='text-sm font-semibold text-[#20385e]'>Filtros Ativos:</p>
              <span className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1 text-xs font-semibold text-[#284770]'>
                Setor: {selectedSectorLabel}
              </span>
              {selectedFilterLabels.map((label) => (
                <span
                  key={label}
                  className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1 text-xs font-semibold text-[#284770]'
                >
                  {label}
                </span>
              ))}
            </CardContent>
          </Card>

          <div className='grid gap-4 xl:grid-cols-2'>
            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-1'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Total por Filial</CardTitle>
              </CardHeader>
              <CardContent className='h-[340px] pt-2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={rowsWithSelectedTotal} margin={{ top: 16, right: 8, left: -10, bottom: 4 }}>
                    <CartesianGrid stroke='#d5deec' strokeDasharray='3 3' />
                    <XAxis
                      dataKey='branch_name'
                      tick={{ fill: '#3f567c', fontSize: 12 }}
                      axisLine={{ stroke: '#8ca0be' }}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#607492', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(27, 138, 200, 0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #d5deea' }}
                      formatter={(value) => formatNumber(Number(value))}
                      labelStyle={{ color: '#1f365d', fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />

                    {activeAttendanceFilters.map((filter) => {
                      const option = attendanceFilterOptions.find((candidate) => candidate.value === filter)
                      if (!option) {
                        return null
                      }

                      return (
                        <Bar
                          key={option.value}
                          dataKey={option.value}
                          name={option.label}
                          fill={option.color}
                          maxBarSize={activeAttendanceFilters.length === 1 ? 66 : 30}
                          radius={[6, 6, 0, 0]}
                        >
                          {activeAttendanceFilters.length === 1 ? (
                            <LabelList
                              dataKey={option.value}
                              content={(props) => {
                                const x = Number(props.x ?? 0)
                                const y = Number(props.y ?? 0)
                                const width = Number(props.width ?? 0)
                                const height = Number(props.height ?? 0)
                                const value = Number(props.value ?? 0)
                                const isSmallBar = height < 28

                                return (
                                  <text
                                    x={x + width / 2}
                                    y={isSmallBar ? Math.max(y - 6, 12) : y + 14}
                                    textAnchor='middle'
                                    fill={isSmallBar ? '#3b5680' : '#f8fbff'}
                                    fontSize={12}
                                    fontWeight={700}
                                  >
                                    {formatNumber(value)}
                                  </text>
                                )
                              }}
                            />
                          ) : null}
                        </Bar>
                      )
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-1'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Ranking de Filiais</CardTitle>
              </CardHeader>
              <CardContent className='pt-2'>
                <Table>
                  <TableHeader>
                    <TableRow className='border-b border-[#e0e7f2] bg-[#edf3fb] hover:bg-[#edf3fb]'>
                      <TableHead className='h-10 w-[48px] text-[#335584]'>#</TableHead>
                      <TableHead className='h-10 text-[#335584]'>Filial</TableHead>
                      <TableHead className='h-10 text-[#335584]'>Total (Filtros)</TableHead>
                      <TableHead className='h-10 text-[#335584]'>Atendentes</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {rowsWithSelectedTotal.map((row, index) => (
                      <TableRow key={row.branch_id} className='border-[#edf2f8] hover:bg-transparent'>
                        <TableCell className='py-2 text-[14px] font-bold text-[#1f3d70]'>{index + 1}</TableCell>
                        <TableCell className='py-2 text-[14px] text-[#2a446f]'>{row.branch_name}</TableCell>
                        <TableCell className='py-2 text-[14px] font-semibold text-[#1f3d70]'>
                          {formatNumber(row.selected_total)}
                        </TableCell>
                        <TableCell className='py-2 text-[14px] font-semibold text-[#1f3d70]'>
                          {formatNumber(row.agents_with_tickets)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}

type SummaryCardProps = {
  title: string
  value: string
}

function SummaryCard({ title, value }: SummaryCardProps) {
  return (
    <Card className='border-[#d5deea]'>
      <CardHeader className='pb-1'>
        <CardTitle className='text-[16px] font-semibold text-[#1f3d70]'>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className='font-display text-[42px] font-bold leading-none text-[#16386a]'>{value}</p>
      </CardContent>
    </Card>
  )
}
