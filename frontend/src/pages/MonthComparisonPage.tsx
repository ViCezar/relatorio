import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { BarChart3, CalendarRange, Download, TrendingUp, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api, getApiErrorMessage } from '@/lib/api'
import { exportDataPdf } from '@/lib/pdfExport'
import { cn, formatNumber } from '@/lib/utils'
import type { BaldussiManualBoard, Branch, ReportConsolidated, Sector } from '@/types'

type ComparisonSource = 'excel' | 'baldussi'
type DisplayMode = 'consolidado' | 'por_filial'
type ComparisonAttendanceFilter = 'baldussi_destino' | 'baldussi_origem' | 'baldussi_total' | 'blip'
type TrendLineKey = 'selected_total' | ComparisonAttendanceFilter

type MetricTotals = {
  baldussi_destino: number
  baldussi_origem: number
  blip: number
  total: number
}

type SectorMetrics = MetricTotals & {
  key: string
  name: string
}

type MonthBranchSnapshot = {
  branch_id: number
  branch_name: string
  month: number
  year: number
  totals: MetricTotals
  sectors: SectorMetrics[]
  has_report: boolean
  load_error?: string
}

type FilteredSnapshot = MonthBranchSnapshot & {
  selected: MetricTotals
}

type MonthSummary = MetricTotals & {
  month: number
  label: string
  shortLabel: string
  baldussi_total: number
  selected_total: number
}

type SectorColumn = {
  key: string
  label: string
}

type SectorTableAggregation = {
  byMonth: Map<number, Map<string, number>>
  totalsBySector: Map<string, { label: string; total: number }>
}

type SectorChartRow = {
  sector_key: string
  setor: string
  total_geral: number
} & Record<string, number | string>

const monthCatalog = [
  { value: 1, label: 'Janeiro', shortLabel: 'Jan' },
  { value: 2, label: 'Fevereiro', shortLabel: 'Fev' },
  { value: 3, label: 'Março', shortLabel: 'Mar' },
  { value: 4, label: 'Abril', shortLabel: 'Abr' },
  { value: 5, label: 'Maio', shortLabel: 'Mai' },
  { value: 6, label: 'Junho', shortLabel: 'Jun' },
  { value: 7, label: 'Julho', shortLabel: 'Jul' },
  { value: 8, label: 'Agosto', shortLabel: 'Ago' },
  { value: 9, label: 'Setembro', shortLabel: 'Set' },
  { value: 10, label: 'Outubro', shortLabel: 'Out' },
  { value: 11, label: 'Novembro', shortLabel: 'Nov' },
  { value: 12, label: 'Dezembro', shortLabel: 'Dez' },
]

const defaultSelectedMonths: number[] = []
const monthBarColors = ['#f08a24', '#e14e4e', '#4d9de0', '#2f62cf', '#0f9f76', '#8c6ee3']
const preferredSectorOrder = ['financeiro', 'serasa', 'suporte', 'pos-vendas', 'vendas']
const attendanceFilterOptions: Array<{ value: ComparisonAttendanceFilter; label: string; color: string }> = [
  { value: 'baldussi_destino', label: 'Baldussi Destino', color: '#2f62cf' },
  { value: 'baldussi_origem', label: 'Baldussi Origem', color: '#0f9f76' },
  { value: 'baldussi_total', label: 'Baldussi', color: '#f08a24' },
  { value: 'blip', label: 'BLIP', color: '#e14e4e' },
]

function createEmptyTotals(): MetricTotals {
  return {
    baldussi_destino: 0,
    baldussi_origem: 0,
    blip: 0,
    total: 0,
  }
}

function addTotals(target: MetricTotals, source: MetricTotals) {
  target.baldussi_destino += source.baldussi_destino
  target.baldussi_origem += source.baldussi_origem
  target.blip += source.blip
  target.total += source.total
}

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

function normalizeSectorKey(name: string): string {
  return name.trim().toLocaleLowerCase('pt-BR')
}

