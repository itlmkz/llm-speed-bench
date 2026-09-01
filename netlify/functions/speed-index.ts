import { neon } from '@neondatabase/serverless'

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=60',
  },
  body: JSON.stringify(body),
})

export async function handler(event: {
  httpMethod: string
  queryStringParameters: Record<string, string | undefined> | null
}) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, body: '' }
  }
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'method_not_allowed' })
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    return json(503, { configured: false, window: '7d', rows: [] })
  }

  const q = event.queryStringParameters ?? {}
  const window = q.window === '30d' ? '30d' : '7d'
  const task = q.task?.trim() || null
  const country = q.country?.trim().toUpperCase() || null
  const model = q.model?.trim() || null

  if (task && !['debug', 'document', 'coding'].includes(task)) {
    return json(400, { error: 'invalid_task' })
  }
  if (country && !/^[A-Z]{2}$/.test(country)) {
    return json(400, { error: 'invalid_country' })
  }
  if (model && model.length > 200) {
    return json(400, { error: 'invalid_model' })
  }

  const sql = neon(databaseUrl)
  const view = window === '30d' ? 'speed_index_30d' : 'speed_index_7d'

  try {
    const rows =
      view === 'speed_index_30d'
        ? await sql`
            SELECT
              model_slug,
              endpoint_host,
              task_id,
              geo_country,
              geo_continent,
              n_ok,
              n_total,
              p50_ttft_ms,
              p90_ttft_ms,
              p50_decode_tok_s,
              p90_decode_tok_s,
              p50_overall_tok_s
            FROM speed_index_30d
            WHERE (${task}::text IS NULL OR task_id = ${task})
              AND (${country}::text IS NULL OR geo_country = ${country})
              AND (
                ${model}::text IS NULL
                OR model_slug ILIKE '%' || ${model} || '%'
              )
            ORDER BY p50_decode_tok_s DESC NULLS LAST
            LIMIT 200
          `
        : await sql`
            SELECT
              model_slug,
              endpoint_host,
              task_id,
              geo_country,
              geo_continent,
              n_ok,
              n_total,
              p50_ttft_ms,
              p90_ttft_ms,
              p50_decode_tok_s,
              p90_decode_tok_s,
              p50_overall_tok_s
            FROM speed_index_7d
            WHERE (${task}::text IS NULL OR task_id = ${task})
              AND (${country}::text IS NULL OR geo_country = ${country})
              AND (
                ${model}::text IS NULL
                OR model_slug ILIKE '%' || ${model} || '%'
              )
            ORDER BY p50_decode_tok_s DESC NULLS LAST
            LIMIT 200
          `

    return json(200, {
      configured: true,
      window,
      rows: rows.map((row) => ({
        modelSlug: String(row.model_slug),
        endpointHost: String(row.endpoint_host),
        taskId: String(row.task_id),
        geoCountry: row.geo_country ? String(row.geo_country) : null,
        geoContinent: row.geo_continent ? String(row.geo_continent) : null,
        nOk: Number(row.n_ok),
        nTotal: Number(row.n_total),
        p50TtftMs: row.p50_ttft_ms == null ? null : Number(row.p50_ttft_ms),
        p90TtftMs: row.p90_ttft_ms == null ? null : Number(row.p90_ttft_ms),
        p50DecodeTokS:
          row.p50_decode_tok_s == null ? null : Number(row.p50_decode_tok_s),
        p90DecodeTokS:
          row.p90_decode_tok_s == null ? null : Number(row.p90_decode_tok_s),
        p50OverallTokS:
          row.p50_overall_tok_s == null ? null : Number(row.p50_overall_tok_s),
      })),
    })
  } catch {
    return json(503, { configured: false, window, rows: [] })
  }
}
