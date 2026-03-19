import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api } from '@/lib/api'
import { cn, formatNumber } from '@/lib/utils'
import type { ReportAgentItem, ReportConsolidated, Sector } from '@/types'

type DashboardDataFilter = 'baldussi_destino' | 'baldussi_origem' | 'baldussi_total' | 'blip'
type DashboardAgentRow = ReportAgentItem & { selected_total: number }
type AgentSegment = {
  label: string
  color: string
  value: number
  widthPercent: number
}
type DashboardSectorRow = {
  sector_id: number
  sector_name: string
  color?: string | null
  baldussi_destino: number
  baldussi_origem: number
  baldussi_total: number
  blip: number
  selected_total: number
  percentual: number
  lineColor: string
  lineWidth: number
}

const fallbackSectorColors = ['#68b5a3', '#d4c16e', '#65b3d7', '#7d9fd4', '#8abeb9', '#8c8ec6', '#dea253', '#78a9de']
const dashboardDataFilterOptions: Array<{ value: DashboardDataFilter; label: string; color: string }> = [
  { value: 'baldussi_destino', label: 'Baldussi Destino', color: '#2f62cf' },
  { value: 'baldussi_origem', label: 'Baldussi Origem', color: '#0f9f76' },
  { value: 'baldussi_total', label: 'Baldussi', color: '#f08a24' },
  { value: 'blip', label: 'BLIP', color: '#e14e4e' },
]

function getDataFilterOption(filter: DashboardDataFilter) {
  return (
    dashboardDataFilterOptions.find((option) => option.value === filter) ?? {
      value: filter,
      label: filter,
      color: '#ff7b14',
    }
  )
}

function getAgentFilterSegments(agent: ReportAgentItem, filters: DashboardDataFilter[]) {
  const hasDestino = filters.includes('baldussi_destino')
  const hasOrigem = filters.includes('baldussi_origem')
  const hasBaldussiTotal = filters.includes('baldussi_total')
  const hasBlip = filters.includes('blip')

  const segments: Array<{ filter: DashboardDataFilter; value: number }> = []

  if (hasDestino) {
    segments.push({ filter: 'baldussi_destino', value: agent.baldussi_destino })
  }
  if (hasOrigem) {
    segments.push({ filter: 'baldussi_origem', value: agent.baldussi_origem })
  }
  if (hasBaldussiTotal) {
    const remainingDestino = hasDestino ? 0 : agent.baldussi_destino
    const remainingOrigem = hasOrigem ? 0 : agent.baldussi_origem
    segments.push({ filter: 'baldussi_total', value: remainingDestino + remainingOrigem })
  }
  if (hasBlip) {
    segments.push({ filter: 'blip', value: agent.blip })
  }

  return segments.map((segment) => ({
    ...getDataFilterOption(segment.filter),
    value: segment.value,
  }))
}

function formatCompactNumber(value: number): string {
  if (value >= 1000) {
    const compact = value / 1000
    const text = compact >= 10 ? compact.toFixed(0) : compact.toFixed(1)
    return `${text.replace('.', ',')}k`
  }
  return String(value)
}

function estimateLabelWidth(text: string, fontSizePx: number): number {
  return Math.ceil(text.length * fontSizePx * 0.58 + 6)
}

function resolveSegmentLabel(
  value: number,
  segmentWidthPx: number
): {
  text: string
  fontSizePx: number
  outside: boolean
} {
  const fullText = formatNumber(value)
  const compactText = formatCompactNumber(value)
  const full11 = estimateLabelWidth(fullText, 11)
  const full10 = estimateLabelWidth(fullText, 10)
  const compact10 = estimateLabelWidth(compactText, 10)
  const compact9 = estimateLabelWidth(compactText, 9)

  if (segmentWidthPx >= full11 + 10) {
    return { text: fullText, fontSizePx: 11, outside: false }
  }
  if (segmentWidthPx >= full10 + 8) {
    return { text: fullText, fontSizePx: 10, outside: false }
  }
  if (segmentWidthPx >= compact10 + 8) {
    return { text: compactText, fontSizePx: 10, outside: false }
  }
  if (segmentWidthPx >= compact9 + 6) {
    return { text: compactText, fontSizePx: 9, outside: false }
  }

  return { text: compactText, fontSizePx: 9, outside: true }
}

