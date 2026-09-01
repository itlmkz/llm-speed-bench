import { createHmac } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { payloadLooksDangerous } from '../../src/lib/sanitize'
import { clientIpFromHeaders, continentOf, countryFromHeaders } from './geo'

type JsonRecord = Record<string, unknown>

const TASKS = new Set(['debug', 'document', 'coding'])
const PROVIDERS = new Set(['openai', 'anthropic'])
const STATUSES = new Set(['ok', 'error'])
const ERROR_KINDS = new Set([
  'none',
  'cors',
  'http_401',
  'http_403',
  'http_403_geo',
  'http_404',
  'http_429',
  'http_other',
  'timeout',
  'abort',
  'network',
  'unknown',
])
const TOKEN_SOURCES = new Set(['usage', 'estimated', 'unknown'])

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HOST_RE = /^[a-z0-9.-]+$/i
const HEX64_RE = /^[a-z0-9]{64}$/i

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  },
  body: JSON.stringify(body),
})

function asString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max) return null
  return trimmed
}

function asNumber(value: unknown, min: number, max: number): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  if (value < min || value > max) return null
  return value
}

function asInt(value: unknown, min: number, max: number): number | null {
  const n = asNumber(value, min, max)
  if (n == null) return null
  return Math.round(n)
}

export async function handler(event: {
  httpMethod: string
  headers: Record<string, string | undefined>
  body: string | null
}) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' }
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return json(503, { error: 'not_configured', configured: false })
  }

  const raw = event.body ?? ''
  if (!raw || raw.length > 8000) {
    return json(400, { error: 'invalid_payload' })
  }
  if (payloadLooksDangerous(raw)) {
    return json(400, { error: 'secrets_rejected' })
  }

  let parsed: JsonRecord
  try {
    parsed = JSON.parse(raw) as JsonRecord
  } catch {
    return json(400, { error: 'invalid_json' })
  }

  if (parsed.schemaVersion !== 1) {
    return json(400, { error: 'unsupported_schema' })
  }

  const sessionId = asString(parsed.sessionId, 36)
  const providerType = asString(parsed.providerType, 16)
  const endpointHost = asString(parsed.endpointHost, 253)
  const endpointLabel = asString(parsed.endpointLabel, 80) ?? ''
  const modelSlug = asString(parsed.modelSlug, 200)
  const taskId = asString(parsed.taskId, 16)
  const promptVersion = asString(parsed.promptVersion, 64)
  const status = asString(parsed.status, 8)
  const errorKind = asString(parsed.errorKind, 32) ?? 'unknown'
  const clientTz = asString(parsed.clientTz, 64) ?? 'unknown'
  const appVersion = asString(parsed.appVersion, 32) ?? 'unknown'

  if (
    !sessionId ||
    !UUID_RE.test(sessionId) ||
    !providerType ||
    !PROVIDERS.has(providerType) ||
    !endpointHost ||
    !HOST_RE.test(endpointHost) ||
    !modelSlug ||
    !taskId ||
    !TASKS.has(taskId) ||
    !promptVersion ||
    !HEX64_RE.test(promptVersion) ||
    !status ||
    !STATUSES.has(status) ||
    !ERROR_KINDS.has(errorKind)
  ) {
    return json(400, { error: 'invalid_payload' })
  }

  const ttftMs = asNumber(parsed.ttftMs, 0, 180_000)
  const totalMs = asNumber(parsed.totalMs, 0, 600_000)
  const decodeTokPerSec = asNumber(parsed.decodeTokPerSec, 0.05, 4000)
  const overallTokPerSec = asNumber(parsed.overallTokPerSec, 0.05, 4000)
  const completionTokens = asInt(parsed.completionTokens, 0, 1_000_000)
  const promptTokens = asInt(parsed.promptTokens, 0, 1_000_000)
  const httpStatus = asInt(parsed.httpStatus, 100, 599)
  const tokenSource = asString(parsed.tokenSource, 16)
  const tokenSourceOk =
    tokenSource == null || TOKEN_SOURCES.has(tokenSource) ? tokenSource : null

  if (
    status === 'ok' &&
    ttftMs == null &&
    totalMs == null &&
    decodeTokPerSec == null &&
    overallTokPerSec == null
  ) {
    return json(400, { error: 'missing_metrics' })
  }

  const headers = event.headers ?? {}
  const geoCountry = countryFromHeaders(headers)
  const geoContinent = continentOf(geoCountry)
  const ip = clientIpFromHeaders(headers)
  const hmacKey = process.env.INGEST_HMAC_SECRET || databaseUrl
  const ipHmac = ip
    ? createHmac('sha256', hmacKey).update(ip).digest('hex')
    : createHmac('sha256', hmacKey).update(`session:${sessionId}`).digest('hex')

  const sql = neon(databaseUrl)

  try {
    const rate = await sql`
      INSERT INTO ingest_rate (ip_hmac, window_start, hit_count)
      VALUES (${ipHmac}, date_trunc('hour', now()), 1)
      ON CONFLICT (ip_hmac, window_start)
      DO UPDATE SET hit_count = ingest_rate.hit_count + 1
      RETURNING hit_count
    `
    const hits = Number(rate[0]?.hit_count ?? 0)
    if (hits > 80) {
      return json(429, { error: 'rate_limited' })
    }

    await sql`
      INSERT INTO runs (
        session_id,
        provider_type,
        endpoint_host,
        endpoint_label,
        model_slug,
        task_id,
        prompt_version,
        status,
        ttft_ms,
        total_ms,
        decode_tok_s,
        overall_tok_s,
        completion_tokens,
        prompt_tokens,
        token_source,
        error_kind,
        http_status,
        geo_country,
        geo_continent,
        client_tz,
        app_version,
        schema_version
      ) VALUES (
        ${sessionId}::uuid,
        ${providerType},
        ${endpointHost},
        ${endpointLabel},
        ${modelSlug},
        ${taskId},
        ${promptVersion},
        ${status},
        ${ttftMs},
        ${totalMs},
        ${decodeTokPerSec},
        ${overallTokPerSec},
        ${completionTokens},
        ${promptTokens},
        ${tokenSourceOk},
        ${status === 'ok' ? 'none' : errorKind},
        ${httpStatus},
        ${geoCountry},
        ${geoContinent},
        ${clientTz},
        ${appVersion},
        1
      )
    `
  } catch {
    return json(503, { error: 'store_unavailable' })
  }

  return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' }
}
