import { createContext, useContext, useMemo, useState } from 'react'

interface PeriodContextValue {
  selectedMonth: number
  selectedYear: number
  setSelectedMonth: (month: number) => void
  setSelectedYear: (year: number) => void
}

const now = new Date()

function normalizeMonth(month: number) {
  if (month < 1) {
    return 1
  }
  if (month > 12) {
    return 12
  }
  return month
}

function normalizeYear(year: number) {
  if (year < 2000) {
    return 2000
  }
  if (year > 2100) {
    return 2100
  }
  return year
}

function readStoredMonth() {
  const raw = localStorage.getItem('selectedMonth')
  const month = raw ? Number(raw) : now.getMonth() + 1
  return normalizeMonth(Number.isFinite(month) ? month : now.getMonth() + 1)
}

function readStoredYear() {
  const raw = localStorage.getItem('selectedYear')
  const year = raw ? Number(raw) : now.getFullYear()
  return normalizeYear(Number.isFinite(year) ? year : now.getFullYear())
}

const PeriodContext = createContext<PeriodContextValue | undefined>(undefined)

export function PeriodProvider({ children }: { children: React.ReactNode }) {
  const [selectedMonth, setSelectedMonthState] = useState<number>(() => readStoredMonth())
  const [selectedYear, setSelectedYearState] = useState<number>(() => readStoredYear())

  const setSelectedMonth = (month: number) => {
    const normalized = normalizeMonth(month)
    setSelectedMonthState(normalized)
    localStorage.setItem('selectedMonth', String(normalized))
  }

  const setSelectedYear = (year: number) => {
    const normalized = normalizeYear(year)
    setSelectedYearState(normalized)
    localStorage.setItem('selectedYear', String(normalized))
  }

  const value = useMemo(
    () => ({
      selectedMonth,
      selectedYear,
      setSelectedMonth,
      setSelectedYear,
    }),
    [selectedMonth, selectedYear]
  )

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
}

export function usePeriod() {
  const context = useContext(PeriodContext)
  if (!context) {
    throw new Error('usePeriod deve ser usado dentro de PeriodProvider')
  }
  return context
}
