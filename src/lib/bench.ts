import type { BenchMetrics, EndpointConfig, TestPreset } from './types'

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

function chatCompletionsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  if (base.endsWith('/chat/completions')) return base
  if (base.endsWith('/v1')) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

function estimateTokens(text: string): number {
  // Rough fallback when providers omit usage in the stream.
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words * 1.3))
}

function computeMetrics(args: {
  ttftMs: number | null
  totalMs: number
  completionTokens: number | null
  promptTokens: number | null
  tokenSource: BenchMetrics['tokenSource']
}): BenchMetrics {
  const { ttftMs, totalMs, completionTokens, promptTokens, tokenSource } = args

  let decodeTokPerSec: number | null = null
  let overallTokPerSec: number | null = null

  if (completionTokens != null && completionTokens > 0 && totalMs > 0) {
    overallTokPerSec = completionTokens / (totalMs / 1000)

    if (ttftMs != null && totalMs > ttftMs) {
      const decodeTokens = Math.max(1, completionTokens - 1)
      decodeTokPerSec = decodeTokens / ((totalMs - ttftMs) / 1000)
    }
  }

  return {
    ttftMs,
    totalMs,
    completionTokens,
    promptTokens,
    decodeTokPerSec,
    overallTokPerSec,
    tokenSource,
  }
}

export type StreamBenchInput = {
  endpoint: EndpointConfig
  slug: string
  preset: TestPreset
  signal?: AbortSignal
}

export type StreamBenchOutput = {
  metrics: BenchMetrics
  preview: string
}

/**
 * Runs one streaming chat completion against an OpenAI-compatible endpoint
 * and measures TTFT, total latency, and tokens/sec.
 */
export async function runStreamBench(
  input: StreamBenchInput,
): Promise<StreamBenchOutput> {
  const { endpoint, slug, preset, signal } = input
  const url = chatCompletionsUrl(endpoint.baseUrl)

  const body = {
    model: slug,
    stream: true,
    stream_options: { include_usage: true },
    max_tokens: preset.maxTokens,
    temperature: 0.2,
    messages: [
      { role: 'system', content: preset.system },
      { role: 'user', content: preset.user },
    ],
  }

  const t0 = performance.now()
  let ttftMs: number | null = null
  let text = ''
  let completionTokens: number | null = null
  let promptTokens: number | null = null
  let sawUsage = false

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  if (endpoint.apiKey.trim()) {
    headers.Authorization = `Bearer ${endpoint.apiKey.trim()}`
  }
  // OpenRouter etiquette headers (harmless elsewhere).
  headers['HTTP-Referer'] = typeof window !== 'undefined' ? window.location.origin : 'https://llm-speed-bench.local'
  headers['X-Title'] = 'LLM Speed Bench'

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(
      `HTTP ${res.status}: ${errText.slice(0, 400) || res.statusText}`,
    )
  }

  if (!res.body) {
    throw new Error('Response had no body (streaming unsupported by browser/proxy).')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleData = (payload: string) => {
    if (payload === '[DONE]') return
    let json: unknown
    try {
      json = JSON.parse(payload)
    } catch {
      return
    }
    if (!json || typeof json !== 'object') return
    const obj = json as {
      usage?: {
        completion_tokens?: number
        prompt_tokens?: number
        total_tokens?: number
      }
      choices?: Array<{
        delta?: { content?: string | null; reasoning_content?: string | null }
        message?: { content?: string | null }
      }>
    }

    if (obj.usage) {
      sawUsage = true
      if (typeof obj.usage.completion_tokens === 'number') {
        completionTokens = obj.usage.completion_tokens
      }
      if (typeof obj.usage.prompt_tokens === 'number') {
        promptTokens = obj.usage.prompt_tokens
      }
    }

    const delta =
      obj.choices?.[0]?.delta?.content ??
      obj.choices?.[0]?.delta?.reasoning_content ??
      obj.choices?.[0]?.message?.content ??
      ''

    if (typeof delta === 'string' && delta.length > 0) {
      if (ttftMs == null) {
        ttftMs = performance.now() - t0
      }
      text += delta
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let sep: number
    while ((sep = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, sep).replace(/\r$/, '')
      buffer = buffer.slice(sep + 1)
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue
      if (trimmed.startsWith('data:')) {
        handleData(trimmed.slice(5).trim())
      }
    }
  }

  // Flush remaining buffer.
  const leftover = buffer.trim()
  if (leftover.startsWith('data:')) {
    handleData(leftover.slice(5).trim())
  }

  const totalMs = performance.now() - t0

  let tokenSource: BenchMetrics['tokenSource'] = 'unknown'
  if (sawUsage && completionTokens != null) {
    tokenSource = 'usage'
  } else if (text.length > 0) {
    completionTokens = estimateTokens(text)
    tokenSource = 'estimated'
  }

  const metrics = computeMetrics({
    ttftMs,
    totalMs,
    completionTokens,
    promptTokens,
    tokenSource,
  })

  return {
    metrics,
    preview: text.slice(0, 280),
  }
}
