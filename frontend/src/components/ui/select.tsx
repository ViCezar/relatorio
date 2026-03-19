import * as React from 'react'

import { cn } from '@/lib/utils'

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-xl border border-[#cbd8ea] bg-white px-3 py-2 text-sm font-medium text-[#2a446f] shadow-[0_2px_5px_-4px_rgba(25,52,93,0.7)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6d8cb5] disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export function Option(props: React.OptionHTMLAttributes<HTMLOptionElement>) {
  return <option {...props} />
}
