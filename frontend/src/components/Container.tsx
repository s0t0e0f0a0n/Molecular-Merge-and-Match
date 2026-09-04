import type { ReactNode } from 'react'

export function Container({ children }: { children: ReactNode }) {
  return (
    <div style={{ width: '100%', margin: 0, padding: 0 }}>
      {children}
    </div>
  )
}
