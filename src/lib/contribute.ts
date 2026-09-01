import { buildSpeedRunPayload, getOrCreateSessionId } from './speedPayload'
import type { SpeedRunPayload } from './speedPayload'
import type { BenchMetrics, TestPresetId } from './types'
import type { ErrorKind } from './errors'

const PREF_KEY = 'llm-speed-bench:contribute-index:v1'

export function loadContributePref(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) === 'opt-in'
  } catch {
    return false
  }
}

export function saveContributePref(optIn: boolean): void {
  try {
    localStorage.setItem(PREF_KEY, optIn ? 'opt-in' : 'opt-out')
  } catch {
    /* ignore quota / private mode */
  }
}

export async function contributeRun(args: {
  providerType: 'openai' | 'anthropic'
  baseUrl: string
  endpointLabel: string
  modelSlug: string
  taskId: TestPresetId
  promptVersion: string
  status: 'ok' | 'error'
  metrics?: BenchMetrics
  errorKind: ErrorKind
  httpStatus: number | null
  appVersion: string
}): Promise<void> {
  if (!loadContributePref()) return
  const payload: SpeedRunPayload = buildSpeedRunPayload({
    ...args,
    sessionId: getOrCreateSessionId(),
  })
  try {
    await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    /* Index is optional; never block the bench. */
  }
}

export type SpeedIndexRow = {
  modelSlug: string
  endpointHost: string
  taskId: string
  geoCountry: string | null
  geoContinent: string | null
  nOk: number
  nTotal: number
  p50TtftMs: number | null
  p90TtftMs: number | null
  p50DecodeTokS: number | null
  p90DecodeTokS: number | null
  p50OverallTokS: number | null
}

export type SpeedIndexResponse = {
  window: string
  configured: boolean
  rows: SpeedIndexRow[]
}

export async function fetchSpeedIndex(args?: {
  window?: '7d' | '30d'
  task?: string
  country?: string
  model?: string
}): Promise<SpeedIndexResponse> {
  const params = new URLSearchParams()
  if (args?.window) params.set('window', args.window)
  if (args?.task) params.set('task', args.task)
  if (args?.country) params.set('country', args.country)
  if (args?.model) params.set('model', args.model)
  const qs = params.toString()
  const res = await fetch(`/api/speed-index${qs ? `?${qs}` : ''}`)
  if (res.status === 503) {
    return { window: args?.window ?? '7d', configured: false, rows: [] }
  }
  if (!res.ok) {
    throw new Error(`Speed index returned HTTP ${res.status}`)
  }
  return (await res.json()) as SpeedIndexResponse
}
