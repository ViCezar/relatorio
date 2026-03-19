import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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
import type { Agent, Sector } from '@/types'

export function AgentsPage() {
  const { selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const [agents, setAgents] = useState<Agent[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [name, setName] = useState('')
  const [sectorId, setSectorId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingSectorId, setEditingSectorId] = useState<number | null>(null)
  const [savingEditId, setSavingEditId] = useState<number | null>(null)

  const loadAll = async () => {
    if (!selectedBranchId) {
      setAgents([])
      setSectors([])
      return
    }

    const [sectorResponse, agentResponse] = await Promise.all([
      api.get<Sector[]>('/sectors', { params: { branch_id: selectedBranchId } }),
      api.get<Agent[]>('/agents', { params: { branch_id: selectedBranchId, month: selectedMonth, year: selectedYear } }),
    ])

    setSectors(sectorResponse.data)
    setAgents(agentResponse.data)

    if (!sectorId && sectorResponse.data.length > 0) {
      setSectorId(sectorResponse.data[0].id)
    }
  }

  useEffect(() => {
    loadAll().catch(() => {
      setAgents([])
      setSectors([])
    })
  }, [selectedBranchId, selectedMonth, selectedYear])

  const sectorById = new Map(sectors.map((sector) => [sector.id, sector]))

  const createAgent = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedBranchId || !sectorId || !name) {
      return
    }

    setError('')
    try {
      await api.post('/agents', {
        branch_id: selectedBranchId,
        sector_id: sectorId,
        name,
        active: true,
        month: selectedMonth,
        year: selectedYear,
      })
      setName('')
      await loadAll()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const deleteAgent = async (agent: Agent) => {
    const confirmed = window.confirm(
      `Deseja remover o atendente "${agent.name}" apenas do periodo ${selectedMonth}/${selectedYear}?`
    )
    if (!confirmed) {
      return
    }

    setError('')
    setDeletingId(agent.id)

    try {
      await api.delete(`/agents/${agent.id}`, { params: { month: selectedMonth, year: selectedYear } })
      await loadAll()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const startEditAgent = (agent: Agent) => {
    setError('')
    setEditingId(agent.id)
    setEditingName(agent.name)
    setEditingSectorId(agent.sector_id)
  }

  const cancelEditAgent = () => {
    setEditingId(null)
    setEditingName('')
    setEditingSectorId(null)
  }

  const saveEditAgent = async (agentId: number) => {
    const newName = editingName.trim()
    if (!newName) {
      setError('Nome do atendente nao pode ser vazio')
      return
    }
    if (!editingSectorId || !sectors.some((sector) => sector.id === editingSectorId)) {
      setError('Setor invalido para edicao do atendente')
      return
    }

    setError('')
    setSavingEditId(agentId)
    try {
      await api.put(`/agents/${agentId}`, { name: newName, sector_id: editingSectorId })
      await loadAll()
      cancelEditAgent()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSavingEditId(null)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Atendentes'
        subtitle='Cadastro por filial/setor no periodo selecionado. Cada mes/ano possui sua propria lista de atendentes.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Novo atendente</CardTitle>
        </CardHeader>
        <CardContent>
          <form className='grid gap-3 md:grid-cols-3' onSubmit={createAgent}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Nome completo exato do Excel' />
            <Select value={sectorId ? String(sectorId) : ''} onChange={(e) => setSectorId(Number(e.target.value))}>
              <option value='' disabled>
                Selecione o setor
              </option>
              {sectors.map((sector) => (
                <option value={sector.id} key={sector.id}>
                  {sector.name}
                </option>
              ))}
            </Select>
            <Button disabled={!selectedBranchId || !sectorId}>Cadastrar atendente</Button>
          </form>
          {!selectedBranchId ? <p className='mt-2 text-sm text-amber-700'>Selecione uma filial no menu.</p> : null}
          {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Atendentes do periodo ({selectedMonth}/{selectedYear})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {agents.map((agent) => (
                <TableRow key={agent.id}>
                  <TableCell>{agent.id}</TableCell>
                  <TableCell>
                    {editingId === agent.id ? (
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                    ) : (
                      agent.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === agent.id ? (
                      <Select
                        value={editingSectorId ? String(editingSectorId) : ''}
                        onChange={(e) => setEditingSectorId(Number(e.target.value))}
                      >
                        <option value='' disabled>
                          Selecione o setor
                        </option>
                        {sectors.map((sector) => (
                          <option key={sector.id} value={sector.id}>
                            {sector.name}
                          </option>
                        ))}
                      </Select>
                    ) : (
                      sectorById.get(agent.sector_id)?.name || '-'
                    )}
                  </TableCell>
                  <TableCell>{agent.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-2'>
                      {editingId === agent.id ? (
                        <>
                          <Button
                            size='sm'
                            variant='secondary'
                            disabled={savingEditId === agent.id}
                            onClick={() => saveEditAgent(agent.id)}
                          >
                            {savingEditId === agent.id ? 'Salvando...' : 'Salvar'}
                          </Button>
                          <Button size='sm' variant='outline' onClick={cancelEditAgent}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size='sm' variant='secondary' onClick={() => startEditAgent(agent)}>
                            Editar
                          </Button>
                          <Button
                            size='sm'
                            variant='destructive'
                            disabled={deletingId === agent.id}
                            onClick={() => deleteAgent(agent)}
                          >
                            {deletingId === agent.id ? 'Excluindo...' : 'Excluir'}
                          </Button>
                        </>
                      )}
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
