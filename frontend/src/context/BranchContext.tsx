import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

import { api } from '@/lib/api'
import type { Branch } from '@/types'
import { useAuth } from './AuthContext'

interface BranchContextValue {
  branches: Branch[]
  selectedBranchId: number | null
  setSelectedBranchId: (branchId: number) => void
  refreshBranches: () => Promise<void>
}

const BranchContext = createContext<BranchContextValue | undefined>(undefined)

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchIdState] = useState<number | null>(null)

  const setSelectedBranchId = useCallback((branchId: number) => {
    setSelectedBranchIdState(branchId)
    localStorage.setItem('selectedBranchId', String(branchId))
  }, [])

  const refreshBranches = useCallback(async () => {
    if (!user) {
      setBranches([])
      setSelectedBranchIdState(null)
      return
    }

    const { data } = await api.get<Branch[]>('/branches')
    setBranches(data)

    const savedBranchId = localStorage.getItem('selectedBranchId')
    const savedAsNumber = savedBranchId ? Number(savedBranchId) : null

    if (savedAsNumber && data.some((branch) => branch.id === savedAsNumber)) {
      setSelectedBranchIdState(savedAsNumber)
      return
    }

    const firstActive = data.find((branch) => branch.active)
    if (firstActive) {
      setSelectedBranchId(firstActive.id)
    } else {
      setSelectedBranchIdState(data[0]?.id ?? null)
    }
  }, [setSelectedBranchId, user])

  useEffect(() => {
    refreshBranches().catch(() => {
      setBranches([])
    })
  }, [refreshBranches])

  const value = useMemo(
    () => ({
      branches,
      selectedBranchId,
      setSelectedBranchId,
      refreshBranches,
    }),
    [branches, refreshBranches, selectedBranchId, setSelectedBranchId]
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}

export function useBranch() {
  const context = useContext(BranchContext)
  if (!context) {
    throw new Error('useBranch deve ser usado dentro de BranchProvider')
  }
  return context
}
