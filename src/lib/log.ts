import {
  redactHeaders,
  sanitizeLogEntry,
  redactSecretsInString,
  redactUrl,
  type SanitizedLogEntry,
} from './sanitize'

export type LogEntry = SanitizedLogEntry

export { redactHeaders, redactSecretsInString, redactUrl, sanitizeLogEntry }

export function downloadLogs(entries: LogEntry[]): void {
  const safe = entries.map(sanitizeLogEntry)
  const lines: string[] = []
  lines.push('LLM Speed Test — request log')
  lines.push(`Generated: ${new Date().toISOString()}`)
  lines.push(`Entries: ${safe.length}`)
  lines.push('Keys and authorization headers are stripped. Never paste a raw key into an issue.')
  lines.push('='.repeat(72))
  lines.push('')

  for (const entry of safe) {
    lines.push(`[${entry.ts}] ${entry.level.toUpperCase()} — ${entry.label}`)
    lines.push(`  Scenario:   ${entry.scenario}`)
    lines.push(`  Endpoint:   ${entry.endpointLabel}`)
    lines.push(`  Base URL:   ${entry.baseUrl}`)
    lines.push(`  Slug:       ${entry.slug}`)
    lines.push('')
    lines.push('  REQUEST SENT:')
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
      lines.push('  RESPONSE RECEIVED:')
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
      lines.push('  WHAT WENT WRONG:')
      lines.push(`    ${entry.error}`)
      lines.push('')
    }
    lines.push('-'.repeat(72))
    lines.push('')
  }

  lines.push('')
  lines.push('='.repeat(72))
  lines.push('RAW JSON (handy when sharing this log):')
  lines.push('='.repeat(72))
  lines.push(JSON.stringify(safe, null, 2))

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `llm-speed-test-log-${Date.now()}.log`
  anchor.click()
  URL.revokeObjectURL(url)
}
