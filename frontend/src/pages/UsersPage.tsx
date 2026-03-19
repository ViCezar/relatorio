import { useEffect, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useAuth } from '@/context/AuthContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { Role, User } from '@/types'

type CreateUserPayload = {
  name: string
  email: string
  password: string
  role: Role
  active: boolean
}

const INITIAL_FORM: CreateUserPayload = {
  name: '',
  email: '',
  password: '',
  role: 'user',
  active: true,
}

function formatRole(role: Role): string {
  return role === 'admin' ? 'Administrador' : 'Padrao'
}

function formatCreatedAt(dateRaw: string): string {
  const date = new Date(dateRaw)
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  return date.toLocaleString('pt-BR')
}

export function UsersPage() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState<CreateUserPayload>(INITIAL_FORM)
  const [isLoadingList, setIsLoadingList] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [changingPasswordId, setChangingPasswordId] = useState<number | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [error, setError] = useState('')

  const loadUsers = async () => {
    setError('')
    setIsLoadingList(true)
    try {
      const { data } = await api.get<User[]>('/users')
      setUsers(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsLoadingList(false)
    }
  }

  useEffect(() => {
    void loadUsers()
    const intervalId = window.setInterval(() => {
      void loadUsers()
    }, 30000)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  const createUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
      setError('Preencha nome, email e senha')
      return
    }

    setError('')
    setIsCreating(true)

    try {
      await api.post<User>('/users', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        active: form.active,
      })
      setForm(INITIAL_FORM)
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsCreating(false)
    }
  }

  const changePassword = async (userItem: User) => {
    const isStandardUser = userItem.role === 'user'
    const isOwnAdmin = userItem.role === 'admin' && currentUser?.id === userItem.id
    if (!isStandardUser && !isOwnAdmin) {
      return
    }

    const promptTitle = isOwnAdmin ? 'Nova senha para sua conta admin:' : `Nova senha para "${userItem.name}":`
    const passwordRaw = window.prompt(promptTitle)
    if (passwordRaw === null) {
      return
    }

    const password = passwordRaw.trim()
    if (password.length < 6) {
      setError('Senha deve ter no minimo 6 caracteres')
      return
    }

    setError('')
    setChangingPasswordId(userItem.id)
    try {
      if (isOwnAdmin) {
        await api.put('/users/me/password', { password })
      } else {
        await api.put(`/users/${userItem.id}/password`, { password })
      }
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setChangingPasswordId(null)
    }
  }

  const deleteUser = async (userItem: User) => {
    if (userItem.role !== 'user') {
      return
    }

    const confirmed = window.confirm(`Deseja excluir o usuario "${userItem.name}"?`)
    if (!confirmed) {
      return
    }

    setError('')
    setDeletingId(userItem.id)
    try {
      await api.delete(`/users/${userItem.id}`)
      await loadUsers()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Usuarios'
        subtitle='Cadastro de novos usuarios com controle de nivel de acesso Padrao ou Administrador.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Novo usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <form className='grid gap-3 md:grid-cols-2 xl:grid-cols-5' onSubmit={createUser}>
            <div>
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder='Nome completo'
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type='email'
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder='usuario@empresa.com'
              />
            </div>
            <div>
              <Label>Senha</Label>
              <Input
                type='password'
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                placeholder='Minimo 6 caracteres'
              />
            </div>
            <div>
              <Label>Nivel de acesso</Label>
              <Select
                value={form.role}
                onChange={(event) => setForm((prev) => ({ ...prev, role: event.target.value as Role }))}
              >
                <option value='user'>Padrão</option>
                <option value='admin'>Administrador</option>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.active ? 'active' : 'inactive'}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    active: event.target.value === 'active',
                  }))
                }
              >
                <option value='active'>Ativo</option>
                <option value='inactive'>Inativo</option>
              </Select>
            </div>
            <div className='md:col-span-2 xl:col-span-5'>
              <Button disabled={isCreating}>{isCreating ? 'Cadastrando...' : 'Cadastrar usuario'}</Button>
            </div>
          </form>
          {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Usuarios cadastrados</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingList ? (
            <p className='text-sm text-slate-600'>Carregando usuarios...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Perfil</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Criado em</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.length ? (
                  users.map((userItem) => (
                    <TableRow key={userItem.id}>
                      <TableCell>{userItem.id}</TableCell>
                      <TableCell>
                        <div className='flex items-center gap-2'>
                          <span
                            className={`inline-block h-2.5 w-2.5 rounded-full ${
                              userItem.is_online ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                            title={userItem.is_online ? 'Online' : 'Offline'}
                            aria-label={userItem.is_online ? 'Online' : 'Offline'}
                          />
                          <span>{userItem.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{userItem.email}</TableCell>
                      <TableCell>{formatRole(userItem.role)}</TableCell>
                      <TableCell>{userItem.active ? 'Ativo' : 'Inativo'}</TableCell>
                      <TableCell>{formatCreatedAt(userItem.created_at)}</TableCell>
                      <TableCell>
                        {userItem.role === 'user' ? (
                          <div className='flex flex-wrap gap-2'>
                            <Button
                              size='sm'
                              variant='secondary'
                              disabled={changingPasswordId === userItem.id || deletingId === userItem.id}
                              onClick={() => void changePassword(userItem)}
                            >
                              {changingPasswordId === userItem.id ? 'Salvando...' : 'Alterar senha'}
                            </Button>
                            <Button
                              size='sm'
                              variant='destructive'
                              disabled={deletingId === userItem.id || changingPasswordId === userItem.id}
                              onClick={() => void deleteUser(userItem)}
                            >
                              {deletingId === userItem.id ? 'Excluindo...' : 'Excluir'}
                            </Button>
                          </div>
                        ) : currentUser?.id === userItem.id ? (
                          <Button
                            size='sm'
                            variant='secondary'
                            disabled={changingPasswordId === userItem.id}
                            onClick={() => void changePassword(userItem)}
                          >
                            {changingPasswordId === userItem.id ? 'Salvando...' : 'Alterar minha senha'}
                          </Button>
                        ) : (
                          <p className='text-xs text-slate-500'>Não permitido para admin</p>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className='text-sm text-slate-600'>
                      Nenhum usuario cadastrado.
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
