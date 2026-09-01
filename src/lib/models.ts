import type { EndpointConfig } from './types'
import { redactHeaders, redactSecretsInString, redactUrl, type LogEntry } from './log'
import {
  applyProxy,
  authHeaders,
  looksLikeCorsError,
  modelsEndpointUrl,
  normalizeBaseUrl,
  resolveProvider,
  validateBaseUrl,
} from './providers'

export type FetchModelsResult = {
  models: string[]
  /** human-readable diagnostic; empty string when ok */
  error: string
  /** one of: ok, invalid_url, missing_key, unauthorized, not_found, timeout, network, parse, other */
  errorKind:
    | 'ok'
    | 'invalid_url'
    | 'missing_key'
    | 'unauthorized'
    | 'not_found'
    | 'timeout'
    | 'network'
    | 'parse'
    | 'other'
  log: LogEntry
}

const FETCH_TIMEOUT_MS = 12000

function newLogEntry(endpoint: EndpointConfig, url: string): LogEntry {
  return {
    id:
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`,
    ts: new Date().toISOString(),
    level: 'info',
    label: `${endpoint.label} · fetch models`,
    scenario: 'fetch-models',
    endpointLabel: endpoint.label,
    baseUrl: endpoint.baseUrl,
    slug: '',
    request: {
      method: 'GET',
      url: redactUrl(url),
      headers: {},
      body: null,
    },
  }
}

function classifyStatus(
  status: number,
  hasKey: boolean,
): FetchModelsResult['errorKind'] {
  if (status === 401 || status === 403) return 'unauthorized'
  if (status === 404) return 'not_found'
  if ((status === 402 || status === 429) && !hasKey) return 'missing_key'
  return 'other'
}

function friendlyMessage(
  kind: FetchModelsResult['errorKind'],
  status: number,
  detail: string,
  url: string,
): string {
  switch (kind) {
    case 'invalid_url':
      return `That URL doesn't look like an AI API endpoint. ${detail}`.trim()
    case 'missing_key':
      return 'Add an API key for this endpoint, then fetch the models again.'
    case 'unauthorized':
      return `The provider rejected the key (HTTP ${status}). Check that it is correct, active, and allowed to use this endpoint.`
    case 'not_found':
      return `We couldn't find a models endpoint at ${url} (HTTP 404). Check the base URL, or use a provider that exposes /models.`
    case 'timeout':
      return `The model list took longer than ${FETCH_TIMEOUT_MS / 1000}s. The URL may be unreachable, or the key and URL may not belong together.`
    case 'network':
      return detail.includes('CORS') || detail.includes('blocked')
        ? detail
        : `The browser couldn't reach that endpoint: ${detail}. This is often CORS, an unreachable host, or a bad URL.`
    case 'parse':
      return `The endpoint replied, but not with a model list. ${detail}`.trim()
    case 'other':
      return `The provider returned HTTP ${status}: ${detail.slice(0, 300) || '(no response body)'}`
    case 'ok':
      return ''
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}

function extractModels(json: unknown): string[] {
  if (!json || typeof json !== 'object') return []
  const obj = json as {
    data?: Array<{ id?: string; name?: string }>
    models?: Array<{ id?: string; name?: string } | string>
  }
  const fromData = obj.data
  if (Array.isArray(fromData)) {
    return fromData
      .map((m) => (m && typeof m === 'object' ? (m.id ?? m.name) : String(m)))
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
  }
  if (Array.isArray(obj.models)) {
    return obj.models
      .map((m) =>
        typeof m === 'string' ? m : m && typeof m === 'object' ? (m.id ?? m.name) : '',
      )
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
  }
  return []
}

/**
 * Fetch the list of available models for an endpoint using its API key.
 * Works for OpenAI-compatible /models and Anthropic /v1/models.
 * On any failure, returns a clear diagnostic the UI can show.
 */
export async function fetchModels(
  endpoint: EndpointConfig,
): Promise<FetchModelsResult> {
  const baseUrl = normalizeBaseUrl(endpoint.baseUrl)
  const validation = validateBaseUrl(baseUrl)

  if (validation.suspect) {
    const log = newLogEntry(endpoint, baseUrl)
    log.level = 'error'
    log.error = friendlyMessage('invalid_url', 0, validation.reason, baseUrl)
    return {
      models: [],
      error: log.error,
      errorKind: 'invalid_url',
      log,
    }
  }

  const hasKey = endpoint.apiKey.trim().length > 0
  if (!hasKey) {
    const url = modelsEndpointUrl(
      baseUrl,
      resolveProvider(baseUrl, endpoint.apiKey, endpoint.provider),
    )
    const log = newLogEntry(endpoint, url)
    log.level = 'error'
    log.error = friendlyMessage('missing_key', 0, '', url)
    return {
      models: [],
      error: log.error,
      errorKind: 'missing_key',
      log,
    }
  }

  const provider = resolveProvider(baseUrl, endpoint.apiKey, endpoint.provider)
  const targetUrl = modelsEndpointUrl(baseUrl, provider)
  const url = applyProxy(targetUrl, endpoint.proxyUrl)
  const headers = authHeaders(endpoint.apiKey, provider, baseUrl)

  const log = newLogEntry(endpoint, url)
  log.request.headers = redactHeaders(headers)
  log.request.url = redactUrl(url)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const t0 = performance.now()

  let res: Response
  try {
    res = await fetch(url, { method: 'GET', headers, signal: controller.signal })
  } catch (err) {
    clearTimeout(timer)
    const aborted =
      err instanceof DOMException && err.name === 'AbortError'
    const cors = !aborted && looksLikeCorsError(err)
    const kind: FetchModelsResult['errorKind'] = aborted
      ? 'timeout'
      : cors
        ? 'network'
        : 'network'
    const detail = aborted
      ? ''
      : cors
        ? `Browser blocked the response from ${targetUrl} (likely CORS). ` +
          `This provider may not allow direct browser calls on this endpoint. ` +
          `Try setting a CORS proxy URL on this endpoint, or use OpenRouter.`
        : err instanceof Error
          ? err.message
          : String(err)
    log.level = 'error'
    log.error = friendlyMessage(kind, 0, detail, url)
    log.timing = { ttftMs: null, totalMs: performance.now() - t0 }
    return { models: [], error: log.error, errorKind: kind, log }
  }
  clearTimeout(timer)

  log.response = {
    status: res.status,
    statusText: res.statusText,
    headers: redactHeaders(Object.fromEntries(res.headers.entries())),
    body: '',
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    log.response.body = redactSecretsInString(bodyText)
    log.level = 'error'
    const kind = classifyStatus(res.status, hasKey)
    log.error = friendlyMessage(kind, res.status, bodyText, url)
    return { models: [], error: log.error, errorKind: kind, log }
  }

  const text = await res.text().catch(() => '')
  log.response.body = redactSecretsInString(text.slice(0, 4000))
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    log.level = 'error'
    log.error = friendlyMessage('parse', 0, 'Response was not valid JSON.', url)
    return { models: [], error: log.error, errorKind: 'parse', log }
  }

  const models = extractModels(json)
  if (!models.length) {
    log.level = 'error'
    log.error = friendlyMessage(
      'parse',
      0,
      'Response had no `data` or `models` array.',
      url,
    )
    return { models: [], error: log.error, errorKind: 'parse', log }
  }

  log.timing = { ttftMs: null, totalMs: performance.now() - t0 }
  return {
    models: models.sort((a, b) => a.localeCompare(b)),
    error: '',
    errorKind: 'ok',
    log,
  }
}
