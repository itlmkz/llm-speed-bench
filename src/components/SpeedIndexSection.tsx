import { useEffect, useState } from 'react'
import { Alert, Button, Card, Input, Label, TextField } from '@heroui/react'
import { EmptyState } from '@heroui-pro/react/empty-state'
import { fetchSpeedIndex, type SpeedIndexRow } from '../lib/contribute'
import { formatMs, formatTokPerSec } from '../lib/format'
import { BRAND } from '../lib/brand'

function successRate(row: SpeedIndexRow): string {
  if (!row.nTotal) return '—'
  return `${Math.round((row.nOk / row.nTotal) * 100)}%`
}

function sortRows(rows: SpeedIndexRow[]): SpeedIndexRow[] {
  return [...rows].sort((a, b) => {
    if (a.p50DecodeTokS != null && b.p50DecodeTokS != null) {
      return b.p50DecodeTokS - a.p50DecodeTokS
    }
    if (a.p50DecodeTokS != null) return -1
    if (b.p50DecodeTokS != null) return 1
    return a.modelSlug.localeCompare(b.modelSlug)
  })
}

export function SpeedIndexSection() {
  const [windowDays, setWindowDays] = useState<'7d' | '30d'>('7d')
  const [task, setTask] = useState('')
  const [country, setCountry] = useState('')
  const [model, setModel] = useState('')
  const [rows, setRows] = useState<SpeedIndexRow[]>([])
  const [configured, setConfigured] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const apply = (days: '7d' | '30d') => {
    setWindowDays(days)
    setLoading(true)
    setError('')
    void fetchSpeedIndex({
      window: days,
      task: task.trim() || undefined,
      country: country.trim() || undefined,
      model: model.trim() || undefined,
    })
      .then((data) => {
        setConfigured(data.configured)
        setRows(sortRows(data.rows))
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
        setRows([])
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let cancelled = false
    void fetchSpeedIndex({ window: '7d' })
      .then((data) => {
        if (cancelled) return
        setConfigured(data.configured)
        setRows(sortRows(data.rows))
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : String(err))
        setRows([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-6">
      <Alert status="accent">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Crowdsourced speed, not a blended average</Alert.Title>
          <Alert.Description>
            Each row is one model on one provider host, one task, in one
            country. API keys and authorization headers are never stored.{' '}
            <a
              href={BRAND.wikiUrl}
              className="underline underline-offset-4"
              target="_blank"
              rel="noreferrer"
            >
              Speed Index wiki
            </a>
          </Alert.Description>
        </Alert.Content>
      </Alert>

      <Card>
        <Card.Header>
          <Card.Title>Public speed index</Card.Title>
          <Card.Description>
            p50 decode tok/s is generation speed after the first token. Overall
            tok/s includes the wait for that first token. Filter — don&apos;t mix
            models.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={windowDays === '7d' ? 'primary' : 'secondary'}
              onPress={() => apply('7d')}
            >
              Last 7 days
            </Button>
            <Button
              size="sm"
              variant={windowDays === '30d' ? 'primary' : 'secondary'}
              onPress={() => apply('30d')}
            >
              Last 30 days
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <TextField
              aria-label="Filter by model"
              value={model}
              onChange={setModel}
            >
              <Label>Model contains</Label>
              <Input placeholder="grok-4.3" />
            </TextField>
            <TextField
              aria-label="Filter by task"
              value={task}
              onChange={setTask}
            >
              <Label>Task id</Label>
              <Input placeholder="debug / document / coding" />
            </TextField>
            <TextField
              aria-label="Filter by country"
              value={country}
              onChange={setCountry}
            >
              <Label>Country (ISO)</Label>
              <Input placeholder="FR" />
            </TextField>
          </div>
        </Card.Content>
        <Card.Footer>
          <Button variant="secondary" onPress={() => apply(windowDays)}>
            Apply filters
          </Button>
        </Card.Footer>
      </Card>

      {!configured ? (
        <Card>
          <Card.Content className="py-8">
            <EmptyState>
              <EmptyState.Header>
                <EmptyState.Title>Index not connected yet</EmptyState.Title>
                <EmptyState.Description>
                  Neon stores anonymized runs. Until DATABASE_URL is set on
                  Netlify, this table stays empty. Schema and privacy rules are
                  in the wiki.
                </EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          </Card.Content>
        </Card>
      ) : loading ? (
        <p className="text-sm text-muted">Loading index…</p>
      ) : error ? (
        <p className="text-sm text-danger">{error}</p>
      ) : !rows.length ? (
        <Card>
          <Card.Content className="py-8">
            <EmptyState>
              <EmptyState.Header>
                <EmptyState.Title>No contributed runs yet</EmptyState.Title>
                <EmptyState.Description>
                  Opt in on the Benchmark tab after a run. Only sanitized
                  metrics are sent — never keys.
                </EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          </Card.Content>
        </Card>
      ) : (
        <Card>
          <Card.Content>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs tracking-wide text-muted uppercase">
                    <th className="px-2 py-3 font-medium">Model</th>
                    <th className="px-2 py-3 font-medium">Provider host</th>
                    <th className="px-2 py-3 font-medium">Task</th>
                    <th className="px-2 py-3 font-medium">Country</th>
                    <th className="mono px-2 py-3 font-medium">n</th>
                    <th className="mono px-2 py-3 font-medium">p50 decode</th>
                    <th className="mono px-2 py-3 font-medium">p50 overall</th>
                    <th className="mono px-2 py-3 font-medium">p50 TTFT</th>
                    <th className="mono px-2 py-3 font-medium">OK rate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.modelSlug}:${row.endpointHost}:${row.taskId}:${row.geoCountry}`}
                      className="border-b border-border/70"
                    >
                      <td className="mono px-2 py-3 text-xs">{row.modelSlug}</td>
                      <td className="mono px-2 py-3 text-xs">
                        {row.endpointHost}
                      </td>
                      <td className="px-2 py-3">{row.taskId}</td>
                      <td className="px-2 py-3">
                        {row.geoCountry ?? '—'}
                        {row.geoContinent ? (
                          <span className="text-muted">
                            {' '}
                            · {row.geoContinent}
                          </span>
                        ) : null}
                      </td>
                      <td className="mono px-2 py-3">
                        {row.nOk}
                        {row.nOk < 5 ? (
                          <span className="ml-1 text-xs text-muted">early</span>
                        ) : null}
                      </td>
                      <td className="mono px-2 py-3 font-semibold text-accent">
                        {formatTokPerSec(row.p50DecodeTokS)}
                      </td>
                      <td className="mono px-2 py-3">
                        {formatTokPerSec(row.p50OverallTokS)}
                      </td>
                      <td className="mono px-2 py-3">
                        {formatMs(row.p50TtftMs)}
                      </td>
                      <td className="mono px-2 py-3">{successRate(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card.Content>
        </Card>
      )}
    </div>
  )
}
