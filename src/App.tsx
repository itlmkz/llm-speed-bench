import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Chip,
  Description,
  Input,
  Label,
  ListBox,
  Select,
  Spinner,
  TextField,
} from '@heroui/react'
import { EmptyState } from '@heroui-pro/react/empty-state'
import { ItemCard } from '@heroui-pro/react/item-card'
import { KPI } from '@heroui-pro/react/kpi'
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
  BenchStatus,
  EndpointConfig,
  ModelTarget,
  TestPresetId,
} from './lib/types'
import { AboutSection } from './components/AboutSection'
import { SiteHeader, type View } from './components/SiteHeader'
import { BRAND } from './lib/brand'
import { downloadLogs, type LogEntry } from './lib/log'
import { fetchModels } from './lib/models'
import {
  providerLabel,
  providerSubtype,
  resolveProvider,
  validateBaseUrl,
} from './lib/providers'
import { PROVIDER_PRESETS } from './lib/providerPresets'

function resultKey(presetId: string, modelId: string): string {
  return `${presetId}::${modelId}`
}

function statusColor(
  status: BenchStatus,
): 'accent' | 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'ok':
      return 'success'
    case 'error':
      return 'danger'
    case 'running':
      return 'warning'
    case 'pending':
      return 'default'
    default: {
      const _exhaustive: never = status
      return _exhaustive
    }
  }
}

