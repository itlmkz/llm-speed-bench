import { hostnameOf } from './providers'
import type { BenchMetrics, TestPresetId } from './types'
import type { ErrorKind } from './errors'

export const SPEED_SCHEMA_VERSION = 1 as const

export type SpeedRunPayload = {
  schemaVersion: typeof SPEED_SCHEMA_VERSION
  sessionId: string
  providerType: 'openai' | 'anthropic'
  endpointHost: string
  endpointLabel: string
  modelSlug: string
  taskId: TestPresetId
  promptVersion: string
  status: 'ok' | 'error'
  ttftMs: number | null
  totalMs: number | null
  decodeTokPerSec: number | null
  overallTokPerSec: number | null
  completionTokens: number | null
  promptTokens: number | null
  tokenSource: BenchMetrics['tokenSource'] | null
  errorKind: ErrorKind
  httpStatus: number | null
  clientTz: string
  appVersion: string
}

export async function hashPromptVersion(
  taskId: string,
  system: string,
  user: string,
): Promise<string> {
  const encoded = new TextEncoder().encode(`${taskId}\n${system}\n${user}`)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('')
}

export function endpointHostFromUrl(baseUrl: string): string {
  return hostnameOf(baseUrl) ?? 'invalid'
}

export function buildSpeedRunPayload(args: {
  sessionId: string
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
}): SpeedRunPayload {
  return {
    schemaVersion: SPEED_SCHEMA_VERSION,
    sessionId: args.sessionId,
    providerType: args.providerType,
    endpointHost: endpointHostFromUrl(args.baseUrl),
    endpointLabel: args.endpointLabel.slice(0, 80),
    modelSlug: args.modelSlug.slice(0, 200),
    taskId: args.taskId,
    promptVersion: args.promptVersion,
    status: args.status,
    ttftMs: args.metrics?.ttftMs ?? null,
    totalMs: args.metrics?.totalMs ?? null,
    decodeTokPerSec: args.metrics?.decodeTokPerSec ?? null,
    overallTokPerSec: args.metrics?.overallTokPerSec ?? null,
    completionTokens: args.metrics?.completionTokens ?? null,
    promptTokens: args.metrics?.promptTokens ?? null,
    tokenSource: args.metrics?.tokenSource ?? null,
    errorKind: args.errorKind,
    httpStatus: args.httpStatus,
    clientTz:
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().timeZone
        : 'unknown',
    appVersion: args.appVersion,
  }
}

export function getOrCreateSessionId(): string {
  const key = 'llm-speed-bench:session'
  try {
    const existing = localStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    localStorage.setItem(key, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}