function normalizeForSort(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

function getMonthMeta(month: number) {
  return monthCatalog.find((monthOption) => monthOption.value === month) ?? monthCatalog[0]
}

function inferBlipValue(rawBlip: number, destination: number, origin: number, totalTickets: number): number {
  if (rawBlip > 0) {
    return rawBlip
  }
  return Math.max(totalTickets - destination - origin, 0)
}

function buildZeroSnapshot(branch: Branch, year: number, month: number): MonthBranchSnapshot {
  return {
    branch_id: branch.id,
    branch_name: branch.name,
    month,
    year,
    totals: createEmptyTotals(),
    sectors: [],
    has_report: false,
  }
}

function buildSnapshotFromExcel(branch: Branch, year: number, month: number, report: ReportConsolidated): MonthBranchSnapshot {
  const sectorsMap = new Map<string, SectorMetrics>()
  const totals = createEmptyTotals()

  report.by_agent.forEach((agent) => {
    const blip = inferBlipValue(agent.blip, agent.baldussi_destino, agent.baldussi_origem, agent.tickets_finalizados)
    const agentTotals: MetricTotals = {
      baldussi_destino: agent.baldussi_destino,
      baldussi_origem: agent.baldussi_origem,
      blip,
      total: agent.baldussi_destino + agent.baldussi_origem + blip,
    }
    addTotals(totals, agentTotals)

    const sectorKey = normalizeSectorKey(agent.sector_name)
    if (!sectorKey) {
      return
    }

    const existing = sectorsMap.get(sectorKey)
    if (existing) {
      addTotals(existing, agentTotals)
      return
    }

    sectorsMap.set(sectorKey, {
      key: sectorKey,
      name: agent.sector_name,
      ...agentTotals,
    })
  })

  if (totals.total === 0 && report.total_tickets > 0) {
    totals.blip = report.total_tickets
    totals.total = report.total_tickets
  }

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    month,
    year,
    totals,
    sectors: Array.from(sectorsMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    has_report: true,
  }
}

function buildSnapshotFromManual(branch: Branch, year: number, month: number, board: BaldussiManualBoard): MonthBranchSnapshot {
  const totals = createEmptyTotals()
  const sectors = board.sectors.map((sector) => {
    const sectorTotals = createEmptyTotals()

    sector.agents.forEach((agent) => {
      const blip = inferBlipValue(agent.blip, agent.baldussi_destino, agent.baldussi_origem, agent.total)
      const agentTotals: MetricTotals = {
        baldussi_destino: agent.baldussi_destino,
        baldussi_origem: agent.baldussi_origem,
        blip,
        total: agent.baldussi_destino + agent.baldussi_origem + blip,
      }
      addTotals(sectorTotals, agentTotals)
    })

    if (sectorTotals.total === 0 && sector.total > 0) {
      sectorTotals.blip = sector.total
      sectorTotals.total = sector.total
    }

    addTotals(totals, sectorTotals)

    return {
      key: normalizeSectorKey(sector.sector_name),
      name: sector.sector_name,
      ...sectorTotals,
    }
  })

  return {
    branch_id: branch.id,
    branch_name: branch.name,
    month,
    year,
    totals,
    sectors: sectors.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    has_report: Boolean(board.report_id),
  }
}

function resolveVariation(firstValue: number, lastValue: number): number {
  if (firstValue === 0) {
    return lastValue > 0 ? 100 : 0
  }
  return ((lastValue - firstValue) / firstValue) * 100
}

function formatVariationPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function getMonthDataKey(month: number): string {
  return `month_${month}`
}

export function MonthComparisonPage() {
  const { branches, selectedBranchId } = useBranch()
  const { selectedYear } = usePeriod()
  const source: ComparisonSource = 'excel'

  const [branchFilter, setBranchFilter] = useState<string>(() => (selectedBranchId ? String(selectedBranchId) : ''))
  const [hasBranchSelection, setHasBranchSelection] = useState(false)
  const [sectorFilter, setSectorFilter] = useState('all')
  const [sectorChartFilter, setSectorChartFilter] = useState('all')
  const [selectedMonths, setSelectedMonths] = useState<number[]>(defaultSelectedMonths)
  const [yearFilter, setYearFilter] = useState(selectedYear)
  const [hasYearSelection, setHasYearSelection] = useState(false)
  const [activeAttendanceFilters, setActiveAttendanceFilters] = useState<ComparisonAttendanceFilter[]>(['blip'])
  const [hiddenTrendLineKeys, setHiddenTrendLineKeys] = useState<TrendLineKey[]>([])
  const [displayMode, setDisplayMode] = useState<DisplayMode>('consolidado')

  const [sectorOptionsBase, setSectorOptionsBase] = useState<Array<{ value: string; label: string }>>([])
  const [snapshots, setSnapshots] = useState<MonthBranchSnapshot[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (hasBranchSelection) {
      return
    }
    if (selectedBranchId && branches.some((branch) => branch.id === selectedBranchId)) {
      setBranchFilter(String(selectedBranchId))
      return
    }
    if (!branchFilter && branches.length > 0) {
      setBranchFilter(String(branches[0].id))
    }
  }, [branchFilter, branches, hasBranchSelection, selectedBranchId])

  useEffect(() => {
    if (!hasYearSelection) {
      setYearFilter(selectedYear)
    }
  }, [hasYearSelection, selectedYear])

  useEffect(() => {
    if (branchFilter !== 'all' && displayMode === 'por_filial') {
      setDisplayMode('consolidado')
    }
  }, [branchFilter, displayMode])

  const selectedMonthsSorted = useMemo(() => [...selectedMonths].sort((a, b) => a - b), [selectedMonths])
  const visibleTrendLineKeys = useMemo<TrendLineKey[]>(() => {
    return ['selected_total', ...activeAttendanceFilters]
  }, [activeAttendanceFilters])

  useEffect(() => {
    setHiddenTrendLineKeys((current) => current.filter((lineKey) => visibleTrendLineKeys.includes(lineKey)))
  }, [visibleTrendLineKeys])

  const handleTrendLegendClick = (entry: unknown) => {
    if (!entry || typeof entry !== 'object' || !('dataKey' in entry)) {
      return
    }

    const lineKey = String((entry as { dataKey?: unknown }).dataKey ?? '')
    if (!visibleTrendLineKeys.includes(lineKey as TrendLineKey)) {
      return
    }

    setHiddenTrendLineKeys((current) =>
      current.includes(lineKey as TrendLineKey)
        ? current.filter((currentKey) => currentKey !== lineKey)
        : [...current, lineKey as TrendLineKey]
    )
  }

  const selectedBranches = useMemo(() => {
    if (branchFilter === 'all') {
      const activeBranches = branches.filter((branch) => branch.active)
      return activeBranches.length > 0 ? activeBranches : branches
    }

    const branchId = Number(branchFilter)
    if (!Number.isFinite(branchId)) {
      return [] as Branch[]
    }
    const branch = branches.find((candidate) => candidate.id === branchId)
    return branch ? [branch] : []
  }, [branchFilter, branches])

  useEffect(() => {
    let active = true

    const loadSectors = async () => {
      try {
        const params = branchFilter !== 'all' && branchFilter ? { branch_id: Number(branchFilter) } : undefined
        const requestConfig = params ? { params } : undefined
        const { data } = await api.get<Sector[]>('/sectors', requestConfig)
        if (!active) {
          return
        }

        const optionsMap = new Map<string, string>()
        data
          .filter((sector) => sector.active)
          .forEach((sector) => {
            const key = normalizeSectorKey(sector.name)
            if (!key || optionsMap.has(key)) {
              return
            }
            optionsMap.set(key, sector.name)
          })

        const options = Array.from(optionsMap.entries())
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

        setSectorOptionsBase(options)
      } catch {
        if (!active) {
          return
        }
        setSectorOptionsBase([])
      }
    }

    void loadSectors()

    return () => {
      active = false
    }
  }, [branchFilter])

  useEffect(() => {
    if (selectedBranches.length === 0 || selectedMonthsSorted.length === 0) {
      setSnapshots([])
      return
    }

    let active = true
    setIsLoading(true)
    setError('')

    const loadSnapshots = async () => {
      const requests = selectedBranches.flatMap((branch) =>
        selectedMonthsSorted.map((month) => ({
          branch,
          month,
        }))
      )

      const loadedSnapshots = await Promise.all(
        requests.map(async ({ branch, month }) => {
          try {
            if (source === 'excel') {
              const { data } = await api.get<ReportConsolidated>(`/reports/${branch.id}/${yearFilter}/${month}`)
              return buildSnapshotFromExcel(branch, yearFilter, month, data)
            }

            const { data } = await api.get<BaldussiManualBoard>(
              `/reports/${branch.id}/${yearFilter}/${month}/manual-baldussi`
            )
            return buildSnapshotFromManual(branch, yearFilter, month, data)
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 404) {
              return buildZeroSnapshot(branch, yearFilter, month)
            }
            return {
              ...buildZeroSnapshot(branch, yearFilter, month),
              load_error: getApiErrorMessage(err),
            }
          }
        })
      )

      if (!active) {
        return
      }

      setSnapshots(loadedSnapshots)
      if (loadedSnapshots.some((snapshot) => snapshot.load_error)) {
        setError('Algumas combinacoes de filial/mês tiveram falha de carga. Os dados restantes foram exibidos.')
      }
    }

    loadSnapshots()
      .catch((err) => {
        if (!active) {
          return
        }
        setSnapshots([])
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
  }, [selectedBranches, selectedMonthsSorted, source, yearFilter])

  const sectorOptions = useMemo(() => {
    const optionsMap = new Map<string, string>()

    sectorOptionsBase.forEach((option) => {
      optionsMap.set(option.value, option.label)
    })
    snapshots.forEach((snapshot) => {
      snapshot.sectors.forEach((sector) => {
        if (!optionsMap.has(sector.key)) {
          optionsMap.set(sector.key, sector.name)
        }
      })
    })

    return Array.from(optionsMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))
  }, [sectorOptionsBase, snapshots])

  useEffect(() => {
    if (sectorFilter === 'all') {
      return
    }

    if (!sectorOptions.some((option) => option.value === sectorFilter)) {
      setSectorFilter('all')
    }
  }, [sectorFilter, sectorOptions])

  const filteredSnapshots = useMemo<FilteredSnapshot[]>(() => {
    return snapshots.map((snapshot) => {
      if (sectorFilter === 'all') {
        return {
          ...snapshot,
          selected: snapshot.totals,
        }
      }

      const sector = snapshot.sectors.find((candidate) => candidate.key === sectorFilter)
      return {
        ...snapshot,
        selected: sector
          ? {
              baldussi_destino: sector.baldussi_destino,
              baldussi_origem: sector.baldussi_origem,
              blip: sector.blip,
              total: sector.total,
            }
          : createEmptyTotals(),
      }
    })
  }, [sectorFilter, snapshots])

  const monthSummary = useMemo<MonthSummary[]>(() => {
    return selectedMonthsSorted.map((month) => {
      const totals = createEmptyTotals()

      filteredSnapshots.forEach((snapshot) => {
        if (snapshot.month !== month) {
          return
        }
        addTotals(totals, snapshot.selected)
      })

      const monthMeta = getMonthMeta(month)
      return {
        month,
        label: `${monthMeta.label}/${yearFilter}`,
        shortLabel: monthMeta.shortLabel,
        baldussi_total: totals.baldussi_destino + totals.baldussi_origem,
        selected_total: getSelectedTotalFromParts(
          totals.baldussi_destino,
          totals.baldussi_origem,
          totals.blip,
          activeAttendanceFilters
        ),
        ...totals,
      }
    })
  }, [activeAttendanceFilters, filteredSnapshots, selectedMonthsSorted, yearFilter])

  const totalGeneral = useMemo(
    () => monthSummary.reduce((accumulator, current) => accumulator + current.selected_total, 0),
    [monthSummary]
  )

  const averagePerMonth = monthSummary.length > 0 ? Math.round(totalGeneral / monthSummary.length) : 0
  const bestMonth =
    monthSummary.length > 0
      ? monthSummary.reduce((best, current) => (current.selected_total > best.selected_total ? current : best))
      : null

  const variation = useMemo(() => {
    if (monthSummary.length < 2) {
      return {
        label: '-',
        percentText: '0%',
        value: 0,
      }
    }

    const first = monthSummary[0]
    const last = monthSummary[monthSummary.length - 1]
    const variationValue = resolveVariation(first.selected_total, last.selected_total)
    const signedValue = formatVariationPercent(variationValue)

    return {
      label: `${last.shortLabel} vs ${first.shortLabel}`,
      percentText: signedValue,
      value: variationValue,
    }
  }, [monthSummary])

  const previousMonthSummaryByMonth = useMemo(() => {
    const map = new Map<number, MonthSummary | null>()
    monthSummary.forEach((item, index) => {
      map.set(item.month, index > 0 ? monthSummary[index - 1] : null)
    })
    return map
  }, [monthSummary])

  const filteredSnapshotMap = useMemo(() => {
    const map = new Map<string, number>()
    filteredSnapshots.forEach((snapshot) => {
      map.set(
        `${snapshot.branch_id}-${snapshot.month}`,
        getSelectedTotalFromParts(
          snapshot.selected.baldussi_destino,
          snapshot.selected.baldussi_origem,
          snapshot.selected.blip,
          activeAttendanceFilters
        )
      )
    })
    return map
  }, [activeAttendanceFilters, filteredSnapshots])

  const branchSeries = useMemo(
    () =>
      selectedBranches.map((branch) => {
        const data = selectedMonthsSorted.map((month) => {
          const selectedTotal = filteredSnapshotMap.get(`${branch.id}-${month}`) ?? 0
          const monthMeta = getMonthMeta(month)
          return {
            month,
            label: monthMeta.shortLabel,
            total: selectedTotal,
          }
        })

        const total = data.reduce((accumulator, item) => accumulator + item.total, 0)

        return {
          branch,
          total,
          data,
        }
      }),
    [filteredSnapshotMap, selectedBranches, selectedMonthsSorted]
  )

  const sectorChartData = useMemo<SectorChartRow[]>(() => {
    if (sectorFilter !== 'all') {
      return []
    }

    const bySector = new Map<string, { name: string; total: number; valuesByMonth: Record<string, number> }>()

    snapshots.forEach((snapshot) => {
      snapshot.sectors.forEach((sector) => {
        const selectedTotal = getSelectedTotalFromParts(
          sector.baldussi_destino,
          sector.baldussi_origem,
          sector.blip,
          activeAttendanceFilters
        )
        const monthKey = getMonthDataKey(snapshot.month)
        const existing = bySector.get(sector.key)
        if (existing) {
          existing.total += selectedTotal
          existing.valuesByMonth[monthKey] = (existing.valuesByMonth[monthKey] ?? 0) + selectedTotal
          return
        }

        bySector.set(sector.key, {
          name: sector.name,
          total: selectedTotal,
          valuesByMonth: {
            [monthKey]: selectedTotal,
          },
        })
      })
    })

    return Array.from(bySector.entries())
      .sort(([, a], [, b]) => b.total - a.total)
      .map(([key, sector]) => ({
        sector_key: key,
        setor: sector.name,
        total_geral: sector.total,
        ...sector.valuesByMonth,
      }))
  }, [activeAttendanceFilters, sectorFilter, snapshots])

  const sectorChartOptions = useMemo(
    () =>
      sectorChartData
        .map((row) => ({ value: row.sector_key, label: row.setor }))
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
    [sectorChartData]
  )

  useEffect(() => {
    if (sectorChartFilter === 'all') {
      return
    }
    if (!sectorChartOptions.some((option) => option.value === sectorChartFilter)) {
      setSectorChartFilter('all')
    }
  }, [sectorChartFilter, sectorChartOptions])

  const filteredSectorChartData = useMemo(() => {
    if (sectorChartFilter === 'all') {
      return sectorChartData
    }
    return sectorChartData.filter((row) => row.sector_key === sectorChartFilter)
  }, [sectorChartData, sectorChartFilter])

  const sectorTableAggregation = useMemo<SectorTableAggregation>(() => {
    const byMonth = new Map<number, Map<string, number>>()
    const totalsBySector = new Map<string, { label: string; total: number }>()

    if (sectorFilter === 'all') {
      snapshots.forEach((snapshot) => {
        if (!byMonth.has(snapshot.month)) {
          byMonth.set(snapshot.month, new Map<string, number>())
        }

        const monthMap = byMonth.get(snapshot.month)
        if (!monthMap) {
          return
        }

        snapshot.sectors.forEach((sector) => {
          const selectedTotal = getSelectedTotalFromParts(
            sector.baldussi_destino,
            sector.baldussi_origem,
            sector.blip,
            activeAttendanceFilters
          )
          monthMap.set(sector.key, (monthMap.get(sector.key) ?? 0) + selectedTotal)

          const existing = totalsBySector.get(sector.key)
          if (existing) {
            existing.total += selectedTotal
            return
          }

          totalsBySector.set(sector.key, {
            label: sector.name,
            total: selectedTotal,
          })
        })
      })
    } else {
      filteredSnapshots.forEach((snapshot) => {
        if (!byMonth.has(snapshot.month)) {
          byMonth.set(snapshot.month, new Map<string, number>())
        }

        const monthMap = byMonth.get(snapshot.month)
        if (!monthMap) {
          return
        }

        monthMap.set(
          sectorFilter,
          (monthMap.get(sectorFilter) ?? 0) +
            getSelectedTotalFromParts(
              snapshot.selected.baldussi_destino,
              snapshot.selected.baldussi_origem,
              snapshot.selected.blip,
              activeAttendanceFilters
            )
        )
      })
    }

    return { byMonth, totalsBySector }
  }, [activeAttendanceFilters, filteredSnapshots, sectorFilter, snapshots])

  const selectedSectorLabel = useMemo(() => {
    if (sectorFilter === 'all') {
      return 'Todos os setores'
    }
    return sectorOptions.find((option) => option.value === sectorFilter)?.label ?? 'Setor'
  }, [sectorFilter, sectorOptions])

  const tableSectorColumns = useMemo<SectorColumn[]>(() => {
    if (sectorFilter !== 'all') {
      return [{ key: sectorFilter, label: selectedSectorLabel }]
    }

    const preferredOrderMap = new Map(preferredSectorOrder.map((name, index) => [name, index]))

    return Array.from(sectorTableAggregation.totalsBySector.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        total: value.total,
      }))
      .sort((a, b) => {
        const normalizedA = normalizeForSort(a.label)
        const normalizedB = normalizeForSort(b.label)
        const preferredA = preferredOrderMap.get(normalizedA)
        const preferredB = preferredOrderMap.get(normalizedB)

        if (preferredA !== undefined && preferredB !== undefined) {
          return preferredA - preferredB
        }
        if (preferredA !== undefined) {
          return -1
        }
        if (preferredB !== undefined) {
          return 1
        }
        if (b.total !== a.total) {
          return b.total - a.total
        }
        return a.label.localeCompare(b.label, 'pt-BR')
      })
      .map(({ key, label }) => ({ key, label }))
  }, [sectorFilter, sectorTableAggregation.totalsBySector, selectedSectorLabel])

  const tableRows = useMemo(
    () =>
      monthSummary.map((monthItem) => {
        const monthValues = sectorTableAggregation.byMonth.get(monthItem.month)
        const sectors = tableSectorColumns.map((column) => ({
          key: column.key,
          value: monthValues?.get(column.key) ?? 0,
        }))

        return {
          ...monthItem,
          sectors,
        }
      }),
    [monthSummary, sectorTableAggregation.byMonth, tableSectorColumns]
  )

  const totalByColumn = useMemo(
    () =>
      tableSectorColumns.map((column) => ({
        key: column.key,
        value: tableRows.reduce((accumulator, current) => {
          const found = current.sectors.find((sector) => sector.key === column.key)
          return accumulator + (found?.value ?? 0)
        }, 0),
      })),
    [tableRows, tableSectorColumns]
  )

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const options = Array.from({ length: 9 }, (_, index) => currentYear - 3 + index)
    if (!options.includes(selectedYear)) {
      options.push(selectedYear)
    }
    if (!options.includes(yearFilter)) {
      options.push(yearFilter)
    }
    return options.sort((a, b) => a - b)
  }, [selectedYear, yearFilter])

  const toggleMonthSelection = (month: number) => {
    setSelectedMonths((current) => {
      if (current.includes(month)) {
        if (current.length === 1) {
          return current
        }
        return current.filter((selectedMonth) => selectedMonth !== month)
      }

      return [...current, month].sort((a, b) => a - b)
    })
  }

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

  const handleExportPdf = () => {
    if (monthSummary.length === 0) {
      return
    }

    const branchLabel =
      branchFilter === 'all'
        ? 'Todas as Filiais'
        : branches.find((branch) => String(branch.id) === branchFilter)?.name ?? 'Filial'
    const activeFilterOptions = attendanceFilterOptions.filter((option) => activeAttendanceFilters.includes(option.value))
    const activeSeries = activeFilterOptions.map((option) => ({
      key: option.value,
      label: option.label,
      color: option.color,
    }))
    const lineSeries = [{ key: 'selected_total', label: 'Total (Filtros)', color: '#1f4b8f' }, ...activeSeries]
    const tableColumns = [
      { header: 'Mes', accessor: 'label', width: 32 },
      { header: 'Total (Filtros)', accessor: 'selected_total', align: 'right' as const, width: 35 },
      ...tableSectorColumns.map((column) => ({
        header: column.label,
        accessor: column.key,
        align: 'right' as const,
        width: 30,
      })),
    ]

    exportDataPdf({
      title: 'Comparativo Entre Meses',
      subtitle: `${branchLabel} | ${yearFilter}`,
      filename: `comparativo-meses-${yearFilter}.pdf`,
      meta: [
        `Filial: ${branchLabel}`,
        `Setor: ${selectedSectorLabel}`,
        `Meses: ${selectedMonthsSorted.map((month) => getMonthMeta(month).shortLabel).join(', ')}`,
        `Dados: ${activeFilterOptions.map((option) => option.label).join(', ')}`,
      ],
      metrics: [
        { label: 'Total Geral', value: formatNumber(totalGeneral), color: '#2f62cf' },
        { label: 'Media por Mes', value: formatNumber(averagePerMonth), color: '#0f9f76' },
        {
          label: 'Melhor Mes',
          value: bestMonth ? `${bestMonth.shortLabel}/${yearFilter}` : '-',
          helper: bestMonth ? formatNumber(bestMonth.selected_total) : '-',
          color: '#f08a24',
        },
        { label: 'Variacao Ultimo vs Primeiro', value: variation.percentText, helper: variation.label, color: '#e14e4e' },
      ],
      charts: [
        {
          title: 'Evolucao Mensal',
          type: 'line',
          rows: monthSummary.map((monthItem) => ({
            label: monthItem.shortLabel,
            values: lineSeries.reduce<Record<string, number>>((accumulator, series) => {
              accumulator[series.key] = Number(monthItem[series.key as keyof MonthSummary] ?? 0)
              return accumulator
            }, {}),
          })),
          series: lineSeries,
        },
        sectorFilter === 'all'
          ? {
              title: 'Total por Setor',
              rows: filteredSectorChartData.map((row) => ({
                label: row.setor,
                values: selectedMonthsSorted.reduce<Record<string, number>>((accumulator, month) => {
                  const key = getMonthDataKey(month)
                  accumulator[key] = Number(row[key] ?? 0)
                  return accumulator
                }, {}),
              })),
              series: selectedMonthsSorted.map((month, index) => ({
                key: getMonthDataKey(month),
                label: `${getMonthMeta(month).shortLabel}/${yearFilter}`,
                color: monthBarColors[index % monthBarColors.length],
              })),
              maxRows: 10,
            }
          : {
              title: `Detalhe do Setor: ${selectedSectorLabel}`,
              rows: monthSummary.map((monthItem) => ({
                label: monthItem.shortLabel,
                values: activeFilterOptions.reduce<Record<string, number>>((accumulator, series) => {
                  accumulator[series.value] = Number(monthItem[series.value] ?? 0)
                  return accumulator
                }, {}),
              })),
              series: activeSeries,
              maxRows: 12,
            },
      ],
      tables: [
        {
          title: 'Resumo por Mes',
          columns: tableColumns,
          rows: tableRows.map((row) => {
            const sectorValues = row.sectors.reduce<Record<string, number>>((accumulator, sector) => {
              accumulator[sector.key] = sector.value
              return accumulator
            }, {})

            return {
              label: row.label,
              selected_total: row.selected_total,
              ...sectorValues,
            }
          }),
          footerRows: [
            {
              label: `Total (${selectedMonthsSorted.length} meses)`,
              selected_total: totalGeneral,
              ...totalByColumn.reduce<Record<string, number>>((accumulator, totalItem) => {
                accumulator[totalItem.key] = totalItem.value
                return accumulator
              }, {}),
            },
          ],
        },
      ],
    })
  }

  const hasDataToDisplay = selectedBranches.length > 0 && selectedMonthsSorted.length > 0

  return (
    <div className='space-y-5'>
      <Card className='border-[#d5deea]'>
        <CardHeader className='pb-1'>
          <CardTitle className='text-[18px] font-semibold text-[#1f365d]'>Filtros</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 pt-3'>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='min-w-[220px] flex-1'>
              <p className='mb-2 text-sm font-semibold text-[#20385e]'>Filial:</p>
              <Select
                className='h-10 rounded-xl border-[#c8d5e8] bg-white text-[15px] font-semibold text-[#2a446f]'
                value={branchFilter}
                onChange={(event) => {
                  setHasBranchSelection(true)
                  setBranchFilter(event.target.value)
                }}
              >
                <option value='all'>Todas as filiais</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className='min-w-[220px] flex-1'>
              <p className='mb-2 text-sm font-semibold text-[#20385e]'>Setor:</p>
              <Select
                className='h-10 rounded-xl border-[#c8d5e8] bg-white text-[15px] font-semibold text-[#2a446f]'
                value={sectorFilter}
                onChange={(event) => setSectorFilter(event.target.value)}
              >
                <option value='all'>Todos os setores</option>
                {sectorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className='min-w-[150px]'>
              <p className='mb-2 text-sm font-semibold text-[#20385e]'>Ano:</p>
              <Select
                className='h-10 rounded-xl border-[#c8d5e8] bg-white text-[15px] font-semibold text-[#2a446f]'
                value={String(yearFilter)}
                onChange={(event) => {
                  setHasYearSelection(true)
                  setYearFilter(Number(event.target.value))
                }}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </div>

            {branchFilter === 'all' ? (
              <div className='ml-auto rounded-full bg-[#e8f0fb] px-5 py-1 text-[15px] font-semibold text-[#3d5f8a]'>
                Filiais: {selectedBranches.length}
              </div>
            ) : null}
          </div>

          <div>
            <p className='mb-2 text-sm font-semibold text-[#20385e]'>Meses:</p>
            <div className='flex flex-wrap gap-2'>
              {monthCatalog.map((month) => {
                const isActive = selectedMonths.includes(month.value)
                return (
                  <button
                    type='button'
                    key={month.value}
                    onClick={() => toggleMonthSelection(month.value)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-sm font-semibold transition-colors',
                      isActive
                        ? 'border-transparent bg-[#173b6d] text-white'
                        : 'border-[#c8d5e8] bg-white text-[#2a446f] hover:bg-[#f1f6fd]'
                    )}
                  >
                    {month.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className='mb-2 text-sm font-semibold text-[#20385e]'>Atendimentos para acompanhamento:</p>
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

          {error ? <p className='text-sm text-[#b54646]'>{error}</p> : null}
        </CardContent>
      </Card>

      {isLoading ? <p className='text-sm font-medium text-[#5b7091]'>Carregando comparativo...</p> : null}

      {!isLoading && !hasDataToDisplay ? (
        <Card className='border-[#d5deea]'>
          <CardContent className='pt-5 text-sm text-[#5b7091]'>Selecione ao menos uma filial e um mês para comparar.</CardContent>
        </Card>
      ) : null}

      {!isLoading && hasDataToDisplay ? (
        <>
          <div className='grid gap-3 md:grid-cols-2 xl:grid-cols-4'>
            <KpiCard title='Total (Filtros)' value={formatNumber(totalGeneral)} icon={BarChart3} />
            <KpiCard title='Media por Mes' value={formatNumber(averagePerMonth)} icon={CalendarRange} />
            <KpiCard
              title='Melhor Mes'
              value={bestMonth ? `${bestMonth.shortLabel}/${yearFilter}` : '-'}
              helper={bestMonth ? formatNumber(bestMonth.selected_total) : '-'}
              icon={Trophy}
            />
            <KpiCard
              title='Variacao Ultimo vs Primeiro'
              value={variation.percentText}
              helper={variation.label}
              icon={TrendingUp}
              valueClassName={cn(variation.value < 0 ? 'text-[#d44a4a]' : 'text-[#1b5c96]')}
            />
          </div>

          <Card className='border-[#d5deea]'>
            <CardHeader className='pb-1'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Total Geral por Mês</CardTitle>

                {branchFilter === 'all' ? (
                  <div className='inline-flex rounded-xl border border-[#c8d5e8] bg-[#f5f8fe] p-1'>
                    <button
                      type='button'
                      onClick={() => setDisplayMode('consolidado')}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                        displayMode === 'consolidado' ? 'bg-white text-[#173a67] shadow-sm' : 'text-[#4b6286]'
                      )}
                    >
                      Exibir: Consolidado
                    </button>
                    <button
                      type='button'
                      onClick={() => setDisplayMode('por_filial')}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors',
                        displayMode === 'por_filial' ? 'bg-white text-[#173a67] shadow-sm' : 'text-[#4b6286]'
                      )}
                    >
                      Exibir: Por filial
                    </button>
                  </div>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className='pt-2'>
              {branchFilter === 'all' && displayMode === 'por_filial' ? (
                <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
                  {branchSeries.map((seriesItem) => (
                    <div key={seriesItem.branch.id} className='rounded-xl border border-[#d7e2f0] bg-[#fbfdff] p-3'>
                      <div className='mb-2 flex items-center justify-between gap-2'>
                        <p className='truncate text-sm font-semibold text-[#1f3d70]'>{seriesItem.branch.name}</p>
                        <span className='text-sm font-bold text-[#284770]'>{formatNumber(seriesItem.total)}</span>
                      </div>
                      <div className='h-24'>
                        <ResponsiveContainer width='100%' height='100%'>
                          <LineChart data={seriesItem.data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                            <XAxis dataKey='label' tick={{ fill: '#4f668a', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis hide />
                            <Tooltip
                              formatter={(value) => formatNumber(Number(value))}
                              labelFormatter={(label) => String(label)}
                              contentStyle={{ borderRadius: 10, border: '1px solid #d5deea' }}
                            />
                            <Line
                              type='monotone'
                              dataKey='total'
                              name='Total'
                              stroke='#2f62cf'
                              strokeWidth={2}
                              dot={{ r: 2.5 }}
                              activeDot={{ r: 4 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className='h-[340px]'>
                  <ResponsiveContainer width='100%' height='100%'>
                    <LineChart data={monthSummary} margin={{ top: 12, right: 16, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke='#d5deec' strokeDasharray='3 3' />
                      <XAxis
                        dataKey='shortLabel'
                        tick={{ fill: '#3f567c', fontSize: 12 }}
                        axisLine={{ stroke: '#8ca0be' }}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: '#607492', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload || payload.length === 0) {
                            return null
                          }

                          const row = payload[0]?.payload as MonthSummary | undefined
                          if (!row) {
                            return null
                          }

                          const previousMonth = previousMonthSummaryByMonth.get(row.month) ?? null

                          return (
                            <div className='rounded-[10px] border border-[#d5deea] bg-white px-3 py-2 shadow-sm'>
                              <p className='mb-1 text-[16px] font-semibold text-[#1f365d]'>{row.label}</p>
                              <div className='space-y-1.5'>
                                {payload.map((entry) => {
                                  const dataKey = String(entry.dataKey ?? '')
                                  const currentValue = Number(entry.value ?? 0)
                                  const previousValue =
                                    previousMonth && dataKey in previousMonth
                                      ? Number((previousMonth as Record<string, unknown>)[dataKey] ?? 0)
                                      : null
                                  const variationValue =
                                    previousValue === null ? null : resolveVariation(previousValue, currentValue)
                                  const variationText = variationValue === null ? '-' : formatVariationPercent(variationValue)

                                  return (
                                    <div key={`${dataKey}-${String(entry.name ?? '')}`}>
                                      <p className='text-[15px] font-semibold' style={{ color: String(entry.color ?? '#1f4b8f') }}>
                                        {String(entry.name)}: {formatNumber(currentValue)}
                                      </p>
                                      <p
                                        className={cn(
                                          'text-[12px] font-semibold',
                                          variationValue === null
                                            ? 'text-[#6c7f9a]'
                                            : variationValue < 0
                                              ? 'text-[#d44a4a]'
                                              : 'text-[#0f9f76]'
                                        )}
                                      >
                                        {variationText}
                                      </p>
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          )
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12 }}
                        onClick={handleTrendLegendClick}
                        formatter={(value, entry) => {
                          const lineKey = String(entry.dataKey ?? '')
                          const isHidden = hiddenTrendLineKeys.includes(lineKey as TrendLineKey)
                          return (
                            <span style={{ cursor: 'pointer', opacity: isHidden ? 0.45 : 1 }}>
                              {String(value)}
                            </span>
                          )
                        }}
                      />
                      <Line
                        type='monotone'
                        dataKey='selected_total'
                        name='Total (Filtros)'
                        stroke='#1f4b8f'
                        strokeWidth={3}
                        dot={{ r: 4 }}
                        activeDot={{ r: 6 }}
                        hide={hiddenTrendLineKeys.includes('selected_total')}
                      />
                      {activeAttendanceFilters.includes('baldussi_destino') ? (
                        <Line
                          type='monotone'
                          dataKey='baldussi_destino'
                          name='Baldussi Destino'
                          stroke='#2f62cf'
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          hide={hiddenTrendLineKeys.includes('baldussi_destino')}
                        />
                      ) : null}
                      {activeAttendanceFilters.includes('baldussi_origem') ? (
                        <Line
                          type='monotone'
                          dataKey='baldussi_origem'
                          name='Baldussi Origem'
                          stroke='#0f9f76'
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          hide={hiddenTrendLineKeys.includes('baldussi_origem')}
                        />
                      ) : null}
                      {activeAttendanceFilters.includes('baldussi_total') ? (
                        <Line
                          type='monotone'
                          dataKey='baldussi_total'
                          name='Baldussi'
                          stroke='#f08a24'
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          hide={hiddenTrendLineKeys.includes('baldussi_total')}
                        />
                      ) : null}
                      {activeAttendanceFilters.includes('blip') ? (
                        <Line
                          type='monotone'
                          dataKey='blip'
                          name='BLIP'
                          stroke='#e14e4e'
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          hide={hiddenTrendLineKeys.includes('blip')}
                        />
                      ) : null}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <div className='grid gap-4 xl:grid-cols-[1.08fr_0.92fr]'>
            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-1'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>
                    {sectorFilter === 'all' ? 'Total por Setor' : `Detalhe do Setor: ${selectedSectorLabel}`}
                  </CardTitle>

                  {sectorFilter === 'all' ? (
                    <div className='min-w-[220px]'>
                      <p className='mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-[#4e6890]'>Setor no grafico</p>
                      <Select
                        className='h-10 rounded-xl border-[#c8d5e8] bg-white text-[14px] font-semibold text-[#2a446f]'
                        value={sectorChartFilter}
                        onChange={(event) => setSectorChartFilter(event.target.value)}
                      >
                        <option value='all'>Todos os setores</option>
                        {sectorChartOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className='h-[360px] pt-2'>
                {sectorFilter === 'all' ? (
                  filteredSectorChartData.length > 0 ? (
                    <ResponsiveContainer width='100%' height='100%'>
                      <BarChart data={filteredSectorChartData} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                        <CartesianGrid stroke='#d5deec' strokeDasharray='3 3' />
                        <XAxis
                          dataKey='setor'
                          tick={{ fill: '#3f567c', fontSize: 12 }}
                          axisLine={{ stroke: '#8ca0be' }}
                          tickLine={false}
                        />
                        <YAxis tick={{ fill: '#607492', fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ borderRadius: 10, border: '1px solid #d5deea' }}
                          formatter={(value) => formatNumber(Number(value))}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {selectedMonthsSorted.map((month, index) => (
                          <Bar
                            key={month}
                            dataKey={getMonthDataKey(month)}
                            name={`${getMonthMeta(month).shortLabel}/${yearFilter}`}
                            fill={monthBarColors[index % monthBarColors.length]}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={34}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className='text-sm text-[#5b7091]'>Sem dados por setor para os filtros atuais.</p>
                  )
                ) : (
                  <ResponsiveContainer width='100%' height='100%'>
                    <BarChart data={monthSummary} margin={{ top: 8, right: 8, left: -10, bottom: 4 }}>
                      <CartesianGrid stroke='#d5deec' strokeDasharray='3 3' />
                      <XAxis
                        dataKey='shortLabel'
                        tick={{ fill: '#3f567c', fontSize: 12 }}
                        axisLine={{ stroke: '#8ca0be' }}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: '#607492', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: '1px solid #d5deea' }}
                        formatter={(value) => formatNumber(Number(value))}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {attendanceFilterOptions
                        .filter((option) => activeAttendanceFilters.includes(option.value))
                        .map((option) => (
                          <Bar
                            key={option.value}
                            dataKey={option.value}
                            name={option.label}
                            fill={option.color}
                            radius={[4, 4, 0, 0]}
                            maxBarSize={34}
                          />
                        ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className='border-[#d5deea]'>
              <CardHeader className='pb-2'>
                <div className='flex items-center justify-between gap-3'>
                  <CardTitle className='text-[24px] font-bold tracking-tight text-[#1f365d]'>Resumo por Mês</CardTitle>
                  <Button type='button' size='sm' variant='outline' onClick={handleExportPdf} disabled={isLoading || monthSummary.length === 0}>
                    <Download className='mr-2 h-4 w-4' />
                    Exportar PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className='pt-0'>
                <Table className='min-w-[880px]'>
                  <TableHeader>
                    <TableRow className='border-b border-[#e0e7f2] bg-[#edf3fb] hover:bg-[#edf3fb]'>
                      <TableHead className='h-10 text-[#335584]'>Mês</TableHead>
                      <TableHead className='h-10 text-right text-[#335584]'>Total (Filtros)</TableHead>
                      {tableSectorColumns.map((column) => (
                        <TableHead key={column.key} className='h-10 text-right text-[#335584]'>
                          {column.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tableRows.map((row) => (
                      <TableRow key={row.month} className='border-[#edf2f8] hover:bg-transparent'>
                        <TableCell className='py-2 text-[14px] font-semibold text-[#27466f]'>{row.label}</TableCell>
                        <TableCell className='py-2 text-right text-[14px] font-bold text-[#1f3d70]'>
                          {formatNumber(row.selected_total)}
                        </TableCell>
                        {tableSectorColumns.map((column) => (
                          <TableCell key={column.key} className='py-2 text-right text-[14px] font-semibold text-[#1f3d70]'>
                            {formatNumber(row.sectors.find((sector) => sector.key === column.key)?.value ?? 0)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    <TableRow className='border-t border-[#d6e0ee] bg-[#f5f8fd] hover:bg-[#f5f8fd]'>
                      <TableCell className='py-2 text-[14px] font-bold text-[#1e3b67]'>
                        Total ({selectedMonthsSorted.length} meses)
                      </TableCell>
                      <TableCell className='py-2 text-right text-[14px] font-bold text-[#1e3b67]'>
                        {formatNumber(totalGeneral)}
                      </TableCell>
                      {tableSectorColumns.map((column) => (
                        <TableCell key={column.key} className='py-2 text-right text-[14px] font-bold text-[#1e3b67]'>
                          {formatNumber(totalByColumn.find((totalItem) => totalItem.key === column.key)?.value ?? 0)}
                        </TableCell>
                      ))}
                    </TableRow>
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

type KpiCardProps = {
  title: string
  value: string
  helper?: string
  icon: LucideIcon
  valueClassName?: string
}

function KpiCard({ title, value, helper, icon: Icon, valueClassName }: KpiCardProps) {
  return (
    <Card className='border-[#d5deea] bg-white'>
      <CardContent className='p-4'>
        <div className='flex items-center justify-between gap-2'>
          <p className='text-sm font-semibold text-[#355784]'>{title}</p>
          <Icon className='h-4 w-4 text-[#5d7eab]' />
        </div>
        <p className={cn('mt-2 text-[30px] font-bold leading-none text-[#1b5c96]', valueClassName)}>{value}</p>
        {helper ? <p className='mt-2 text-sm font-semibold text-[#5a7193]'>{helper}</p> : null}
      </CardContent>
    </Card>
  )
}
