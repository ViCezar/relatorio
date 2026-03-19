export function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className='mb-5'>
      <h1 className='font-display text-[34px] font-extrabold leading-tight tracking-[-0.015em] text-[#162e55] md:text-[42px]'>
        {title}
      </h1>
      {subtitle ? <p className='mt-2 text-[16px] text-[#5b6f92]'>{subtitle}</p> : null}
      <div className='mt-4 h-px w-full bg-[#d4deeb]' />
    </header>
  )
}
