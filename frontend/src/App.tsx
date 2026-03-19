import type { ReactElement } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/context/AuthContext'
import type { Role } from '@/types'
import { BranchesPage } from '@/pages/BranchesPage'
import { BranchComparisonPage } from '@/pages/BranchComparisonPage'
import { MonthComparisonPage } from '@/pages/MonthComparisonPage'
import { AgentsPage } from '@/pages/AgentsPage'
import { BaldussiManualPage } from '@/pages/BaldussiManualPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ImportPage } from '@/pages/ImportPage'
import { LoginPage } from '@/pages/LoginPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SectorsPage } from '@/pages/SectorsPage'
import { UsersPage } from '@/pages/UsersPage'

function ProtectedRoutes() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return <div className='flex min-h-screen items-center justify-center text-sm text-slate-600'>Carregando...</div>
  }

  if (!user) {
    return <Navigate to='/login' replace />
  }

  return <AppLayout />
}

function PublicLogin() {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return <div className='flex min-h-screen items-center justify-center text-sm text-slate-600'>Carregando...</div>
  }
  if (user) {
    return <Navigate to='/dashboard' replace />
  }
  return <LoginPage />
}

function RoleRoute({ allowedRoles, children }: { allowedRoles: Role[]; children: ReactElement }) {
  const { user } = useAuth()
  if (!user) {
    return <Navigate to='/login' replace />
  }
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to='/dashboard' replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path='/login' element={<PublicLogin />} />
      <Route element={<ProtectedRoutes />}>
        <Route path='/dashboard' element={<DashboardPage />} />
        <Route path='/branch-comparison' element={<BranchComparisonPage />} />
        <Route
          path='/comparativo-meses'
          element={
            <RoleRoute allowedRoles={['admin', 'user']}>
              <MonthComparisonPage />
            </RoleRoute>
          }
        />
        <Route
          path='/import'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <ImportPage />
            </RoleRoute>
          }
        />
        <Route
          path='/branches'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <BranchesPage />
            </RoleRoute>
          }
        />
        <Route
          path='/sectors'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <SectorsPage />
            </RoleRoute>
          }
        />
        <Route
          path='/agents'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <AgentsPage />
            </RoleRoute>
          }
        />
        <Route path='/baldussi-manual' element={<BaldussiManualPage />} />
        <Route
          path='/reports'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <ReportsPage />
            </RoleRoute>
          }
        />
        <Route
          path='/users'
          element={
            <RoleRoute allowedRoles={['admin']}>
              <UsersPage />
            </RoleRoute>
          }
        />
        <Route path='*' element={<Navigate to='/dashboard' replace />} />
      </Route>
    </Routes>
  )
}
