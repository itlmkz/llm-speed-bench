import { useEffect, useMemo, useRef, useState } from 'react'
import { runStreamBench } from './lib/bench'
import { formatMs, formatTokPerSec, formatTokens } from './lib/format'
import { TEST_PRESETS, presetById } from './lib/presets'
import {
  defaultConfig,
  loadConfig,
  newEndpoint,
  newModel,
  saveConfig,
} from './lib/storage'
import type {
  AppConfig,
  BenchResult,
  EndpointConfig,
  ModelTarget,
  TestPresetId,
} from './lib/types'

function resultKey(presetId: string, modelId: string): string {
  return `${presetId}::${modelId}`
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => defaultConfig())
  const [hydrated, setHydrated] = useState(false)
  const [results, setResults] = useState<BenchResult[]>([])
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    setConfig(loadConfig())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveConfig(config)
  }, [config, hydrated])

  const endpointMap = useMemo(() => {
    const map = new Map<string, EndpointConfig>()
    for (const e of config.endpoints) map.set(e.id, e)
    return map
  }, [config.endpoints])

  const updateEndpoint = (id: string, patch: Partial<EndpointConfig>) => {
    setConfig((c) => ({
      ...c,
      endpoints: c.endpoints.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }))
  }

  const removeEndpoint = (id: string) => {
    setConfig((c) => ({
      ...c,
      endpoints: c.endpoints.filter((e) => e.id !== id),
      models: c.models.filter((m) => m.endpointId !== id),
    }))
  }

  const updateModel = (id: string, patch: Partial<ModelTarget>) => {
    setConfig((c) => ({
      ...c,
      models: c.models.map((m) => (m.id === id ? { ...m, ...patch } : m)),
    }))
  }

  const removeModel = (id: string) => {
    setConfig((c) => ({
      ...c,
      models: c.models.filter((m) => m.id !== id),
    }))
  }

  const togglePreset = (id: TestPresetId) => {
    setConfig((c) => {
      const has = c.selectedPresets.includes(id)
      const selectedPresets = has
        ? c.selectedPresets.filter((p) => p !== id)
        : [...c.selectedPresets, id]
      return { ...c, selectedPresets }
    })
  }

  const stop = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setRunning(false)
  }

  const runAll = async () => {
    const presets = config.selectedPresets
      .map((id) => presetById(id))
      .filter(Boolean)
    const models = config.models.filter((m) => m.slug.trim())

    if (!presets.length || !models.length) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setRunning(true)

    const initial: BenchResult[] = []
    for (const preset of presets) {
      if (!preset) continue
      for (const model of models) {
        const endpoint = endpointMap.get(model.endpointId)
        if (!endpoint) continue
        initial.push({
          key: resultKey(preset.id, model.id),
          presetId: preset.id,
          endpointId: endpoint.id,
          endpointLabel: endpoint.label,
          baseUrl: endpoint.baseUrl,
          slug: model.slug.trim(),
          status: 'pending',
        })
      }
    }
    setResults(initial)

    // Run sequentially so rates stay comparable and providers are not hammered.
    for (const row of initial) {
      if (ac.signal.aborted) break
      const preset = presetById(row.presetId)
      const endpoint = endpointMap.get(row.endpointId)
      if (!preset || !endpoint) continue

      setResults((prev) =>
        prev.map((r) =>
          r.key === row.key ? { ...r, status: 'running', error: undefined } : r,
        ),
      )

      try {
        const out = await runStreamBench({
          endpoint,
          slug: row.slug,
          preset,
          signal: ac.signal,
        })
        setResults((prev) =>
          prev.map((r) =>
            r.key === row.key
              ? {
                  ...r,
                  status: 'ok',
                  metrics: out.metrics,
                  preview: out.preview,
                }
              : r,
          ),
        )
      } catch (err) {
        if (ac.signal.aborted) break
        const message = err instanceof Error ? err.message : String(err)
        setResults((prev) =>
          prev.map((r) =>
            r.key === row.key ? { ...r, status: 'error', error: message } : r,
          ),
        )
      }
    }

    setRunning(false)
    abortRef.current = null
  }

  const exportJson = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            config: {
              endpoints: config.endpoints.map(({ apiKey, ...rest }) => ({
                ...rest,
                apiKeySet: Boolean(apiKey),
              })),
              models: config.models,
              selectedPresets: config.selectedPresets,
            },
            results,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `llm-speed-bench-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="hero">
        <h1 className="brand">
          LLM Speed <span>Bench</span>
        </h1>
        <p className="lede">
          Measure real streaming speed across OpenAI-compatible APIs. Add one or
          more base URLs, attach model slugs, pick a scenario, and run. Keys stay
          in your browser.
        </p>
      </header>

      <section className="panel">
        <h2>Endpoints</h2>
        <div className="stack">
          {config.endpoints.map((e) => (
            <div className="row endpoint" key={e.id}>
              <label>
                Label
                <input
                  value={e.label}
                  onChange={(ev) =>
                    updateEndpoint(e.id, { label: ev.target.value })
                  }
                  placeholder="OpenRouter"
                />
              </label>
              <label>
                Base URL
                <input
                  value={e.baseUrl}
                  onChange={(ev) =>
                    updateEndpoint(e.id, { baseUrl: ev.target.value })
                  }
                  placeholder="https://openrouter.ai/api/v1"
                  spellCheck={false}
                />
              </label>
              <label>
                API key
                <input
                  type="password"
                  value={e.apiKey}
                  onChange={(ev) =>
                    updateEndpoint(e.id, { apiKey: ev.target.value })
                  }
                  placeholder="sk-…"
                  autoComplete="off"
                />
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => removeEndpoint(e.id)}
                  disabled={config.endpoints.length <= 1}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: '0.85rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                endpoints: [...c.endpoints, newEndpoint()],
              }))
            }
          >
            Add URL
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Model slugs</h2>
        <div className="stack">
          {config.models.map((m) => (
            <div className="row model" key={m.id}>
              <label>
                Endpoint
                <select
                  value={m.endpointId}
                  onChange={(ev) =>
                    updateModel(m.id, { endpointId: ev.target.value })
                  }
                >
                  {config.endpoints.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Slug
                <input
                  value={m.slug}
                  onChange={(ev) => updateModel(m.id, { slug: ev.target.value })}
                  placeholder="openai/gpt-4o-mini"
                  spellCheck={false}
                />
              </label>
              <div className="actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-danger"
                  onClick={() => removeModel(m.id)}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="actions" style={{ marginTop: '0.85rem' }}>
          <button
            type="button"
            className="btn"
            onClick={() =>
              setConfig((c) => ({
                ...c,
                models: [
                  ...c.models,
                  newModel(c.endpoints[0]?.id ?? '', ''),
                ],
              }))
            }
          >
            Add slug
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Test scenarios</h2>
        <div className="presets">
          {TEST_PRESETS.map((p) => {
            const active = config.selectedPresets.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                className={`preset${active ? ' active' : ''}`}
                onClick={() => togglePreset(p.id)}
                aria-pressed={active}
              >
                <strong>{p.name}</strong>
                <p>{p.description}</p>
              </button>
            )
          })}
        </div>

        <div className="runbar">
          <p className="hint">
            Metrics: TTFT, total time, decode tok/s (after first token), overall
            tok/s. Runs sequentially for fairer timing.
          </p>
          <div className="actions">
            {running ? (
              <button type="button" className="btn" onClick={stop}>
                Stop
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary"
              onClick={runAll}
              disabled={
                running ||
                !config.selectedPresets.length ||
                !config.models.some((m) => m.slug.trim())
              }
            >
              {running ? 'Running…' : 'Run benchmark'}
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '0.75rem',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h2 style={{ margin: 0 }}>Results</h2>
          <button
            type="button"
            className="btn"
            onClick={exportJson}
            disabled={!results.length}
          >
            Export JSON
          </button>
        </div>

        {!results.length ? (
          <p className="empty">No runs yet. Configure endpoints and click Run.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Scenario</th>
                  <th>Endpoint</th>
                  <th>Model</th>
                  <th className="mono">TTFT</th>
                  <th className="mono">Total</th>
                  <th className="mono">Decode tok/s</th>
                  <th className="mono">Overall tok/s</th>
                  <th className="mono">Out tokens</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <span className={`badge ${r.status}`}>{r.status}</span>
                      {r.error ? (
                        <div className="error-text">{r.error}</div>
                      ) : null}
                    </td>
                    <td>{presetById(r.presetId)?.name ?? r.presetId}</td>
                    <td>{r.endpointLabel}</td>
                    <td className="slug">{r.slug}</td>
                    <td className="mono">{formatMs(r.metrics?.ttftMs)}</td>
                    <td className="mono">{formatMs(r.metrics?.totalMs)}</td>
                    <td className="metric-hi">
                      {formatTokPerSec(r.metrics?.decodeTokPerSec)}
                    </td>
                    <td className="mono">
                      {formatTokPerSec(r.metrics?.overallTokPerSec)}
                    </td>
                    <td className="mono">
                      {formatTokens(r.metrics?.completionTokens)}
                      {r.metrics?.tokenSource === 'estimated' ? '≈' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="footer">
        Client-only. Requests go from your browser to each API. Works with
        OpenRouter, xAI/Grok, OpenAI, Groq, Ollama, and other OpenAI-compatible
        chat completions endpoints. CORS must allow browser calls.
      </footer>
    </div>
  )
}
