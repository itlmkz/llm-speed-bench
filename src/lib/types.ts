import type { ProviderType } from './providers'

export type EndpointConfig = {
  id: string
  label: string
  baseUrl: string
  apiKey: string
  /** Optional explicit provider override; otherwise auto-detected from baseUrl. */
  provider?: ProviderType
  /**
   * Optional CORS proxy prefix. When set, request URLs are prefixed with this
   * (cors-anywhere style: proxyUrl + targetUrl). Use when a provider blocks
   * browser CORS on its streaming endpoint.
   */
  proxyUrl?: string
}

export type ModelTarget = {
  id: string
  endpointId: string
  slug: string
}

export type TestPresetId = 'debug' | 'document' | 'coding'

export type TestPreset = {
  id: TestPresetId
  name: string
  description: string
  system: string
  user: string
  maxTokens: number
}

export type BenchStatus = 'pending' | 'running' | 'ok' | 'error'

export type BenchMetrics = {
  ttftMs: number | null
  totalMs: number
  completionTokens: number | null
  promptTokens: number | null
  /** Decode throughput after first token: (completionTokens - 1) / (total - TTFT) */
  decodeTokPerSec: number | null
  /** Overall: completionTokens / total */
  overallTokPerSec: number | null
  tokenSource: 'usage' | 'estimated' | 'unknown'
}

export type BenchResult = {
  key: string
  presetId: TestPresetId
  endpointId: string
  endpointLabel: string
  baseUrl: string
  slug: string
  status: BenchStatus
  metrics?: BenchMetrics
  preview?: string
  error?: string
}

export type AppConfig = {
  endpoints: EndpointConfig[]
  models: ModelTarget[]
  selectedPresets: TestPresetId[]
}
