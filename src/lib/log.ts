export type LogEntry = {
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

export function redactHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) {
    if (/authorization/i.test(key)) {
      const v = String(value)
      const token = v.replace(/^Bearer\s+/i, '')
      out[key] = `Bearer ${token.slice(0, 6)}…${token.slice(-4)} (redacted, ${token.length} chars)`
    } else {
      out[key] = value
    }
  }
  return out
}

export function downloadLogs(entries: LogEntry[]): void {
  const lines: string[] = []
  lines.push('LLM Speed Test — request log')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Entries: ${entries.length}`)
  lines.push('='.repeat(72))
  lines.push('')

  for (const entry of entries) {
    lines.push(`[${entry.ts}] ${entry.level.toUpperCase()} — ${entry.label}`)
    lines.push(`  Scenario:   ${entry.scenario}`)
    lines.push(`  Endpoint:   ${entry.endpointLabel}`)
    lines.push(`  Base URL:   ${entry.baseUrl}`)
    lines.push(`  Slug:       ${entry.slug}`)
    lines.push('')
    lines.push('  REQUEST:')
    lines.push(`    ${entry.request.method} ${entry.request.url}`)
    for (const [k, v] of Object.entries(entry.request.headers)) {
      lines.push(`    ${k}: ${v}`)
    }
    lines.push('    body:')
    lines.push(
      JSON.stringify(entry.request.body, null, 2)
        .split('\n')
        .map((l) => `      ${l}`)
        .join('\n'),
    )
    lines.push('')
    if (entry.response) {
      lines.push('  RESPONSE:')
      lines.push(`    HTTP ${entry.response.status} ${entry.response.statusText}`)
      for (const [k, v] of Object.entries(entry.response.headers)) {
        lines.push(`    ${k}: ${v}`)
      }
      lines.push('    body:')
      const body = entry.response.body || '(empty)'
      lines.push(
        body
          .split('\n')
          .map((l) => `      ${l}`)
          .join('\n'),
      )
      lines.push('')
    }
    if (entry.timing) {
      lines.push('  TIMING:')
      lines.push(`    TTFT:  ${entry.timing.ttftMs ?? 'n/a'} ms`)
      lines.push(`    Total: ${entry.timing.totalMs} ms`)
      lines.push('')
    }
    if (entry.error) {
      lines.push('  ERROR:')
      lines.push(`    ${entry.error}`)
      lines.push('')
    }
    lines.push('-'.repeat(72))
    lines.push('')
  }

  lines.push('')
  lines.push('='.repeat(72))
  lines.push('RAW JSON (for sharing):')
  lines.push('='.repeat(72))
  lines.push(JSON.stringify(entries, null, 2))

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `llm-speed-test-log-${Date.now()}.log`
  anchor.click()
  URL.revokeObjectURL(url)
}
