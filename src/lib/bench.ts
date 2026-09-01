import type { BenchMetrics, EndpointConfig, TestPreset } from './types'
import { redactHeaders, type LogEntry } from './log'
import {
  applyProxy,
  authHeaders,
  chatEndpointUrl,
  looksLikeCorsError,
  normalizeBaseUrl,
  resolveProvider,
} from './providers'

function estimateTokens(text: string): number {
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
  log: LogEntry
}

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key] = value
  })
  return out
}

function newLogEntry(
  endpoint: EndpointConfig,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  slug: string,
  preset: TestPreset,
): LogEntry {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    level: 'info',
    label: `${endpoint.label} · ${slug} · ${preset.name}`,
    scenario: preset.name,
    endpointLabel: endpoint.label,
    baseUrl: endpoint.baseUrl,
    slug,
    request: {
      method,
      url,
      headers: redactHeaders(headers),
      body,
    },
  }
}

/* ------------------------------------------------------------------ */
/* OpenAI-compatible streaming (/chat/completions)                    */
/* ------------------------------------------------------------------ */

function openAiBody(slug: string, preset: TestPreset) {
  return {
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
}

async function streamOpenAi(args: {
  url: string
  headers: Record<string, string>
  body: unknown
  signal: AbortSignal | undefined
  t0: number
  logEntry: LogEntry
}): Promise<{ metrics: BenchMetrics; preview: string }> {
  const { url, headers, body, signal, t0, logEntry } = args
  let ttftMs: number | null = null
  let text = ''
  let completionTokens: number | null = null
  let promptTokens: number | null = null
  let sawUsage = false
  let rawChunks = ''

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  logEntry.response = {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body: '',
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    logEntry.response.body = errText
    logEntry.level = 'error'
    const message = `The provider returned HTTP ${res.status} at ${url}: ${errText.slice(0, 400) || '(no response body)'}`
    logEntry.error = message
    throw Object.assign(new Error(message), { logEntry })
  }

  if (!res.body) {
    const message = 'The provider sent no stream back. Streaming may be disabled for this endpoint.'
    logEntry.level = 'error'
    logEntry.error = message
    throw Object.assign(new Error(message), { logEntry })
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
      if (ttftMs == null) ttftMs = performance.now() - t0
      text += delta
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    buffer += chunk
    rawChunks += chunk
    if (rawChunks.length > 8000) rawChunks = rawChunks.slice(-8000)

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

  const leftover = buffer.trim()
  if (leftover.startsWith('data:')) handleData(leftover.slice(5).trim())

  const totalMs = performance.now() - t0

  let tokenSource: BenchMetrics['tokenSource'] = 'unknown'
  if (sawUsage && completionTokens != null) {
    tokenSource = 'usage'
  } else if (text.length > 0) {
    completionTokens = estimateTokens(text)
    tokenSource = 'estimated'
  }

  logEntry.response.body = rawChunks || '(stream produced no data lines)'
  logEntry.timing = { ttftMs, totalMs }

  return {
    metrics: computeMetrics({
      ttftMs,
      totalMs,
      completionTokens,
      promptTokens,
      tokenSource,
    }),
    preview: text.slice(0, 280),
  }
}

/* ------------------------------------------------------------------ */
/* Anthropic native streaming (/v1/messages)                          */
/* ------------------------------------------------------------------ */

function anthropicBody(slug: string, preset: TestPreset) {
  return {
    model: slug,
    stream: true,
    max_tokens: preset.maxTokens,
    temperature: 0.2,
    system: preset.system,
    messages: [{ role: 'user', content: preset.user }],
  }
}

async function streamAnthropic(args: {
  url: string
  headers: Record<string, string>
  body: unknown
  signal: AbortSignal | undefined
  t0: number
  logEntry: LogEntry
}): Promise<{ metrics: BenchMetrics; preview: string }> {
  const { url, headers, body, signal, t0, logEntry } = args
  let ttftMs: number | null = null
  let text = ''
  let completionTokens: number | null = null
  let promptTokens: number | null = null
  let sawUsage = false
  let rawChunks = ''

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal,
  })

  logEntry.response = {
    status: res.status,
    statusText: res.statusText,
    headers: headersToObject(res.headers),
    body: '',
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    logEntry.response.body = errText
    logEntry.level = 'error'
    const message = `The provider returned HTTP ${res.status} at ${url}: ${errText.slice(0, 400) || '(no response body)'}`
    logEntry.error = message
    throw Object.assign(new Error(message), { logEntry })
  }

  if (!res.body) {
    const message = 'The provider sent no stream back. Streaming may be disabled for this endpoint.'
    logEntry.level = 'error'
    logEntry.error = message
    throw Object.assign(new Error(message), { logEntry })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let currentEvent = ''

  const handleEvent = (event: string, data: string) => {
    let json: unknown
    try {
      json = JSON.parse(data)
    } catch {
      return
    }
    if (!json || typeof json !== 'object') return
    const obj = json as {
      type?: string
      message?: { usage?: { input_tokens?: number; output_tokens?: number } }
      delta?: {
        type?: string
        text?: string
        partial_json?: string
      }
      usage?: {
        input_tokens?: number
        output_tokens?: number
        output_tokens_details?: { text_tokens?: number; reasoning_tokens?: number }
      }
    }

    if (event === 'message_start' && obj.message?.usage) {
      sawUsage = true
      if (typeof obj.message.usage.input_tokens === 'number') {
        promptTokens = obj.message.usage.input_tokens
      }
    }
    if (event === 'message_delta' && obj.usage) {
      sawUsage = true
      if (typeof obj.usage.output_tokens === 'number') {
        completionTokens = obj.usage.output_tokens
      }
    }
    if (
      event === 'content_block_delta' &&
      obj.delta?.type === 'text_delta' &&
      typeof obj.delta.text === 'string'
    ) {
      if (ttftMs == null) ttftMs = performance.now() - t0
      text += obj.delta.text
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    const chunk = decoder.decode(value, { stream: true })
    buffer += chunk
    rawChunks += chunk
    if (rawChunks.length > 8000) rawChunks = rawChunks.slice(-8000)

    let sep: number
    while ((sep = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, sep).replace(/\r$/, '')
      buffer = buffer.slice(sep + 1)
      if (line === '') {
        currentEvent = ''
        continue
      }
      if (line.startsWith(':')) continue
      if (line.startsWith('event:')) {
        currentEvent = line.slice(6).trim()
      } else if (line.startsWith('data:')) {
        handleEvent(currentEvent, line.slice(5).trim())
      }
    }
  }

  const totalMs = performance.now() - t0

  let tokenSource: BenchMetrics['tokenSource'] = 'unknown'
  if (sawUsage && completionTokens != null) {
    tokenSource = 'usage'
  } else if (text.length > 0) {
    completionTokens = estimateTokens(text)
    tokenSource = 'estimated'
  }

  logEntry.response.body = rawChunks || '(stream produced no events)'
  logEntry.timing = { ttftMs, totalMs }

  return {
    metrics: computeMetrics({
      ttftMs,
      totalMs,
      completionTokens,
      promptTokens,
      tokenSource,
    }),
    preview: text.slice(0, 280),
  }
}

/* ------------------------------------------------------------------ */
/* Public entry                                                        */
/* ------------------------------------------------------------------ */

/**
 * Runs one streaming chat completion against an OpenAI-compatible OR
 * Anthropic native endpoint and measures TTFT, total latency, and tokens/sec.
 * Captures a full request + response log entry for debugging and sharing.
 */
export async function runStreamBench(
  input: StreamBenchInput,
): Promise<StreamBenchOutput> {
  const { endpoint, slug, preset, signal } = input
  const provider = resolveProvider(
    endpoint.baseUrl,
    endpoint.apiKey,
    endpoint.provider,
  )
  const baseUrl = normalizeBaseUrl(endpoint.baseUrl)
  const targetUrl = chatEndpointUrl(baseUrl, provider)
  const url = applyProxy(targetUrl, endpoint.proxyUrl)

  const baseHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  }
  const auth = authHeaders(endpoint.apiKey, provider, baseUrl)
  const headers = { ...baseHeaders, ...auth }
  if (provider === 'openai') {
    headers['HTTP-Referer'] =
      typeof window !== 'undefined'
        ? window.location.origin
        : 'https://llm-speed-test.milliery.local'
    headers['X-Title'] = 'LLM Speed Test'
  }

  const body =
    provider === 'anthropic' ? anthropicBody(slug, preset) : openAiBody(slug, preset)

  const logEntry = newLogEntry(
    endpoint,
    url,
    'POST',
    headers,
    body,
    slug,
    preset,
  )

  const t0 = performance.now()

  try {
    const out =
      provider === 'anthropic'
        ? await streamAnthropic({ url, headers, body, signal, t0, logEntry })
        : await streamOpenAi({ url, headers, body, signal, t0, logEntry })
    return { metrics: out.metrics, preview: out.preview, log: logEntry }
  } catch (error) {
    if (signal?.aborted) throw error
    const rawMessage = error instanceof Error ? error.message : String(error)
    if (!logEntry.error) {
      logEntry.level = 'error'
      logEntry.error = looksLikeCorsError(error)
        ? `The browser couldn't read the stream from ${targetUrl} ("${rawMessage}"). ` +
          `This usually means the provider blocks browser requests. Try OpenRouter, ` +
          `add your own CORS proxy URL to this endpoint, or try its OpenAI-compatible URL.`
        : `The request couldn't reach the provider: ${rawMessage}`
      logEntry.timing = { ttftMs: null, totalMs: performance.now() - t0 }
    }
    throw Object.assign(new Error(logEntry.error), { logEntry })
  }
}
