export function formatMs(ms: number | null | undefined): string {
  if (ms == null || Number.isNaN(ms)) return '—'
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

export function formatTokPerSec(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return '—'
  if (v >= 100) return v.toFixed(0)
  if (v >= 10) return v.toFixed(1)
  return v.toFixed(2)
}

export function formatTokens(n: number | null | undefined): string {
  if (n == null) return '—'
  return String(n)
}
