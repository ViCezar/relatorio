import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/context/AuthContext'
import papelDeParede from '@/imagens/papeldeparede.jpg'
import logoCtrack from '@/imagens/logoctrack.jpg'
import { getApiErrorMessage } from '@/lib/api'

export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className='min-h-screen bg-white md:grid md:grid-cols-[minmax(320px,430px)_1fr]'>
      <section className='flex min-h-screen flex-col border-r border-slate-200 bg-white px-6 py-8 sm:px-10 md:px-8 lg:px-10'>
        <img src={logoCtrack} alt='Ctrack' className='h-14 w-auto self-center object-contain sm:h-16' />

        <div className='my-auto'>
          <Card className='w-full border-transparent bg-white shadow-none'>
            <CardHeader>
              <CardTitle className='text-3xl font-bold tracking-tight text-slate-800'>Login</CardTitle>
              <CardDescription>Acesso ao painel de relatorios por filial e setor</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} className='space-y-4'>
                <div className='space-y-2'>
                  <Label htmlFor='email'>E-mail</Label>
                  <Input
                    id='email'
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder='Digite seu e-mail'
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor='password'>Senha</Label>
                  <Input
                    id='password'
                    type='password'
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder='Digite sua senha'
                  />
                </div>
                {error ? <p className='text-sm font-medium text-red-600'>{error}</p> : null}
                <Button
                  type='submit'
                  className='w-full bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 text-white hover:from-emerald-600 hover:via-green-600 hover:to-teal-600 focus-visible:ring-emerald-500'
                  disabled={isLoading}
                >
                  {isLoading ? 'Entrando...' : 'Entrar'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

      </section>

      <section className='relative hidden min-h-screen md:block'>
        <div
          className='absolute inset-0 bg-cover bg-center bg-no-repeat'
          style={{ backgroundImage: `url(${papelDeParede})` }}
        />
        <div className='absolute inset-0 bg-gradient-to-r from-slate-100/45 via-transparent to-slate-900/20' />
      </section>
    </div>
  )
}