function layoutOutsideLabels(
  labels: Array<{
    id: string
    text: string
    fontSizePx: number
    color: string
    centerPx: number
  }>,
  fillWidthPx: number
): Array<{
  id: string
  text: string
  fontSizePx: number
  color: string
  leftPx: number
}> {
  if (fillWidthPx <= 0 || labels.length === 0) {
    return []
  }

  const sorted = [...labels].sort((a, b) => a.centerPx - b.centerPx)
  const spacingPx = 4
  let cursorPx = 0

  return sorted.map((label) => {
    const badgeWidthPx = estimateLabelWidth(label.text, label.fontSizePx) + 8
    const maxLeftPx = Math.max(fillWidthPx - badgeWidthPx, 0)
    let leftPx = Math.max(0, Math.min(label.centerPx - badgeWidthPx / 2, maxLeftPx))

    if (leftPx < cursorPx) {
      leftPx = Math.min(cursorPx, maxLeftPx)
    }

    cursorPx = leftPx + badgeWidthPx + spacingPx

    return {
      id: label.id,
      text: label.text,
      fontSizePx: label.fontSizePx,
      color: label.color,
      leftPx,
    }
  })
}

function getFilterValueFromAgent(agent: ReportAgentItem, filter: DashboardDataFilter): number {
  if (filter === 'baldussi_destino') {
    return agent.baldussi_destino
  }
  if (filter === 'baldussi_origem') {
    return agent.baldussi_origem
  }
  if (filter === 'baldussi_total') {
    return agent.baldussi_destino + agent.baldussi_origem
  }
  return agent.blip
}

