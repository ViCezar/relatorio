import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import type { User } from '@/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadMe = useCallback(async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const { data } = await api.get<User>('/auth/me')
      setUser(data)
    } catch {
      localStorage.removeItem('token')
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadMe()
  }, [loadMe])

  const login = useCallback(async (email: string, password: string) => {
    const { data } = await api.post<{ access_token: string }>('/auth/login', { email, password })
    localStorage.setItem('token', data.access_token)
    const me = await api.get<User>('/auth/me')
    setUser(me.data)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isLoading,
      login,
      logout,
    }),
    [isLoading, login, logout, user]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
