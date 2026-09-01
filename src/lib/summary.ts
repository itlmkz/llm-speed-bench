import type { BenchResult } from './types'

export type ModelSpeedRow = {
  key: string
  endpointId: string
  endpointLabel: string
  slug: string
  nOk: number
  nError: number
  nPending: number
  nTasks: number
  decodeTokPerSec: number | null
  overallTokPerSec: number | null
  ttftMs: number | null
  fastestDecode: boolean
}

export type ProviderSpeedGroup = {
  endpointId: string
  endpointLabel: string
  models: ModelSpeedRow[]
}

function mean(
  rows: BenchResult[],
  pick: (row: BenchResult) => number | null | undefined,
): number | null {
  const values = rows
    .map(pick)
    .filter((value): value is number => value != null && !Number.isNaN(value))
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function groupKey(row: BenchResult): string {
  return `${row.endpointId}::${row.slug}`
}

/**
 * Speed for this run, grouped by provider then model.
 * Averages only across scenarios of the same model on the same endpoint.
 * Different models are never blended.
 */
export function summarizeRun(results: BenchResult[]): ProviderSpeedGroup[] {
  if (!results.length) return []

  const buckets = new Map<string, BenchResult[]>()
  for (const row of results) {
    const key = groupKey(row)
    const list = buckets.get(key)
    if (list) list.push(row)
    else buckets.set(key, [row])
  }

  const models: ModelSpeedRow[] = []
  for (const [key, rows] of buckets) {
    const sample = rows[0]
    const ok = rows.filter((row) => row.status === 'ok' && row.metrics)
    models.push({
      key,
      endpointId: sample.endpointId,
      endpointLabel: sample.endpointLabel,
      slug: sample.slug,
      nOk: ok.length,
      nError: rows.filter((row) => row.status === 'error').length,
      nPending: rows.filter(
        (row) => row.status === 'pending' || row.status === 'running',
      ).length,
      nTasks: rows.length,
      decodeTokPerSec: mean(ok, (row) => row.metrics?.decodeTokPerSec),
      overallTokPerSec: mean(ok, (row) => row.metrics?.overallTokPerSec),
      ttftMs: mean(ok, (row) => row.metrics?.ttftMs),
      fastestDecode: false,
    })
  }

  const bestDecode = models.reduce<number | null>((best, row) => {
    if (row.decodeTokPerSec == null) return best
    if (best == null || row.decodeTokPerSec > best) return row.decodeTokPerSec
    return best
  }, null)

  for (const row of models) {
    row.fastestDecode =
      bestDecode != null &&
      row.decodeTokPerSec != null &&
      row.decodeTokPerSec === bestDecode
  }

  models.sort((a, b) => {
    if (a.decodeTokPerSec != null && b.decodeTokPerSec != null) {
      return b.decodeTokPerSec - a.decodeTokPerSec
    }
    if (a.decodeTokPerSec != null) return -1
    if (b.decodeTokPerSec != null) return 1
    return a.slug.localeCompare(b.slug)
  })

  const providers = new Map<string, ProviderSpeedGroup>()
  for (const row of models) {
    const existing = providers.get(row.endpointId)
    if (existing) {
      existing.models.push(row)
    } else {
      providers.set(row.endpointId, {
        endpointId: row.endpointId,
        endpointLabel: row.endpointLabel,
        models: [row],
      })
    }
  }

  return [...providers.values()].sort((a, b) => {
    const aBest = a.models[0]?.decodeTokPerSec
    const bBest = b.models[0]?.decodeTokPerSec
    if (aBest != null && bBest != null) return bBest - aBest
    if (aBest != null) return -1
    if (bBest != null) return 1
    return a.endpointLabel.localeCompare(b.endpointLabel)
  })
}
