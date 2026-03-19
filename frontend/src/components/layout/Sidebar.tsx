import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  LayoutDashboard,
  Layers,
  LineChart,
  ListChecks,
  LogOut,
  Shield,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { useAuth } from '@/context/AuthContext'
import { useBranch } from '@/context/BranchContext'
import sattrackLogo from '@/imagens/sattrack.png'
import { usePeriod } from '@/context/PeriodContext'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

type MenuItem = {
  to: string
  label: string
  icon: LucideIcon
  roles: Role[]
}

const menuItems: MenuItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'user'] },
  { to: '/branch-comparison', label: 'Comparativo Filiais', icon: BarChart3, roles: ['admin', 'user'] },
  { to: '/comparativo-meses', label: 'Comparativo Meses', icon: LineChart, roles: ['admin', 'user'] },
  { to: '/import', label: 'Importar Excel', icon: FileSpreadsheet, roles: ['admin'] },
  { to: '/branches', label: 'Filiais', icon: Building2, roles: ['admin'] },
  { to: '/sectors', label: 'Setores', icon: Layers, roles: ['admin'] },
  { to: '/agents', label: 'Atendentes', icon: Users, roles: ['admin'] },
  { to: '/baldussi-manual', label: 'Atendimentos', icon: ListChecks, roles: ['admin', 'user'] },
  { to: '/reports', label: 'Relatorios', icon: BarChart3, roles: ['admin'] },
  { to: '/users', label: 'Usuarios', icon: Shield, roles: ['admin'] },
]

const monthOptions = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const { branches, selectedBranchId, setSelectedBranchId } = useBranch()
  const { selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = usePeriod()

  const visibleMenuItems = user ? menuItems.filter((item) => item.roles.includes(user.role)) : []
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 9 }, (_, index) => currentYear - 3 + index)
  if (!yearOptions.includes(selectedYear)) {
    yearOptions.push(selectedYear)
    yearOptions.sort((a, b) => a - b)
  }

  return (
    <aside className='fixed left-0 top-0 z-20 flex h-screen w-[280px] min-w-[280px] flex-col border-r border-[#2b4c70] bg-gradient-to-b from-[#1f3b5c] via-[#25476d] to-[#2e5783] px-4 py-6'>
      <div className='mb-6 flex justify-center'>
        <img src={sattrackLogo} alt='Sattrack' className='h-12 w-auto max-w-[180px] object-contain' />
      </div>
      <p className='mb-5 text-center text-xs font-semibold uppercase tracking-[0.19em] text-[#d5e4f7]'>
        Mensal de Atendimentos
      </p>

      <div className='space-y-5 border-t border-[#d3e0ef] pt-4'>
        <div className='space-y-2'>
          <p className='text-xs font-semibold uppercase tracking-[0.15em] text-[#cfe0f5]'>Filial Ativa</p>
          <Select
            className='h-10 rounded-xl border-[#c8d7ea] bg-white text-[15px] font-semibold text-[#273f66] shadow-[0_2px_5px_-4px_rgba(25,52,93,0.7)]'
            value={selectedBranchId ? String(selectedBranchId) : ''}
            onChange={(event) => setSelectedBranchId(Number(event.target.value))}
          >
            <option value='' disabled>
              Selecione
            </option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </Select>
        </div>

        <div className='space-y-2'>
          <p className='text-xs font-semibold uppercase tracking-[0.15em] text-[#cfe0f5]'>Mês / Ano</p>
          <div className='grid grid-cols-2 gap-4'>
            <Select
              className='h-9 rounded-xl border-[#c8d7ea] bg-white text-[15px] font-semibold text-[#273f66] shadow-[0_2px_5px_-4px_rgba(25,52,93,0.7)]'
              value={String(selectedMonth)}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
            >
              {monthOptions.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </Select>
            <Select
              className='h-9 rounded-xl border-[#c8d7ea] bg-white text-[15px] font-semibold text-[#273f66] shadow-[0_2px_5px_-4px_rgba(25,52,93,0.7)]'
              value={String(selectedYear)}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <nav className='mt-6 space-y-1.5 border-t border-[#d3e0ef] pt-3'>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-semibold text-[#e6effb] transition-all hover:bg-white/15 hover:text-white',
                  isActive &&
                    'bg-gradient-to-r from-[#13294d] to-[#1a3d71] text-white shadow-[0_10px_16px_-12px_rgba(17,40,78,0.95)]'
                )
              }
            >
              <Icon size={16} strokeWidth={2.1} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className='mt-1 rounded-xl border border-[#d4e0ef] bg-white/80 p-3 shadow-[0_14px_22px_-20px_rgba(22,54,95,1)]'>
        <p className='text-center text-xs text-[#617695]'>Logado como</p>
        <p className='truncate text-center text-[15px] font-bold text-[#20365a]'>{user?.name}</p>
        {user?.role === 'admin' ? <p className='mt-1 text-center text-xs text-[#617695]'>Perfil: Administrador</p> : null}
        <Button
          className='mt-5.1 h-10 w-full rounded-xl border-[#c8d7ea] bg-[#f3f7fd] text-[15px] font-semibold text-[#223b63] hover:bg-white'
          variant='outline'
          onClick={logout}
        >
          <LogOut className='mr-1 h-4 w-3' />
          Sair
        </Button>
      </div>
    </aside>
  )
}
