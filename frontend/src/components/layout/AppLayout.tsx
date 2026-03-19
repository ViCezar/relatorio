import { Outlet } from 'react-router-dom'

import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className='min-h-screen w-full bg-[#edf2f8]'>
      <Sidebar />
      <main className='min-h-screen pl-[280px]'>
        <div className='px-5 py-6 md:px-7 md:py-7'>
          <div className='animate-fade-in-up'>{<Outlet />}</div>
        </div>
      </main>
    </div>
  )
}