export default function App() {
  const [config, setConfig] = useState<AppConfig>(() => defaultConfig())
  const [hydrated, setHydrated] = useState(false)
  const [results, setResults] = useState<BenchResult[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [running, setRunning] = useState(false)
  const [modelState, setModelState] = useState<
    Record<
      string,
      {
        status: 'idle' | 'loading' | 'ok' | 'error'
        models: string[]
        error: string
        fetchedAt: number
      }
    >
  >({})
  const [view, setView] = useState<View>(() =>
    typeof window !== 'undefined' && window.location.hash === '#about'
      ? 'about'
      : 'bench',
  )
  const abortRef = useRef<AbortController | null>(null)
  const fetchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    setConfig(loadConfig())
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) return
    saveConfig(config)
  }, [config, hydrated])

  useEffect(() => {
    const onHash = () => {
      setView(window.location.hash === '#about' ? 'about' : 'bench')
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const switchView = (v: View) => {
    setView(v)
    if (typeof window !== 'undefined') {
      const newHash = v === 'about' ? '#about' : ''
      if (window.location.hash !== newHash) {
        const next = newHash
          ? `${window.location.pathname}${window.location.search}${newHash}`
          : `${window.location.pathname}${window.location.search}`
        window.history.replaceState(null, '', next)
      }
    }
  }

  const endpointMap = useMemo(() => {
    const map = new Map<string, EndpointConfig>()
    for (const endpoint of config.endpoints) map.set(endpoint.id, endpoint)
    return map
  }, [config.endpoints])

  const summary = useMemo(() => {
    const ok = results.filter((row) => row.status === 'ok' && row.metrics)
    if (!ok.length) return null
    const avg = (
      pick: (metrics: NonNullable<BenchResult['metrics']>) => number | null,
    ) => {
      const values = ok
        .map((row) => pick(row.metrics!))
        .filter((value): value is number => value != null && !Number.isNaN(value))
      if (!values.length) return null
      return values.reduce((a, b) => a + b, 0) / values.length
    }
    return {
      decode: avg((metrics) => metrics.decodeTokPerSec),
      overall: avg((metrics) => metrics.overallTokPerSec),
      ttft: avg((metrics) => metrics.ttftMs),
      okCount: ok.length,
    }
  }, [results])

  const updateEndpoint = (id: string, patch: Partial<EndpointConfig>) => {
    setConfig((current) => ({
      ...current,
      endpoints: current.endpoints.map((endpoint) =>
        endpoint.id === id ? { ...endpoint, ...patch } : endpoint,
      ),
    }))
    // If URL or key changed, reset fetch state so auto-fetch re-runs.
    if ('baseUrl' in patch || 'apiKey' in patch) {
      setModelState((current) =>
        current[id]
          ? { ...current, [id]: { ...current[id], status: 'idle' } }
          : current,
      )
    }
  }

  const addFromPreset = (presetId: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.id === presetId)
    if (!preset) return
    const endpoint = newEndpoint({
      label: preset.name,
      baseUrl: preset.baseUrl,
      ...(preset.providerOverride
        ? { provider: preset.providerOverride }
        : {}),
    })
    setConfig((current) => {
      const models = preset.defaultSlug
        ? [...current.models, newModel(endpoint.id, preset.defaultSlug)]
        : current.models
      return {
        ...current,
        endpoints: [...current.endpoints, endpoint],
        models,
      }
    })
  }

  const fetchModelsFor = async (endpointId: string) => {
    const endpoint = config.endpoints.find((e) => e.id === endpointId)
    if (!endpoint) return
    setModelState((current) => ({
      ...current,
      [endpointId]: {
        status: 'loading',
        models: current[endpointId]?.models ?? [],
        error: '',
        fetchedAt: 0,
      },
    }))
    const result = await fetchModels(endpoint)
    setLogs((current) => [...current, result.log])
    setModelState((current) => ({
      ...current,
      [endpointId]: {
        status: result.errorKind === 'ok' ? 'ok' : 'error',
        models: result.models,
        error: result.error,
        fetchedAt: Date.now(),
      },
    }))
  }

  // Auto-fetch models for endpoints that have a valid URL + key and haven't
  // been fetched yet (debounced). Keeps the experience smooth without spamming.
  useEffect(() => {
    if (!hydrated) return
    for (const endpoint of config.endpoints) {
      const hasKey = endpoint.apiKey.trim().length > 0
      const validation = validateBaseUrl(endpoint.baseUrl)
      const state = modelState[endpoint.id]
      const shouldFetch =
        hasKey &&
        !validation.suspect &&
        (!state || state.status === 'idle')
      if (shouldFetch) {
        clearTimeout(fetchTimers.current[endpoint.id])
        fetchTimers.current[endpoint.id] = setTimeout(() => {
          void fetchModelsFor(endpoint.id)
        }, 900)
      }
    }
    return () => {
      for (const t of Object.values(fetchTimers.current)) clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, config.endpoints, config.endpoints.length])

  const removeEndpoint = (id: string) => {
    setConfig((current) => ({
      ...current,
      endpoints: current.endpoints.filter((endpoint) => endpoint.id !== id),
      models: current.models.filter((model) => model.endpointId !== id),
    }))
  }

  const updateModel = (id: string, patch: Partial<ModelTarget>) => {
    setConfig((current) => ({
      ...current,
      models: current.models.map((model) =>
        model.id === id ? { ...model, ...patch } : model,
      ),
    }))
  }

  const removeModel = (id: string) => {
    setConfig((current) => ({
      ...current,
      models: current.models.filter((model) => model.id !== id),
    }))
  }

  const togglePreset = (id: TestPresetId) => {
    setConfig((current) => {
      const selected = current.selectedPresets.includes(id)
      const selectedPresets = selected
        ? current.selectedPresets.filter((presetId) => presetId !== id)
        : [...current.selectedPresets, id]
      return { ...current, selectedPresets }
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
    const models = config.models.filter((model) => model.slug.trim())

    if (!presets.length || !models.length) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
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

    for (const row of initial) {
      if (controller.signal.aborted) break
      const preset = presetById(row.presetId)
      const endpoint = endpointMap.get(row.endpointId)
      if (!preset || !endpoint) continue

      setResults((current) =>
        current.map((result) =>
          result.key === row.key
            ? { ...result, status: 'running', error: undefined }
            : result,
        ),
      )

      try {
        const output = await runStreamBench({
          endpoint,
          slug: row.slug,
          preset,
          signal: controller.signal,
        })
        setLogs((current) => [...current, output.log])
        setResults((current) =>
          current.map((result) =>
            result.key === row.key
              ? {
                  ...result,
                  status: 'ok',
                  metrics: output.metrics,
                  preview: output.preview,
                }
              : result,
          ),
        )
      } catch (error) {
        if (controller.signal.aborted) break
        const message = error instanceof Error ? error.message : String(error)
        const logFromError =
          (error as { logEntry?: LogEntry })?.logEntry
        if (logFromError) {
          setLogs((current) => [...current, logFromError])
        }
        setResults((current) =>
          current.map((result) =>
            result.key === row.key
              ? { ...result, status: 'error', error: message }
              : result,
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
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `llm-speed-test-${Date.now()}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="page flex flex-col gap-6">
      <SiteHeader view={view} onView={switchView} />

      {view === 'about' ? (
        <>
          <Alert status="accent">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Your API keys never leave your browser</Alert.Title>
              <Alert.Description>
                Keys are saved only in this device&apos;s{' '}
                <strong>localStorage</strong> (key:{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
                  {BRAND.localStorageKey}
                </code>
                ). They are not sent to Netlify or any backend. When you run a
                benchmark, your browser calls the provider directly. Export JSON
                omits keys. Clearing site data or using another browser removes
                them.
              </Alert.Description>
            </Alert.Content>
          </Alert>
          <AboutSection />
        </>
      ) : (
        <>
          <Alert status="accent">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Your API keys never leave your browser</Alert.Title>
              <Alert.Description>
                Keys are saved only in this device&apos;s{' '}
                <strong>localStorage</strong> (key:{' '}
                <code className="rounded bg-surface px-1 py-0.5 font-mono text-xs">
                  {BRAND.localStorageKey}
                </code>
                ). They are not sent to Netlify or any backend. When you run a
                benchmark, your browser calls the provider directly. Export JSON
                omits keys. Clearing site data or using another browser removes
                them.
              </Alert.Description>
            </Alert.Content>
          </Alert>

      <Card>
        <Card.Header>
          <Card.Title>Endpoints</Card.Title>
          <Card.Description>
            OpenRouter, xAI/Grok, OpenAI, Anthropic, Groq, Ollama, or any
            OpenAI-compatible base URL. Provider type is detected
            automatically. Paste each provider&apos;s API key below — it stays
            in your browser only.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {config.endpoints.map((endpoint) => {
            const provider = resolveProvider(
              endpoint.baseUrl,
              endpoint.apiKey,
              endpoint.provider,
            )
            const validation = validateBaseUrl(endpoint.baseUrl)
            const ms = modelState[endpoint.id]
            const fetchStatus = ms?.status ?? 'idle'
            return (
              <div
                key={endpoint.id}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-surface/70 p-4"
              >
                <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_1.3fr_auto] md:items-end">
                  <TextField
                    aria-label="Endpoint label"
                    value={endpoint.label}
                    onChange={(value) =>
                      updateEndpoint(endpoint.id, { label: value })
                    }
                  >
                    <Label>Label</Label>
                    <Input placeholder="OpenRouter" />
                  </TextField>
                  <TextField
                    aria-label="Base URL"
                    value={endpoint.baseUrl}
                    onChange={(value) =>
                      updateEndpoint(endpoint.id, { baseUrl: value })
                    }
                  >
                    <Label>Base URL</Label>
                    <Input
                      className="font-mono text-sm"
                      placeholder="https://openrouter.ai/api/v1"
                      spellCheck={false}
                    />
                    {validation.suspect ? (
                      <Description className="text-warning">
                        ⚠ {validation.reason}
                      </Description>
                    ) : null}
                  </TextField>
                  <TextField
                    aria-label="API key"
                    type="password"
                    value={endpoint.apiKey}
                    onChange={(value) =>
                      updateEndpoint(endpoint.id, { apiKey: value })
                    }
                  >
                    <Label>API key</Label>
                    <Input placeholder="sk-… / sk-ant-…" autoComplete="off" />
                    <Description>
                      Stored locally in this browser (localStorage), not on
                      our servers.
                    </Description>
                  </TextField>
                  <Button
                    variant="ghost"
                    className="text-danger"
                    isDisabled={config.endpoints.length <= 1}
                    onPress={() => removeEndpoint(endpoint.id)}
                  >
                    Remove
                  </Button>
                </div>
                <div className="grid gap-3 border-t border-border/70 pt-3 md:grid-cols-[1fr_1.4fr_1.3fr] md:items-end">
                  <TextField
                    aria-label="CORS proxy (optional)"
                    value={endpoint.proxyUrl ?? ''}
                    onChange={(value) =>
                      updateEndpoint(endpoint.id, { proxyUrl: value })
                    }
                  >
                    <Label>CORS proxy (optional)</Label>
                    <Input
                      className="font-mono text-sm"
                      placeholder="https://your-proxy.example.com/"
                      spellCheck={false}
                    />
                    <Description>
                      If the browser blocks the stream (CORS), prefix requests
                      through your own proxy. Leave empty otherwise.
                    </Description>
                  </TextField>
                </div>
                <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-3 text-sm">
                  <Chip
                    color={
                      provider === 'unknown'
                        ? 'default'
                        : provider === 'anthropic'
                          ? 'accent'
                          : 'success'
                    }
                    variant="soft"
                    size="sm"
                  >
                    <Chip.Label>{providerLabel(provider)}</Chip.Label>
                  </Chip>
                  {provider === 'anthropic' ? (
                    <span className="text-xs text-muted">
                      {providerSubtype(provider, endpoint.baseUrl)}
                    </span>
                  ) : null}
                  <Button
                    variant="secondary"
                    isDisabled={
                      fetchStatus === 'loading' ||
                      validation.suspect ||
                      !endpoint.apiKey.trim()
                    }
                    onPress={() => fetchModelsFor(endpoint.id)}
                  >
                    {fetchStatus === 'loading' ? (
                      <>
                        <Spinner size="sm" color="current" />
                        Fetching…
                      </>
                    ) : (
                      'Fetch models'
                    )}
                  </Button>
                  {fetchStatus === 'ok' ? (
                    <span className="text-xs text-muted">
                      ✓ {ms?.models.length ?? 0} model
                      {ms?.models.length === 1 ? '' : 's'} available
                    </span>
                  ) : null}
                  {fetchStatus === 'error' ? (
                    <span className="text-xs text-danger">
                      {ms?.error}
                    </span>
                  ) : null}
                  {fetchStatus === 'idle' &&
                  endpoint.apiKey.trim() &&
                  !validation.suspect ? (
                    <span className="text-xs text-muted">
                      Auto-fetching models…
                    </span>
                  ) : null}
                </div>
              </div>
            )
          })}
        </Card.Content>
        <Card.Footer className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-foreground">
              Add provider from list
            </span>
            <select
              aria-label="Add provider from list"
              value=""
              onChange={(e) => {
                const value = e.target.value
                e.target.value = ''
                if (value) addFromPreset(value)
              }}
              className="max-w-xs rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
            >
              <option value="" disabled>
                Pick a known provider…
              </option>
              {PROVIDER_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            onPress={() =>
              setConfig((current) => ({
                ...current,
                endpoints: [...current.endpoints, newEndpoint()],
              }))
            }
          >
            Add custom URL
          </Button>
        </Card.Footer>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Model slugs</Card.Title>
          <Card.Description>
            Pair each slug with an endpoint. Run several models in one pass.
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {config.models.map((model) => (
            <div
              key={model.id}
              className="grid gap-3 rounded-2xl border border-border bg-surface/70 p-4 md:grid-cols-[1.2fr_2fr_auto] md:items-end"
            >
              <Select
                aria-label="Endpoint"
                selectedKey={model.endpointId}
                onSelectionChange={(key) => {
                  if (key == null) return
                  updateModel(model.id, { endpointId: String(key) })
                }}
              >
                <Label>Endpoint</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {config.endpoints.map((endpoint) => (
                      <ListBox.Item
                        key={endpoint.id}
                        id={endpoint.id}
                        textValue={endpoint.label}
                      >
                        {endpoint.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <TextField
                aria-label="Model slug"
                value={model.slug}
                onChange={(value) => updateModel(model.id, { slug: value })}
              >
                <Label>Slug</Label>
                <Input
                  className="font-mono text-sm"
                  placeholder="openai/gpt-4o-mini"
                  spellCheck={false}
                  list={`models-${model.endpointId}`}
                />
                <Description>
                  {(() => {
                    const fetched = modelState[model.endpointId]?.models ?? []
                    if (fetched.length) {
                      return `Pick from ${fetched.length} fetched models, or type a slug.`
                    }
                    return 'Type a slug, or fetch models for the endpoint above.'
                  })()}
                </Description>
              </TextField>
              {(() => {
                const fetched = modelState[model.endpointId]?.models ?? []
                if (!fetched.length) return null
                return (
                  <datalist id={`models-${model.endpointId}`}>
                    {fetched.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                )
              })()}
              <Button
                variant="ghost"
                className="text-danger"
                onPress={() => removeModel(model.id)}
              >
                Remove
              </Button>
            </div>
          ))}
        </Card.Content>
        <Card.Footer>
          <Button
            variant="secondary"
            onPress={() =>
              setConfig((current) => ({
                ...current,
                models: [
                  ...current.models,
                  newModel(current.endpoints[0]?.id ?? '', ''),
                ],
              }))
            }
          >
            Add slug
          </Button>
        </Card.Footer>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>Test scenarios</Card.Title>
          <Card.Description>
            Fixed prompts so latency and tokens/sec stay comparable across
            models.
          </Card.Description>
        </Card.Header>
        <Card.Content>
          <div className="grid gap-3 md:grid-cols-3">
            {TEST_PRESETS.map((preset) => {
              const active = config.selectedPresets.includes(preset.id)
              return (
                <ItemCard
                  key={preset.id}
                  variant={active ? 'secondary' : 'default'}
                  className={
                    active
                      ? 'cursor-pointer border-accent ring-2 ring-accent/25'
                      : 'cursor-pointer'
                  }
                  onClick={() => togglePreset(preset.id)}
                >
                  <ItemCard.Content>
                    <ItemCard.Title>{preset.name}</ItemCard.Title>
                    <ItemCard.Description>
                      {preset.description}
                    </ItemCard.Description>
                  </ItemCard.Content>
                  <ItemCard.Action>
                    <Chip
                      color={active ? 'accent' : 'default'}
                      variant="soft"
                      size="sm"
                    >
                      <Chip.Label>{active ? 'On' : 'Off'}</Chip.Label>
                    </Chip>
                  </ItemCard.Action>
                </ItemCard>
              )
            })}
          </div>
        </Card.Content>
        <Card.Footer className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            Metrics: TTFT, total time, decode tok/s, overall tok/s. Runs
            sequentially.
          </p>
          <div className="flex gap-2">
            {running ? (
              <Button variant="secondary" onPress={stop}>
                Stop
              </Button>
            ) : null}
            <Button
              variant="primary"
              isDisabled={
                running ||
                !config.selectedPresets.length ||
                !config.models.some((model) => model.slug.trim())
              }
              onPress={() => {
                void runAll()
              }}
            >
              {running ? (
                <>
                  <Spinner size="sm" color="current" />
                  Running…
                </>
              ) : (
                'Run benchmark'
              )}
            </Button>
          </div>
        </Card.Footer>
      </Card>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <KPI>
            <KPI.Header>
              <KPI.Title>Avg decode tok/s</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <p className="mono text-3xl font-semibold text-foreground">
                {formatTokPerSec(summary.decode)}
              </p>
            </KPI.Content>
          </KPI>
          <KPI>
            <KPI.Header>
              <KPI.Title>Avg overall tok/s</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <p className="mono text-3xl font-semibold text-foreground">
                {formatTokPerSec(summary.overall)}
              </p>
            </KPI.Content>
          </KPI>
          <KPI>
            <KPI.Header>
              <KPI.Title>Avg TTFT</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <p className="mono text-3xl font-semibold text-foreground">
                {formatMs(summary.ttft)}
              </p>
            </KPI.Content>
          </KPI>
          <KPI>
            <KPI.Header>
              <KPI.Title>Successful runs</KPI.Title>
            </KPI.Header>
            <KPI.Content>
              <KPI.Value className="mono" value={summary.okCount} />
            </KPI.Content>
          </KPI>
        </div>
      ) : null}

      <Card>
        <Card.Header className="flex flex-row items-start justify-between gap-3">
          <div>
            <Card.Title>Results</Card.Title>
            <Card.Description>
              Per-run TTFT, total latency, and tokens/sec.
            </Card.Description>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {logs.length > 0 ? (
              <span className="text-xs text-muted">
                {logs.length} log{logs.length === 1 ? '' : 's'}
              </span>
            ) : null}
            <Button
              variant="ghost"
              isDisabled={!logs.length}
              onPress={() => downloadLogs(logs)}
            >
              Download log
            </Button>
            <Button
              variant="secondary"
              isDisabled={!results.length}
              onPress={exportJson}
            >
              Export JSON
            </Button>
          </div>
        </Card.Header>
        <Card.Content>
          {!results.length ? (
            <EmptyState className="py-10">
              <EmptyState.Header>
                <EmptyState.Title>No runs yet</EmptyState.Title>
                <EmptyState.Description>
                  Configure endpoints and slugs, pick scenarios, then click Run
                  benchmark.
                </EmptyState.Description>
              </EmptyState.Header>
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border text-xs tracking-wide text-muted uppercase">
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3 font-medium">Scenario</th>
                    <th className="px-2 py-3 font-medium">Endpoint</th>
                    <th className="px-2 py-3 font-medium">Model</th>
                    <th className="mono px-2 py-3 font-medium">TTFT</th>
                    <th className="mono px-2 py-3 font-medium">Total</th>
                    <th className="mono px-2 py-3 font-medium">Decode tok/s</th>
                    <th className="mono px-2 py-3 font-medium">Overall tok/s</th>
                    <th className="mono px-2 py-3 font-medium">Out tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr
                      key={result.key}
                      className="border-b border-border/70 align-top"
                    >
                      <td className="px-2 py-3">
                        <Chip
                          color={statusColor(result.status)}
                          variant="soft"
                          size="sm"
                        >
                          <Chip.Label>{result.status}</Chip.Label>
                        </Chip>
                        {result.error ? (
                          <p className="mt-1 max-w-[14rem] text-xs whitespace-pre-wrap text-danger">
                            {result.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-2 py-3">
                        {presetById(result.presetId)?.name ?? result.presetId}
                      </td>
                      <td className="px-2 py-3">{result.endpointLabel}</td>
                      <td className="mono px-2 py-3 text-xs">{result.slug}</td>
                      <td className="mono px-2 py-3">
                        {formatMs(result.metrics?.ttftMs)}
                      </td>
                      <td className="mono px-2 py-3">
                        {formatMs(result.metrics?.totalMs)}
                      </td>
                      <td className="mono px-2 py-3 font-semibold text-accent">
                        {formatTokPerSec(result.metrics?.decodeTokPerSec)}
                      </td>
                      <td className="mono px-2 py-3">
                        {formatTokPerSec(result.metrics?.overallTokPerSec)}
                      </td>
                      <td className="mono px-2 py-3">
                        {formatTokens(result.metrics?.completionTokens)}
                        {result.metrics?.tokenSource === 'estimated' ? '≈' : ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Content>
      </Card>

      <footer className="space-y-2 text-sm text-muted">
        <p>
          <strong className="text-foreground">{BRAND.siteName}</strong> by{' '}
          {BRAND.author} · {BRAND.studio}.{' '}
          <a
            href={BRAND.siteUrl}
            className="text-accent underline-offset-4 hover:underline"
          >
            {BRAND.siteUrl.replace('https://', '')}
          </a>
        </p>
        <p>
          <strong className="text-foreground">Privacy:</strong> API keys and
          config live in your browser&apos;s localStorage only. Static hosting
          only — we never receive or store your keys.
        </p>
        <p>
          Benchmark requests go from your browser to each provider. CORS must
          allow browser calls.
        </p>
      </footer>
        </>
      )}
    </div>
  )
}
