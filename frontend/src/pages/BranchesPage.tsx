import { useState } from 'react'

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
import { useBranch } from '@/context/BranchContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { Branch } from '@/types'

export function BranchesPage() {
  const { branches, refreshBranches } = useBranch()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

  const createBranch = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name) {
      return
    }

    setError('')
    setIsLoading(true)

    try {
      await api.post('/branches', { name, active: true })
      setName('')
      await refreshBranches()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  const deleteBranch = async (branch: Branch) => {
    const confirmed = window.confirm(`Deseja excluir a filial "${branch.name}"?`)
    if (!confirmed) {
      return
    }

    setError('')
    setDeletingId(branch.id)

    try {
      await api.delete(`/branches/${branch.id}`)
      await refreshBranches()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  const editBranch = async (branch: Branch) => {
    const newNameRaw = window.prompt('Novo nome da filial:', branch.name)
    if (newNameRaw === null) {
      return
    }
    const newName = newNameRaw.trim()
    if (!newName) {
      setError('Nome da filial nao pode ser vazio')
      return
    }

    setError('')
    setEditingId(branch.id)
    try {
      await api.put(`/branches/${branch.id}`, { name: newName })
      await refreshBranches()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setEditingId(null)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader title='Filiais' subtitle='Cadastro das filiais e controle de status ativo/inativo.' />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Nova filial</CardTitle>
        </CardHeader>
        <CardContent>
          <form className='flex flex-col gap-3 md:flex-row' onSubmit={createBranch}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='Nome da filial' />
            <Button disabled={isLoading}>{isLoading ? 'Salvando...' : 'Cadastrar'}</Button>
          </form>
          {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Lista de filiais</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map((branch) => (
                <TableRow key={branch.id}>
                  <TableCell>{branch.id}</TableCell>
                  <TableCell>{branch.name}</TableCell>
                  <TableCell>{branch.active ? 'Ativa' : 'Inativa'}</TableCell>
                  <TableCell>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        size='sm'
                        variant='secondary'
                        disabled={editingId === branch.id}
                        onClick={() => editBranch(branch)}
                      >
                        {editingId === branch.id ? 'Salvando...' : 'Editar'}
                      </Button>
                      <Button
                        size='sm'
                        variant='destructive'
                        disabled={deletingId === branch.id}
                        onClick={() => deleteBranch(branch)}
                      >
                        {deletingId === branch.id ? 'Excluindo...' : 'Excluir'}
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
