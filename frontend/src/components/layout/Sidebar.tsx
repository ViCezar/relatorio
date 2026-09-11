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

type SidebarTheme = {
  aside: string
  border: string
  heading: string
  label: string
  nav: string
  navActive: string
  card: string
  userText: string
  mutedText: string
  button: string
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

const defaultSidebarTheme: SidebarTheme = {
  aside: 'border-[#91b8e8] bg-gradient-to-b from-[#f4f9ff] via-[#dcecff] to-[#acd2ff] text-[#1d4775]',
  border: 'border-[#8fb9e7]',
  heading: 'text-[#245682]',
  label: 'text-[#2f5f8f]',
  nav: 'text-[#1d4775] hover:bg-white/55 hover:text-[#15385f]',
  navActive: 'bg-gradient-to-r from-[#2f70b7] to-[#80b8ee] text-white shadow-[0_12px_18px_-14px_rgba(33,98,168,0.8)]',
  card: 'border-[#b6d4f3] bg-white/78',
  userText: 'text-[#173f6d]',
  mutedText: 'text-[#55799f]',
  button: 'border-[#b6d4f3] bg-white/65 text-[#173f6d] hover:bg-white',
}

const sidebarThemes: Record<string, SidebarTheme> = {
  londrina: {
    aside: 'border-[#aab4c2] bg-gradient-to-b from-[#f8fafc] via-[#edf1f6] to-[#cfd6df] text-[#1f2937]',
    border: 'border-[#aeb8c6]',
    heading: 'text-[#303946]',
    label: 'text-[#3c4655]',
    nav: 'text-[#27313f] hover:bg-white/60 hover:text-[#111827]',
    navActive: 'bg-gradient-to-r from-[#1f2937] to-[#56606e] text-white shadow-[0_12px_18px_-14px_rgba(31,41,55,0.8)]',
    card: 'border-[#c8d0db] bg-white/76',
    userText: 'text-[#1f2937]',
    mutedText: 'text-[#687385]',
    button: 'border-[#c8d0db] bg-white/70 text-[#27313f] hover:bg-white',
  },
  maringa: {
    aside: 'border-[#94d2aa] bg-gradient-to-b from-[#f3fbf5] via-[#ddf4e6] to-[#b9e7cb] text-[#1f4d34]',
    border: 'border-[#8fd0a7]',
    heading: 'text-[#1f6a43]',
    label: 'text-[#26724a]',
    nav: 'text-[#1f4d34] hover:bg-white/55 hover:text-[#123c28]',
    navActive: 'bg-gradient-to-r from-[#2f8f5b] to-[#7fd39b] text-white shadow-[0_12px_18px_-14px_rgba(35,128,78,0.78)]',
    card: 'border-[#acdcbc] bg-white/76',
    userText: 'text-[#16422c]',
    mutedText: 'text-[#4f7c62]',
    button: 'border-[#acdcbc] bg-white/68 text-[#16422c] hover:bg-white',
  },
  curitiba: {
    aside: 'border-[#bca1ee] bg-gradient-to-b from-[#faf6ff] via-[#efe1ff] to-[#d8c2ff] text-[#56327e]',
    border: 'border-[#bca1ee]',
    heading: 'text-[#6a3a9a]',
    label: 'text-[#7446a2]',
    nav: 'text-[#56327e] hover:bg-white/55 hover:text-[#3d225f]',
    navActive: 'bg-gradient-to-r from-[#7c4cc2] to-[#b789ee] text-white shadow-[0_12px_18px_-14px_rgba(104,64,166,0.78)]',
    card: 'border-[#d1bdf3] bg-white/76',
    userText: 'text-[#432469]',
    mutedText: 'text-[#755b93]',
    button: 'border-[#d1bdf3] bg-white/68 text-[#432469] hover:bg-white',
  },
  cascavel: {
    aside: 'border-[#e4bd45] bg-gradient-to-b from-[#fffaf0] via-[#ffefbd] to-[#ffd86b] text-[#664a05]',
    border: 'border-[#e2bc44]',
    heading: 'text-[#7a5600]',
    label: 'text-[#815f0e]',
    nav: 'text-[#684c07] hover:bg-white/55 hover:text-[#3f2f05]',
    navActive: 'bg-gradient-to-r from-[#f0c13f] to-[#fff1a8] text-[#3f2f05] shadow-[0_12px_18px_-14px_rgba(174,122,0,0.7)]',
    card: 'border-[#eed37a] bg-white/76',
    userText: 'text-[#5a4104]',
    mutedText: 'text-[#8a7331]',
    button: 'border-[#eed37a] bg-white/68 text-[#5a4104] hover:bg-white',
  },
  'ponta grossa': defaultSidebarTheme,
}

function normalizeBranchName(name: string) {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

export function Sidebar() {
  const { user, logout } = useAuth()
  const { branches, selectedBranchId, setSelectedBranchId } = useBranch()
  const { selectedMonth, selectedYear, setSelectedMonth, setSelectedYear } = usePeriod()

  const visibleMenuItems = user ? menuItems.filter((item) => item.roles.includes(user.role)) : []
  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId)
  const sidebarTheme = selectedBranch ? sidebarThemes[normalizeBranchName(selectedBranch.name)] ?? defaultSidebarTheme : defaultSidebarTheme
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 9 }, (_, index) => currentYear - 3 + index)
  if (!yearOptions.includes(selectedYear)) {
    yearOptions.push(selectedYear)
    yearOptions.sort((a, b) => a - b)
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-20 flex h-screen w-[280px] min-w-[280px] flex-col border-r px-4 py-6 transition-colors duration-300',
        sidebarTheme.aside
      )}
    >
      <div className='mb-6 flex justify-center rounded-2xl bg-[#16345d]/90 px-3 py-3 shadow-[0_14px_26px_-20px_rgba(21,45,79,0.9)]'>
        <img src={sattrackLogo} alt='Sattrack' className='h-12 w-auto max-w-[180px] object-contain' />
      </div>
      <p className={cn('mb-5 text-center text-xs font-semibold uppercase tracking-[0.19em]', sidebarTheme.heading)}>
        Mensal de Atendimentos
      </p>

      <div className={cn('space-y-5 border-t pt-4', sidebarTheme.border)}>
        <div className='space-y-2'>
          <p className={cn('text-xs font-semibold uppercase tracking-[0.15em]', sidebarTheme.label)}>Filial Ativa</p>
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
          <p className={cn('text-xs font-semibold uppercase tracking-[0.15em]', sidebarTheme.label)}>Mês / Ano</p>
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

      <nav className={cn('mt-6 space-y-1.5 border-t pt-3', sidebarTheme.border)}>
        {visibleMenuItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 text-[15px] font-semibold transition-all',
                  sidebarTheme.nav,
                  isActive && sidebarTheme.navActive
                )
              }
            >
              <Icon size={16} strokeWidth={2.1} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className={cn('mt-1 rounded-xl border p-3 shadow-[0_14px_22px_-20px_rgba(22,54,95,0.9)]', sidebarTheme.card)}>
        <p className={cn('text-center text-xs', sidebarTheme.mutedText)}>Logado como</p>
        <p className={cn('truncate text-center text-[15px] font-bold', sidebarTheme.userText)}>{user?.name}</p>
        {user?.role === 'admin' ? <p className={cn('mt-1 text-center text-xs', sidebarTheme.mutedText)}>Perfil: Administrador</p> : null}
        <Button
          className={cn('mt-5.1 h-10 w-full rounded-xl text-[15px] font-semibold', sidebarTheme.button)}
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
