const REDACTED = '[redacted]'

const SECRET_HEADER_EXACT =
  /^(authorization|proxy-authorization|x-api-key|api-key|x-api-token|x-auth-token|x-access-token|cookie|set-cookie|token)$/i

const SECRET_HEADER_FUZZY = /api-?key|authorization|secret|password|credential|(?:^|-)token$/i

/** Provider key material and bearer tokens. Never keep prefixes or suffixes. */
const SECRET_VALUE_RE =
  /\b(?:Bearer\s+)\S+|\bsk-ant-[a-zA-Z0-9_-]+|\bsk-(?:or-|proj-|svcacct-)?[a-zA-Z0-9_-]{8,}/i

const SECRET_JSON_KEYS = /^(api[_-]?key|authorization|access[_-]?token|secret|password|credential)$/i

export function headerLooksSecret(name: string): boolean {
  return SECRET_HEADER_EXACT.test(name) || SECRET_HEADER_FUZZY.test(name)
}

export function redactSecretsInString(value: string): string {
  return value.replace(
    new RegExp(SECRET_VALUE_RE.source, 'gi'),
    REDACTED,
  )
}

export function stringLooksLikeSecret(value: string): boolean {
  if (!value) return false
  return SECRET_VALUE_RE.test(value)
}

export function redactUrl(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.username = ''
    parsed.password = ''
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return stringLooksLikeSecret(url) ? REDACTED : url
  }
}

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (headerLooksSecret(key) || stringLooksLikeSecret(value)) {
      out[key] = REDACTED
    } else {
      out[key] = redactSecretsInString(value)
    }
  }
  return out
}

export function redactDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactSecretsInString(value)
  if (Array.isArray(value)) return value.map(redactDeep)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SECRET_JSON_KEYS.test(key) ? REDACTED : redactDeep(child)
    }
    return out
  }
  return value
}

export type SanitizedLogEntry = {
  id: string
  ts: string
  level: 'info' | 'error'
  label: string
  scenario: string
  endpointLabel: string
  baseUrl: string
  slug: string
  request: {
    method: string
    url: string
    headers: Record<string, string>
    body: unknown
  }
  response?: {
    status: number
    statusText: string
    headers: Record<string, string>
    body: string
  }
  timing?: {
    ttftMs: number | null
    totalMs: number
  }
  error?: string
}

export function sanitizeLogEntry(entry: SanitizedLogEntry): SanitizedLogEntry {
  return {
    ...entry,
    label: redactSecretsInString(entry.label),
    endpointLabel: redactSecretsInString(entry.endpointLabel),
    baseUrl: redactUrl(entry.baseUrl),
    slug: redactSecretsInString(entry.slug),
    error: entry.error ? redactSecretsInString(entry.error) : undefined,
    request: {
      method: entry.request.method,
      url: redactUrl(entry.request.url),
      headers: redactHeaders(entry.request.headers),
      body: redactDeep(entry.request.body),
    },
    response: entry.response
      ? {
          status: entry.response.status,
          statusText: entry.response.statusText,
          headers: redactHeaders(entry.response.headers),
          body: redactSecretsInString(entry.response.body),
        }
      : undefined,
  }
}

/** True if a serialized ingest body still contains key-like material. */
export function payloadLooksDangerous(raw: string): boolean {
  return stringLooksLikeSecret(raw) || /"(authorization|x-api-key|apiKey)"\s*:/i.test(raw)
}
