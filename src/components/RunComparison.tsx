import { Card, Chip } from '@heroui/react'
import { formatMs, formatTokPerSec } from '../lib/format'
import { summarizeRun } from '../lib/summary'
import type { BenchResult } from '../lib/types'

export function RunComparison({ results }: { results: BenchResult[] }) {
  const groups = summarizeRun(results)
  if (!groups.length) return null

  return (
    <Card>
      <Card.Header>
        <Card.Title>This run, by model</Card.Title>
        <Card.Description>
          Decode, overall, and TTFT for each model on each provider. Numbers
          are the mean across the scenarios you ran for that pair — never
          across different models.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs tracking-wide text-muted uppercase">
                <th className="px-2 py-3 font-medium">Provider</th>
                <th className="px-2 py-3 font-medium">Model</th>
                <th className="px-2 py-3 font-medium">Scenarios</th>
                <th className="mono px-2 py-3 font-medium">Decode tok/s</th>
                <th className="mono px-2 py-3 font-medium">Overall tok/s</th>
                <th className="mono px-2 py-3 font-medium">TTFT</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) =>
                group.models.map((row, index) => (
                  <tr
                    key={row.key}
                    className="border-b border-border/70 align-top"
                  >
                    <td className="px-2 py-3">
                      {index === 0 ? group.endpointLabel : ''}
                    </td>
                    <td className="px-2 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="mono text-xs">{row.slug}</span>
                        {row.fastestDecode ? (
                          <Chip color="success" variant="soft" size="sm">
                            <Chip.Label>Fastest decode</Chip.Label>
                          </Chip>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-2 py-3 text-muted">
                      {row.nOk}/{row.nTasks} ok
                      {row.nTasks > 1 ? ' · mean' : ''}
                    </td>
                    <td className="mono px-2 py-3 font-semibold text-accent">
                      {formatTokPerSec(row.decodeTokPerSec)}
                    </td>
                    <td className="mono px-2 py-3">
                      {formatTokPerSec(row.overallTokPerSec)}
                    </td>
                    <td className="mono px-2 py-3">{formatMs(row.ttftMs)}</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </Card.Content>
    </Card>
  )
}
