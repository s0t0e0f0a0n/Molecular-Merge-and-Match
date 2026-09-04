import { useEffect, useState } from 'react'

type ApiHealth = { status: string }
type ApiInfo = { name: string; api_prefix: string; status: string }

export function ApiStatus() {
  const [health, setHealth] = useState<string>('checking...')
  const [info, setInfo] = useState<ApiInfo | null>(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const r = await fetch(`/api/v1/health`)
        if (!r.ok) throw new Error(String(r.status))
        const data = (await r.json()) as ApiHealth
        if (!cancelled) setHealth(data.status)
      } catch {
        if (!cancelled) setHealth('unreachable')
      }

      try {
        const r = await fetch(`/api/v1/info`)
        if (!r.ok) return
        const data = (await r.json()) as ApiInfo
        if (!cancelled) setInfo(data)
      } catch {
        // 
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <section style={{ padding: 16, border: '1px solid #4000ff', borderRadius: 8 }}>
      <h2 style={{ margin: 0, fontSize: 18 }}>Backend status</h2>
      <p style={{ margin: '12px 0 0' }}>
        Health: <strong>{health}</strong>
      </p>
      {info ? (
        <p style={{ margin: '8px 0 0', opacity: 0.9 }}>
          API: <strong>{info.name}</strong> ({info.status})
        </p>
      ) : null}
    </section>
  )
}
