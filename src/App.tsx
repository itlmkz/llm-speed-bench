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
      PLACEHOLDER_REST
    </div>
  )
}
