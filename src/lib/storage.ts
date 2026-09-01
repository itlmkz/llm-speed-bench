import type { AppConfig, EndpointConfig, ModelTarget, TestPresetId } from './types'

const STORAGE_KEY = 'llm-speed-bench:v1'

function uid(): string {
  return crypto.randomUUID()
}

export function defaultConfig(): AppConfig {
  const openrouterId = uid()
  const grokId = uid()
  return {
    endpoints: [
      {
        id: openrouterId,
        label: 'OpenRouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        apiKey: '',
      },
      {
        id: grokId,
        label: 'xAI Grok',
        baseUrl: 'https://api.x.ai/v1',
        apiKey: '',
      },
    ],
    models: [
      {
        id: uid(),
        endpointId: openrouterId,
        slug: 'openai/gpt-4o-mini',
      },
      {
        id: uid(),
        endpointId: grokId,
        slug: 'grok-4-fast-non-reasoning',
      },
    ],
    selectedPresets: ['debug', 'document', 'coding'],
  }
}

export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultConfig()
    const parsed = JSON.parse(raw) as AppConfig
    if (!parsed.endpoints?.length) return defaultConfig()
    return {
      endpoints: parsed.endpoints,
      models: parsed.models ?? [],
      selectedPresets: parsed.selectedPresets?.length
        ? parsed.selectedPresets
        : (['debug', 'document'] as TestPresetId[]),
    }
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(config: AppConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
}

export function newEndpoint(partial?: Partial<EndpointConfig>): EndpointConfig {
  return {
    id: uid(),
    label: partial?.label ?? 'Custom',
    baseUrl: partial?.baseUrl ?? 'https://openrouter.ai/api/v1',
    apiKey: partial?.apiKey ?? '',
  }
}

export function newModel(endpointId: string, slug = ''): ModelTarget {
  return {
    id: uid(),
    endpointId,
    slug,
  }
}
