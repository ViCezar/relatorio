import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useBranch } from '@/context/BranchContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { Sector } from '@/types'

export function SectorsPage() {
  const { selectedBranchId } = useBranch()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [name, setName] = useState('')
  const [color, setColor] = useState('#0e7490')
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingColor, setEditingColor] = useState('#0e7490')
  const [savingEditId, setSavingEditId] = useState<number | null>(null)

  const loadSectors = async () => {
    if (!selectedBranchId) {
      setSectors([])
      return
    }
    const { data } = await api.get<Sector[]>('/sectors', { params: { branch_id: selectedBranchId } })
    setSectors(data)
  }

  useEffect(() => {
    loadSectors().catch(() => setSectors([]))
  }, [selectedBranchId])

  const createSector = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedBranchId || !name) {
      return
    }

    setError('')
    try {
      await api.post('/sectors', {
        branch_id: selectedBranchId,
        name,
        color,
        active: true,
      })
      setName('')
      await loadSectors()
    } catch (err) {
      setError(getApiErrorMessage(err))
    }
  }

  const deleteSector = async (sector: Sector) => {
    const confirmed = window.confirm(`Deseja excluir o setor "${sector.name}"?`)
    if (!confirmed) {
      return
    }

    setError('')
    setDeletingId(sector.id)

    try {
      await api.delete(`/sectors/${sector.id}`)
      await loadSectors()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const startEditSector = (sector: Sector) => {
    setError('')
    setEditingId(sector.id)
    setEditingName(sector.name)
    setEditingColor(sector.color || '#0e7490')
  }

  const cancelEditSector = () => {
    setEditingId(null)
    setEditingName('')
    setEditingColor('#0e7490')
  }

  const saveEditSector = async (sectorId: number) => {
    const newName = editingName.trim()
    if (!newName) {
      setError('Nome do setor nao pode ser vazio')
      return
    }
    setError('')
    setSavingEditId(sectorId)
    try {
      await api.put(`/sectors/${sectorId}`, {
        name: newName,
        color: editingColor || null,
      })
      await loadSectors()
      cancelEditSector()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setSavingEditId(null)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader title='Setores' subtitle='Cadastro de setores por filial com cor opcional.' />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Novo setor</CardTitle>
        </CardHeader>
        <CardContent>
          <form className='grid gap-3 md:grid-cols-3' onSubmit={createSector}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Nome do setor' />
            <Input type='color' value={color} onChange={(e) => setColor(e.target.value)} />
            <Button disabled={!selectedBranchId}>Cadastrar setor</Button>
          </form>
          {!selectedBranchId ? <p className='mt-2 text-sm text-amber-700'>Selecione uma filial no menu.</p> : null}
          {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Setores da filial</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Setor</TableHead>
                <TableHead>Cor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sectors.map((sector) => (
                <TableRow key={sector.id}>
                  <TableCell>{sector.id}</TableCell>
                  <TableCell>
                    {editingId === sector.id ? (
                      <Input value={editingName} onChange={(e) => setEditingName(e.target.value)} />
                    ) : (
                      sector.name
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === sector.id ? (
                      <div className='inline-flex items-center gap-2'>
                        <Input type='color' value={editingColor} onChange={(e) => setEditingColor(e.target.value)} />
                        <span>{editingColor}</span>
                      </div>
                    ) : (
                      <div className='inline-flex items-center gap-2'>
                        <span className='h-4 w-4 rounded-full border' style={{ backgroundColor: sector.color || '#94a3b8' }} />
                        {sector.color || '-'}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{sector.active ? 'Ativo' : 'Inativo'}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-2'>
                      {editingId === sector.id ? (
                        <>
                          <Button
                            size='sm'
                            variant='secondary'
                            disabled={savingEditId === sector.id}
                            onClick={() => saveEditSector(sector.id)}
                          >
                            {savingEditId === sector.id ? 'Salvando...' : 'Salvar'}
                          </Button>
                          <Button size='sm' variant='outline' onClick={cancelEditSector}>
                            Cancelar
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size='sm' variant='secondary' onClick={() => startEditSector(sector)}>
                            Editar
                          </Button>
                          <Button
                            size='sm'
                            variant='destructive'
                            disabled={deletingId === sector.id}
                            onClick={() => deleteSector(sector)}
                          >
                            {deletingId === sector.id ? 'Excluindo...' : 'Excluir'}
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
