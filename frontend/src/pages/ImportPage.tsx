import { useState } from 'react'

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
import { useBranch } from '@/context/BranchContext'
import { usePeriod } from '@/context/PeriodContext'
import { api, getApiErrorMessage } from '@/lib/api'
import type { ImportResult } from '@/types'

export function ImportPage() {
  const { selectedBranchId } = useBranch()
  const { selectedMonth, selectedYear } = usePeriod()
  const [mode, setMode] = useState<'overwrite' | 'sum'>('overwrite')
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedBranchId || !file) {
      setError('Selecione filial e arquivo .xlsx')
      return
    }

    setError('')
    setIsLoading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('branch_id', String(selectedBranchId))
      formData.append('month', String(selectedMonth))
      formData.append('year', String(selectedYear))
      formData.append('mode', mode)

      const { data } = await api.post<ImportResult>('/reports/import', formData)
      setResult(data)
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='space-y-6'>
      <PageHeader
        title='Importar Relatorio Mensal'
        subtitle='Upload do Excel para atualizar BLIP por match exato de nome do atendente, preservando Baldussi manual no modo overwrite.'
      />

      <Card>
        <CardHeader>
          <CardTitle className='text-base'>Parametros de importação</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
            <div>
              <Label>Modo</Label>
              <Select value={mode} onChange={(e) => setMode(e.target.value as 'overwrite' | 'sum')}>
                <option value='overwrite'>overwrite (substituir BLIP do mês)</option>
                <option value='sum'>sum (somar BLIP ao atual)</option>
              </Select>
            </div>
            <div className='md:col-span-2'>
              <Label>Arquivo .xlsx</Label>
              <Input
                type='file'
                accept='.xlsx'
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </div>
            <div className='md:col-span-2 xl:col-span-4'>
              <Button disabled={isLoading || !selectedBranchId}>{isLoading ? 'Processando...' : 'Importar Excel'}</Button>
              <p className='mt-2 text-xs text-slate-600'>
                Mês/ano global atual: {selectedMonth}/{selectedYear}
              </p>
              {!selectedBranchId ? <p className='mt-2 text-sm text-amber-700'>Selecione a filial no menu lateral.</p> : null}
              {error ? <p className='mt-2 text-sm text-red-600'>{error}</p> : null}
            </div>
          </form>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Resultado da importação</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid gap-3 md:grid-cols-4'>
              <Metric title='Linhas totais' value={result.total_rows} />
              <Metric title='Vinculadas' value={result.matched_rows} />
              <Metric title='Pendentes' value={result.pending_rows} />
              <Metric title='Relatorio ID' value={result.report_id} />
            </div>

            <div>
              <p className='mb-2 text-sm font-semibold text-slate-700'>Pendências apos importação</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome no Excel</TableHead>
                    <TableHead>Tickets</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.pending_items.map((pending) => (
                    <TableRow key={pending.id}>
                      <TableCell>{pending.raw_name_from_excel}</TableCell>
                      <TableCell>{pending.tickets_finalizados}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className='rounded-lg border border-border bg-slate-50 p-3'>
      <p className='text-xs uppercase tracking-wider text-slate-500'>{title}</p>
      <p className='font-display text-2xl font-bold text-slate-900'>{value}</p>
    </div>
  )
}