function getSelectedTotalFromParts(
  baldussiDestino: number,
  baldussiOrigem: number,
  blip: number,
  filters: DashboardDataFilter[]
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

export function DashboardPage() {
  const { selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const [sectorFilter, setSectorFilter] = useState('all')
  const [activeDataFilters, setActiveDataFilters] = useState<DashboardDataFilter[]>(['baldussi_total', 'blip'])
  const [report, setReport] = useState<ReportConsolidated | null>(null)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!selectedBranchId) {
      setSectors([])
      return
    }

    api
      .get<Sector[]>('/sectors', { params: { branch_id: selectedBranchId } })
      .then((response) => setSectors(response.data))
      .catch(() => setSectors([]))
  }, [selectedBranchId])

  useEffect(() => {
    if (!selectedBranchId) {
      setReport(null)
      return
    }

    setIsLoading(true)
    api
      .get<ReportConsolidated>(`/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}`)
      .then((response) => setReport(response.data))
      .catch(() => setReport(null))
      .finally(() => setIsLoading(false))
  }, [selectedBranchId, selectedMonth, selectedYear])

  const filteredAgents = useMemo(() => {
    if (!report) {
      return [] as ReportAgentItem[]
    }
    if (sectorFilter === 'all') {
      return report.by_agent
    }
    return report.by_agent.filter((agent) => String(agent.sector_id) === sectorFilter)
  }, [report, sectorFilter])

  const selectedAgents = useMemo(() => {
    const rows = filteredAgents
      .map(
        (agent): DashboardAgentRow => ({
          ...agent,
          selected_total: getSelectedTotalFromParts(
            agent.baldussi_destino,
            agent.baldussi_origem,
            agent.blip,
            activeDataFilters
          ),
        })
      )
      .sort((a, b) => {
        if (b.selected_total !== a.selected_total) {
          return b.selected_total - a.selected_total
        }
        return b.tickets_finalizados - a.tickets_finalizados
      })

    return rows
  }, [activeDataFilters, filteredAgents])

  const topAgents = selectedAgents.slice(0, 10)
  const maxAgentTickets = Math.max(topAgents[0]?.selected_total ?? 0, 1)
  const visibleAgents = selectedAgents

  const selectedDataFilterLabels = useMemo(
    () =>
      dashboardDataFilterOptions
        .filter((option) => activeDataFilters.includes(option.value))
        .map((option) => option.label),
    [activeDataFilters]
  )

  const totalSelectedTickets = useMemo(() => {
    if (!report) {
      return 0
    }
    return report.by_agent.reduce(
      (acc, agent) =>
        acc + getSelectedTotalFromParts(agent.baldussi_destino, agent.baldussi_origem, agent.blip, activeDataFilters),
      0
    )
  }, [activeDataFilters, report])

  const totalAgentsWithSelectedData = useMemo(() => {
    if (!report) {
      return 0
    }

    return report.by_agent.filter((agent) => {
      const selectedTotal = getSelectedTotalFromParts(agent.baldussi_destino, agent.baldussi_origem, agent.blip, activeDataFilters)
      return selectedTotal > 0
    }).length
  }, [activeDataFilters, report])

  const sectorsWithStyle = useMemo(() => {
    if (!report || report.by_agent.length === 0) {
      return [] as DashboardSectorRow[]
    }

    const sectorsById = new Map<number, DashboardSectorRow>()
    const colorsBySector = new Map(report.by_sector.map((sector) => [sector.sector_id, sector.color]))

    report.by_agent.forEach((agent) => {
      const existing = sectorsById.get(agent.sector_id)
      if (existing) {
        existing.baldussi_destino += agent.baldussi_destino
        existing.baldussi_origem += agent.baldussi_origem
        existing.baldussi_total += agent.baldussi_destino + agent.baldussi_origem
        existing.blip += agent.blip
        return
      }

      sectorsById.set(agent.sector_id, {
        sector_id: agent.sector_id,
        sector_name: agent.sector_name,
        color: colorsBySector.get(agent.sector_id) ?? null,
        baldussi_destino: agent.baldussi_destino,
        baldussi_origem: agent.baldussi_origem,
        baldussi_total: agent.baldussi_destino + agent.baldussi_origem,
        blip: agent.blip,
        selected_total: 0,
        percentual: 0,
        lineColor: '',
        lineWidth: 0,
      })
    })

    const aggregatedRows = Array.from(sectorsById.values())
      .map((sector) => ({
        ...sector,
        selected_total: getSelectedTotalFromParts(
          sector.baldussi_destino,
          sector.baldussi_origem,
          sector.blip,
          activeDataFilters
        ),
      }))
      .sort((a, b) => b.selected_total - a.selected_total)

    const totalSelectedBySector = aggregatedRows.reduce((acc, sector) => acc + sector.selected_total, 0)
    const maxTickets = Math.max(aggregatedRows[0]?.selected_total ?? 0, 1)

    return aggregatedRows.map((sector, index) => {
      const width = sector.selected_total > 0 ? Math.max(Math.round((sector.selected_total / maxTickets) * 100), 8) : 0
      return {
        ...sector,
        percentual: totalSelectedBySector > 0 ? (sector.selected_total / totalSelectedBySector) * 100 : 0,
        lineColor: sector.color || fallbackSectorColors[index % fallbackSectorColors.length],
        lineWidth: width,
      }
    })
  }, [activeDataFilters, report])

  const handleDataFilterToggle = (filter: DashboardDataFilter) => {
    setActiveDataFilters((current) => {
      const alreadySelected = current.includes(filter)
      if (alreadySelected && current.length === 1) {
        return current
      }

      const nextFilters = alreadySelected ? current.filter((currentFilter) => currentFilter !== filter) : [...current, filter]
      const orderedFilters = dashboardDataFilterOptions
        .map((option) => option.value)
        .filter((optionValue) => nextFilters.includes(optionValue))
      return orderedFilters
    })
  }

  return (
    <div className='space-y-5'>
      <Card className='border-[#d5deea]'>
        <CardContent className='flex flex-wrap items-center gap-3 p-4'>
          <div className='flex flex-wrap items-center gap-2'>
            <p className='text-sm font-semibold text-[#20385e]'>Setor:</p>
            <Select
              className='h-10 min-w-[200px] rounded-xl border-[#c8d5e8] bg-white text-[15px] font-semibold text-[#2a446f]'
              value={sectorFilter}
              onChange={(event) => setSectorFilter(event.target.value)}
            >
              <option value='all'>Todos os Setores</option>
              {sectors.map((sector) => (
                <option value={sector.id} key={sector.id}>
                  {sector.name}
                </option>
              ))}
              </Select>
          </div>

          <div className='flex w-full flex-wrap items-start gap-2'>
            <p className='pt-1 text-sm font-semibold text-[#20385e]'>Dados nos Graficos:</p>
            <div className='flex flex-wrap gap-2'>
              {dashboardDataFilterOptions.map((option) => {
                const isActive = activeDataFilters.includes(option.value)
                return (
                  <button
                    type='button'
                    key={option.value}
                    onClick={() => handleDataFilterToggle(option.value)}
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
        </CardContent>
      </Card>

      {isLoading ? <p className='text-sm font-medium text-[#5b7091]'>Carregando relatorio...</p> : null}

      {!isLoading && !report ? (
        <Card className='border-[#d5deea]'>
          <CardContent className='pt-5 text-sm text-[#5b7091]'>Nenhum relatorio encontrado para os filtros atuais.</CardContent>
        </Card>
      ) : null}

      {report ? (
        <>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <DashboardMetricCard title='Total dos Filtros' value={formatNumber(totalSelectedTickets)} tone='blue' />
            <DashboardMetricCard title='Atendentes com Dados' value={formatNumber(totalAgentsWithSelectedData)} tone='green' />
            <DashboardMetricCard title='Pendencias Abertas' value={formatNumber(report.total_pending)} tone='red' />

            <Card className='min-h-[126px] border-[#d5deea] bg-white'>
              <CardContent className='flex h-full flex-col justify-between gap-3 p-5'>
                <p className='text-[16px] font-semibold text-[#1f365d]'>Filtros Ativos</p>
                <div className='flex flex-wrap gap-2'>
                  {selectedDataFilterLabels.map((label) => (
                    <span
                      key={label}
                      className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1 text-xs font-semibold text-[#284770]'
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 xl:grid-cols-2'>
            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-1'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Total por Setor</CardTitle>
              </CardHeader>
              <CardContent className='h-[340px] pt-2'>
                <ResponsiveContainer width='100%' height='100%'>
                  <BarChart data={sectorsWithStyle} margin={{ top: 6, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke='#d5deec' strokeDasharray='3 3' />
                    <XAxis
                      dataKey='sector_name'
                      tick={{ fill: '#3f567c', fontSize: 12 }}
                      axisLine={{ stroke: '#8ca0be' }}
                      tickLine={false}
                    />
                    <YAxis tick={{ fill: '#607492', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: 'rgba(47, 98, 207, 0.08)' }}
                      contentStyle={{ borderRadius: 10, border: '1px solid #d5deea' }}
                      formatter={(value) => formatNumber(Number(value))}
                      labelStyle={{ color: '#1f365d', fontWeight: 700 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />

                    {activeDataFilters.map((filter) => {
                      const option = dashboardDataFilterOptions.find((candidate) => candidate.value === filter)
                      if (!option) {
                        return null
                      }

                      return (
                        <Bar
                          key={option.value}
                          dataKey={option.value}
                          name={option.label}
                          fill={option.color}
                          maxBarSize={activeDataFilters.length === 1 ? 58 : 30}
                          radius={[6, 6, 0, 0]}
                        >
                          {activeDataFilters.length === 1 ? (
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
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Top 10 Atendentes</CardTitle>
              </CardHeader>
              <CardContent className='space-y-2 pt-2'>
                {topAgents.length === 0 ? (
                  <p className='text-sm text-[#5b7091]'>Nao existem atendentes com dados para os filtros selecionados.</p>
                ) : (
                  topAgents.map((agent) => {
                    const percent = Math.round((agent.selected_total / maxAgentTickets) * 100)
                    const width = agent.selected_total > 0 ? Math.max(percent, 30) : 0
                    const isMultiFilterView = activeDataFilters.length > 1
                    const filterSegments = getAgentFilterSegments(agent, activeDataFilters)
                    const segmentBaseTotal = filterSegments.reduce((acc, segment) => acc + segment.value, 0)
                    const segmentsWithSize: AgentSegment[] = filterSegments.map((segment) => ({
                      ...segment,
                      widthPercent: segmentBaseTotal > 0 ? (segment.value / segmentBaseTotal) * 100 : 0,
                    }))

                    return (
                      <div key={agent.id} className='grid grid-cols-1 items-center gap-1 lg:grid-cols-[minmax(0,1fr)_minmax(420px,62%)] lg:gap-2'>
                        <p className='truncate text-[14px] text-[#2a446f]'>
                          <span className='font-medium'>{agent.agent_name}</span>
                          <span className='font-semibold text-[#36507a]'> - {formatNumber(agent.selected_total)}</span>
                        </p>

                        <AgentStackedBar
                          fillPercent={width}
                          segments={segmentsWithSize}
                          totalLabel={formatNumber(agent.selected_total)}
                          isMultiFilterView={isMultiFilterView}
                        />
                      </div>
                    )
                  })
                )}
              </CardContent>
            </Card>
          </div>

          <div className='grid gap-4 xl:grid-cols-[1.08fr_0.92fr]'>
            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Setores</CardTitle>
              </CardHeader>
              <CardContent className='pt-0'>
                <div className='grid grid-cols-[1fr_120px_70px] items-center border-b border-[#e0e7f2] pb-2 text-[15px] text-[#687d9f]'>
                  <p className='font-medium'>Setor</p>
                  <p className='text-right font-medium'>Total</p>
                  <p className='text-right font-medium'>%</p>
                </div>

                <div className='divide-y divide-[#edf2f8]'>
                  {sectorsWithStyle.map((sector) => (
                    <div key={sector.sector_id} className='py-2.5'>
                      <div className='grid grid-cols-[1fr_120px_70px] items-center gap-3 text-[15px]'>
                        <p className='truncate font-medium text-[#2a446f]'>{sector.sector_name}</p>
                        <p className='text-right font-semibold text-[#2c446c]'>{formatNumber(sector.selected_total)}</p>
                        <p className='text-right font-semibold text-[#2c446c]'>{sector.percentual.toFixed(2)}%</p>
                      </div>

                      <div className='mt-2 h-[5px] rounded-full bg-[#e3eaf4]'>
                        <div
                          className='h-full rounded-full'
                          style={{ backgroundColor: sector.lineColor, width: `${sector.lineWidth}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-2'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Atendentes</CardTitle>
              </CardHeader>
              <CardContent className='pt-0'>
                <Table>
                  <TableHeader>
                    <TableRow className='border-b border-[#e0e7f2] hover:bg-transparent'>
                      <TableHead className='h-10 px-0 text-[15px] font-medium text-[#6f83a3]'>Atendente</TableHead>
                      <TableHead className='h-10 px-0 text-[15px] font-medium text-[#6f83a3]'>Setor</TableHead>
                      <TableHead className='h-10 px-0 text-right text-[15px] font-medium text-[#6f83a3]'>Total (Filtros)</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {visibleAgents.map((agent) => (
                      <TableRow key={agent.id} className='border-[#edf2f8] hover:bg-transparent'>
                        <TableCell className='px-0 py-2 text-[14px] text-[#2a446f]'>
                          <span className='font-semibold'>{agent.agent_name}</span>
                          <span className='text-[#546a8f]'> - {agent.sector_name}</span>
                        </TableCell>
                        <TableCell className='px-0 py-2 text-[14px] text-[#314a74]'>{agent.sector_name}</TableCell>
                        <TableCell className='px-0 py-2 text-right text-[14px] font-bold text-[#223a61]'>
                          {formatNumber(agent.selected_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {visibleAgents.length === 0 ? (
                  <p className='mt-3 text-sm text-[#5b7091]'>Sem atendentes para o filtro atual.</p>
                ) : null}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  )
}

type DashboardMetricTone = 'blue' | 'green' | 'red'

type DashboardMetricCardProps = {
  title: string
  value: string
  tone: DashboardMetricTone
}

function DashboardMetricCard({ title, value, tone }: DashboardMetricCardProps) {
  const toneClassMap: Record<DashboardMetricTone, string> = {
    blue: 'from-[#2f62cf] to-[#234fb7]',
    green: 'from-[#0fa596] to-[#4ac28f]',
    red: 'from-[#fb646a] to-[#ff515b]',
  }

  return (
    <Card
      className={cn('relative min-h-[126px] overflow-hidden border-0 text-white shadow-md', `bg-gradient-to-br ${toneClassMap[tone]}`)}
    >
      <div className='absolute -right-14 -top-20 h-40 w-72 rounded-full bg-white/15' />
      <CardContent className='p-5'>
        <p className='text-[16px] font-semibold text-white/95'>{title}</p>
        <p className='mt-2 font-display text-[48px] font-bold leading-none text-white'>{value}</p>
      </CardContent>
    </Card>
  )
}

type AgentStackedBarProps = {
  fillPercent: number
  segments: AgentSegment[]
  totalLabel: string
  isMultiFilterView: boolean
}

function AgentStackedBar({ fillPercent, segments, totalLabel, isMultiFilterView }: AgentStackedBarProps) {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [trackWidthPx, setTrackWidthPx] = useState(0)

  useEffect(() => {
    if (!trackRef.current) {
      return
    }

    const updateWidth = () => {
      if (trackRef.current) {
        setTrackWidthPx(trackRef.current.clientWidth)
      }
    }

    updateWidth()
    const observer = new ResizeObserver(updateWidth)
    observer.observe(trackRef.current)

    return () => {
      observer.disconnect()
    }
  }, [])

  const fillWidthPx = (trackWidthPx * fillPercent) / 100

  const segmentsWithLayout = useMemo(() => {
    const visibleSegments = segments.filter((segment) => segment.value > 0 && segment.widthPercent > 0)
    let runningLeftPercent = 0

    return visibleSegments.map((segment, index) => {
      const isLastSegment = index === visibleSegments.length - 1
      const widthPercent = isLastSegment ? Math.max(100 - runningLeftPercent, 0) : segment.widthPercent
      const segmentWidthPx = (fillWidthPx * widthPercent) / 100
      const labelConfig = resolveSegmentLabel(segment.value, segmentWidthPx)
      const result = {
        ...segment,
        leftPercent: runningLeftPercent,
        widthPercent,
        segmentWidthPx,
        labelConfig,
      }
      runningLeftPercent += widthPercent
      return result
    })
  }, [fillWidthPx, segments])

  const outsideLabels = useMemo(
    () =>
      layoutOutsideLabels(
        segmentsWithLayout
          .filter((segment) => segment.value > 0 && segment.labelConfig.outside)
          .map((segment) => ({
            id: `${segment.label}-${segment.value}-${segment.leftPercent}`,
            text: segment.labelConfig.text,
            fontSizePx: segment.labelConfig.fontSizePx,
            color: segment.color,
            centerPx: (fillWidthPx * (segment.leftPercent + segment.widthPercent / 2)) / 100,
          })),
        fillWidthPx
      ),
    [fillWidthPx, segmentsWithLayout]
  )

  const singleFilterColor = segments[0]?.color ?? '#ff7b14'
  const singleFilterText = segments[0]?.value ? formatNumber(segments[0].value) : '0'
  const reserveLabelRow = isMultiFilterView && outsideLabels.length > 0

  return (
    <div className={cn('relative', reserveLabelRow ? 'h-[52px]' : 'h-9')}>
      {reserveLabelRow ? (
        <div className='absolute left-0 right-12 top-0 z-10 h-4'>
          {outsideLabels.map((outsideLabel) => (
            <div
              key={outsideLabel.id}
              className='absolute top-0 flex h-4 items-center justify-center rounded px-1 shadow-[0_2px_6px_-4px_rgba(15,31,61,0.7)]'
              style={{
                left: `${outsideLabel.leftPx}px`,
                backgroundColor: outsideLabel.color,
              }}
            >
              <span
                className='whitespace-nowrap font-bold leading-none text-white'
                style={{ fontSize: `${outsideLabel.fontSizePx}px` }}
              >
                {outsideLabel.text}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className='absolute bottom-0 left-0 right-0 z-0 h-9 overflow-hidden rounded-md border border-[#dee6f2] bg-[#f9fbfe]'>
        {isMultiFilterView ? (
          <>
            <div ref={trackRef} className='absolute inset-y-0 left-0 right-12 overflow-hidden rounded-l-md'>
              <div className='absolute inset-y-0 left-0 overflow-hidden rounded-l-md' style={{ width: `${fillPercent}%` }}>
                {segmentsWithLayout.map((segment) => (
                  <div
                    key={`${segment.label}-${segment.value}-${segment.leftPercent}`}
                    className='absolute inset-y-0 flex items-center justify-center overflow-hidden'
                    style={{
                      left: `${segment.leftPercent}%`,
                      width: `${segment.widthPercent}%`,
                      backgroundColor: segment.color,
                    }}
                    title={`${segment.label}: ${formatNumber(segment.value)}`}
                  >
                    {!segment.labelConfig.outside ? (
                      <span
                        className='whitespace-nowrap font-bold leading-none text-white'
                        style={{ fontSize: `${segment.labelConfig.fontSizePx}px` }}
                      >
                        {segment.labelConfig.text}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div className='absolute inset-y-0 right-0 flex w-12 items-center justify-end rounded-r-md bg-[#f9fbfe] pr-1 text-[13px] font-bold text-[#2a446f]'>
              {totalLabel}
            </div>
          </>
        ) : (
          <>
            <div
              className='absolute inset-y-0 left-0 flex items-center justify-center rounded-md px-1 text-[12px] font-bold text-white'
              style={{ width: `${fillPercent}%`, backgroundColor: singleFilterColor }}
            >
              {singleFilterText}
            </div>
            <div className='absolute inset-y-0 right-0 flex w-12 items-center justify-end rounded-r-md bg-[#f9fbfe] pr-1 text-[13px] font-bold text-[#2a446f]'>
              {totalLabel}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
