import { useEffect, useMemo, useState } from 'react'

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
import { formatNumber } from '@/lib/utils'
import type { Agent, PendingItem, Sector } from '@/types'

export function PendingPage() {
  const { branches, selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [pendingToAgent, setPendingToAgent] = useState<Record<number, number>>({})
  const [pendingToSector, setPendingToSector] = useState<Record<number, number>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const branchName = useMemo(
    () => branches.find((branch) => branch.id === selectedBranchId)?.name ?? 'Filial selecionada',
    [branches, selectedBranchId]
  )

  const loadPendingItems = async () => {
    try {
      const { data } = await api.get<PendingItem[]>(`/reports/${selectedBranchId}/${selectedYear}/${selectedMonth}/pending`)
      return data
    } catch (err) {
      if (getApiErrorMessage(err) === 'Relatorio nao encontrado') {
        return []
      }
      throw err
    }
  }

  const loadData = async () => {
    if (!selectedBranchId) {
      setPendingItems([])
      setAgents([])
      setSectors([])
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const [pendingData, agentsResponse, sectorsResponse] = await Promise.all([
        loadPendingItems(),
        api.get<Agent[]>('/agents', { params: { branch_id: selectedBranchId } }),
        api.get<Sector[]>('/sectors', { params: { branch_id: selectedBranchId } }),
      ])

      setPendingItems(pendingData)
      setAgents(agentsResponse.data)
      setSectors(sectorsResponse.data)
      setPendingToAgent((current) => keepSelectionForPendingItems(current, pendingData))
      setPendingToSector((current) => keepSelectionForPendingItems(current, pendingData))
    } catch (err) {
      setPendingItems([])
      setError(getApiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadData().catch(() => {
      setError('Falha ao carregar pendencias')
    })
  }, [selectedBranchId, selectedMonth, selectedYear])

  const resolveLink = async (pending: PendingItem) => {
    const agentId = pendingToAgent[pending.id]
    if (!agentId) {
      setError('Selecione um atendente para vincular')
      return
    }

    setError('')
    setResolvingId(pending.id)

    try {
      await api.post(`/reports/${pending.report_id}/pending/${pending.id}/link-agent-and-resolve`, {
        agent_id: agentId,
      })
      await loadData()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setResolvingId(null)
    }
  }

  const resolveCreate = async (pending: PendingItem) => {
    const sectorId = pendingToSector[pending.id]
    if (!sectorId) {
      setError('Selecione um setor para criar o atendente')
      return
    }

    setError('')
    setResolvingId(pending.id)

    try {
      await api.post(`/reports/${pending.report_id}/pending/${pending.id}/create-agent-and-resolve`, {
        sector_id: sectorId,
      })
      await loadData()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setResolvingId(null)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Pendencias'
        subtitle='Nomes do Excel que ainda precisam ser vinculados a um atendente do cadastro.'
      />

      <Card>
        <CardContent className='flex flex-wrap items-center justify-between gap-3 p-5'>
          <div className='flex flex-wrap gap-2 text-sm font-semibold text-[#284770]'>
            <span className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1'>{branchName}</span>
            <span className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1'>
              {selectedMonth}/{selectedYear}
            </span>
            <span className='rounded-full border border-[#d2deee] bg-[#f5f8fe] px-3 py-1'>
              {formatNumber(pendingItems.length)} abertas
            </span>
          </div>
          <Button variant='outline' onClick={() => void loadData()} disabled={isLoading || !selectedBranchId}>
            {isLoading ? 'Carregando...' : 'Atualizar'}
          </Button>
        </CardContent>
      </Card>

      {!selectedBranchId ? (
        <Card>
          <CardContent className='pt-5 text-sm text-amber-700'>Selecione uma filial no menu lateral.</CardContent>
        </Card>
      ) : null}

      {error ? <p className='text-sm font-medium text-red-600'>{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Pendencias abertas</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className='text-sm text-[#5b7091]'>Carregando pendencias...</p>
          ) : (
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
                {pendingItems.length ? (
                  pendingItems.map((pending) => (
                    <TableRow key={pending.id}>
                      <TableCell className='font-semibold text-[#2a446f]'>{pending.raw_name_from_excel}</TableCell>
                      <TableCell>{formatNumber(pending.tickets_finalizados)}</TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-2'>
                          <Select
                            className='min-w-[210px]'
                            value={pendingToAgent[pending.id] ? String(pendingToAgent[pending.id]) : ''}
                            onChange={(event) =>
                              setPendingToAgent((current) => ({ ...current, [pending.id]: Number(event.target.value) }))
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
                          <Button
                            size='sm'
                            disabled={!pendingToAgent[pending.id] || resolvingId === pending.id}
                            onClick={() => void resolveLink(pending)}
                          >
                            {resolvingId === pending.id ? 'Salvando...' : 'Vincular'}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className='flex flex-wrap gap-2'>
                          <Select
                            className='min-w-[180px]'
                            value={pendingToSector[pending.id] ? String(pendingToSector[pending.id]) : ''}
                            onChange={(event) =>
                              setPendingToSector((current) => ({
                                ...current,
                                [pending.id]: Number(event.target.value),
                              }))
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
                          <Button
                            size='sm'
                            variant='secondary'
                            disabled={!pendingToSector[pending.id] || resolvingId === pending.id}
                            onClick={() => void resolveCreate(pending)}
                          >
                            {resolvingId === pending.id ? 'Salvando...' : 'Criar e resolver'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className='text-sm text-[#5b7091]'>
                      Nenhuma pendencia aberta para os filtros atuais.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function keepSelectionForPendingItems(current: Record<number, number>, pendingItems: PendingItem[]) {
  return pendingItems.reduce<Record<number, number>>((next, pending) => {
    if (current[pending.id]) {
      next[pending.id] = current[pending.id]
    }
    return next
  }, {})
}
