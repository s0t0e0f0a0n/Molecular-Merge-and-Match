import type { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: 'Ubuntu Sans, system-ui, sans-serif', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1, minHeight: 0 }}>{children}</main>
    </div>
  )
}