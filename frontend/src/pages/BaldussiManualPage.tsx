import { useEffect, useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { BaldussiManualBoard } from '@/types'

type DraftValues = {
  baldussi_destino: number
  baldussi_origem: number
  blip: number
}

type TotalsByType = {
  baldussi_destino: number
  baldussi_origem: number
  blip: number
  total: number
}

function normalizeNonNegativeInt(value: string) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return 0
  }
  return Math.floor(numberValue)
}

function toDraftMap(board: BaldussiManualBoard): Record<number, DraftValues> {
  const map: Record<number, DraftValues> = {}
  board.sectors.forEach((sector) => {
    sector.agents.forEach((agent) => {
      map[agent.agent_id] = {
        baldussi_destino: agent.baldussi_destino,
        baldussi_origem: agent.baldussi_origem,
        blip: agent.blip,
      }
    })
  })
  return map
}

export function BaldussiManualPage() {
  const { user } = useAuth()
  const { selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const isAdmin = user?.role === 'admin'
  const [board, setBoard] = useState<BaldussiManualBoard | null>(null)
  const [draftByAgent, setDraftByAgent] = useState<Record<number, DraftValues>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')

  const loadBoard = async () => {
    if (!selectedBranchId) {
      setBoard(null)
      setDraftByAgent({})
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const { data } = await api.get<BaldussiManualBoard>(
        `/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}/manual-baldussi`
      )
      setBoard(data)
      setDraftByAgent(toDraftMap(data))
    } catch (err) {
      setError(getApiErrorMessage(err))
      setBoard(null)
      setDraftByAgent({})
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadBoard().catch(() => {
      setError('Falha ao carregar aba manual')
    })
  }, [selectedBranchId, selectedMonth, selectedYear])

  const updateField = (agentId: number, field: keyof DraftValues, rawValue: string) => {
    if (!isAdmin) {
      return
    }

    const value = normalizeNonNegativeInt(rawValue)
    setDraftByAgent((prev) => {
      const current = prev[agentId] ?? { baldussi_destino: 0, baldussi_origem: 0, blip: 0 }
      return {
        ...prev,
        [agentId]: {
          ...current,
          [field]: value,
        },
      }
    })
  }

  const totals = useMemo(() => {
    if (!board) {
      return {
        sectors: new Map<number, TotalsByType>(),
        grand: { baldussi_destino: 0, baldussi_origem: 0, blip: 0, total: 0 } satisfies TotalsByType,
      }
    }

    const sectorTotals = new Map<number, TotalsByType>()
    const grand: TotalsByType = {
      baldussi_destino: 0,
      baldussi_origem: 0,
      blip: 0,
      total: 0,
    }

    board.sectors.forEach((sector) => {
      const sectorTotal: TotalsByType = {
        baldussi_destino: 0,
        baldussi_origem: 0,
        blip: 0,
        total: 0,
      }

      sector.agents.forEach((agent) => {
        const draft = draftByAgent[agent.agent_id] ?? {
          baldussi_destino: 0,
          baldussi_origem: 0,
          blip: 0,
        }

        sectorTotal.baldussi_destino += draft.baldussi_destino
        sectorTotal.baldussi_origem += draft.baldussi_origem
        sectorTotal.blip += draft.blip
      })

      sectorTotal.total = sectorTotal.baldussi_destino + sectorTotal.baldussi_origem + sectorTotal.blip
      sectorTotals.set(sector.sector_id, sectorTotal)

      grand.baldussi_destino += sectorTotal.baldussi_destino
      grand.baldussi_origem += sectorTotal.baldussi_origem
      grand.blip += sectorTotal.blip
      grand.total += sectorTotal.total
    })

    return { sectors: sectorTotals, grand }
  }, [board, draftByAgent])

  const saveAll = async (silent = false) => {
    if (!isAdmin || !selectedBranchId || !board) {
      return
    }

    const items = board.sectors.flatMap((sector) =>
      sector.agents.map((agent) => {
        const draft = draftByAgent[agent.agent_id] ?? {
          baldussi_destino: 0,
          baldussi_origem: 0,
          blip: 0,
        }
        return {
          agent_id: agent.agent_id,
          baldussi_destino: draft.baldussi_destino,
          baldussi_origem: draft.baldussi_origem,
          blip: draft.blip,
        }
      })
    )

    setError('')
    if (!silent) {
      setIsSaving(true)
    }

    try {
      const { data } = await api.post<BaldussiManualBoard>(
        `/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}/manual-baldussi/bulk-upsert`,
        { items }
      )
      setBoard(data)
      setDraftByAgent(toDraftMap(data))
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      if (!silent) {
        setIsSaving(false)
      }
    }
  }

  const autoSaveOnBlur = () => {
    if (!isAdmin) {
      return
    }
    void saveAll(true)
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Baldussi Manual'
        subtitle='Lançamento manual por setor: Baldussi Destino, Baldussi Origem e Blip por colaborador.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Filtros e ação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className='grid gap-4 lg:grid-cols-[1fr_280px]'>
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <div className='flex items-end'>
                  <Button variant='outline' onClick={loadBoard} disabled={isLoading || !selectedBranchId}>
                    {isLoading ? 'Carregando...' : 'Recarregar'}
                  </Button>
                </div>
                {isAdmin ? (
                  <div className='flex items-end'>
                    <Button onClick={() => void saveAll()} disabled={isSaving || !selectedBranchId || !board}>
                      {isSaving ? 'Salvando...' : 'Salvar lancamentos'}
                    </Button>
                  </div>
                ) : null}
                <div className='flex items-end'>
                  <p className='rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700'>
                    Mês/Ano global: {selectedMonth}/{selectedYear}
                  </p>
                </div>
              </div>
              
              {!selectedBranchId ? <p className='text-sm text-amber-700'>Selecione uma filial no menu lateral.</p> : null}
              {error ? <p className='text-sm text-red-600'>{error}</p> : null}
            </div>

            <div className='rounded-lg border border-border bg-slate-50 p-3'>
              <p className='text-xs font-semibold uppercase tracking-wide text-slate-500'>Totais do periodo</p>
              <div className='mt-2 space-y-2'>
                <p className='rounded-md bg-slate-900 px-3 py-2 text-sm font-bold text-white'>
                  Total geral: {totals.grand.total}
                </p>
                <p className='rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700'>
                  Baldussi Destino: {totals.grand.baldussi_destino}
                </p>
                <p className='rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700'>
                  Baldussi Origem: {totals.grand.baldussi_origem}
                </p>
                <p className='rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-700'>
                  BLIP: {totals.grand.blip}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {board?.sectors.map((sector) => {
        const sectorTotals = totals.sectors.get(sector.sector_id) ?? {
          baldussi_destino: 0,
          baldussi_origem: 0,
          blip: 0,
          total: 0,
        }

        return (
          <Card key={sector.sector_id}>
            <CardHeader
              className='rounded-t-xl py-3'
              style={{
                backgroundColor: sector.color || '#e2e8f0',
              }}
            >
              <CardTitle className='text-center text-2xl text-slate-900'>{sector.sector_name}</CardTitle>
            </CardHeader>
            <CardContent className='pt-4'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Atendente</TableHead>
                    <TableHead>Baldussi Destino</TableHead>
                    <TableHead>Baldussi Origem</TableHead>
                    <TableHead>Blip</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sector.agents.map((agent) => {
                    const draft = draftByAgent[agent.agent_id] ?? {
                      baldussi_destino: 0,
                      baldussi_origem: 0,
                      blip: 0,
                    }
                    const rowTotal = draft.baldussi_destino + draft.baldussi_origem + draft.blip

                    return (
                      <TableRow key={agent.agent_id}>
                        <TableCell className='font-medium'>{agent.agent_name}</TableCell>
                        <TableCell>
                          <Input
                            type='number'
                            min={0}
                            value={draft.baldussi_destino}
                            onChange={(e) => updateField(agent.agent_id, 'baldussi_destino', e.target.value)}
                            onBlur={autoSaveOnBlur}
                            readOnly={!isAdmin}
                            className={!isAdmin ? 'cursor-default' : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type='number'
                            min={0}
                            value={draft.baldussi_origem}
                            onChange={(e) => updateField(agent.agent_id, 'baldussi_origem', e.target.value)}
                            onBlur={autoSaveOnBlur}
                            readOnly={!isAdmin}
                            className={!isAdmin ? 'cursor-default' : undefined}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type='number'
                            min={0}
                            value={draft.blip}
                            onChange={(e) => updateField(agent.agent_id, 'blip', e.target.value)}
                            onBlur={autoSaveOnBlur}
                            readOnly={!isAdmin}
                            className={!isAdmin ? 'cursor-default' : undefined}
                          />
                        </TableCell>
                        <TableCell className='text-right text-base font-bold'>{rowTotal}</TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell className='text-base font-bold'>TOTAL DO SETOR</TableCell>
                    <TableCell className='text-right text-base font-bold'>{sectorTotals.baldussi_destino}</TableCell>
                    <TableCell className='text-right text-base font-bold'>{sectorTotals.baldussi_origem}</TableCell>
                    <TableCell className='text-right text-base font-bold'>{sectorTotals.blip}</TableCell>
                    <TableCell className='text-right text-base font-bold'>{sectorTotals.total}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

