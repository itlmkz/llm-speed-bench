export type ProviderType = 'anthropic' | 'openai' | 'unknown'

export type UrlValidation = {
  /** false = looks like a real AI API endpoint candidate; true = flag it */
  suspect: boolean
  reason: string
}

const ANTHROPIC_HOSTS = ['api.anthropic.com']

function hostOf(url: string): string | null {
  try {
    const u = new URL(url)
    return u.hostname.toLowerCase()
  } catch {
    return null
  }
}

export function detectProvider(baseUrl: string): ProviderType {
  const host = hostOf(baseUrl)
  if (!host) return 'unknown'
  if (ANTHROPIC_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) {
    return 'anthropic'
  }
  // Anthropic-style keys are a strong secondary signal, but detection here is
  // URL-only; the bench will also fall back to Anthropic format when the key
  // prefix is sk-ant- and the host is anthropic.
  return 'openai'
}

/**
 * Flags base URLs that are unlikely to be a real AI API endpoint.
 * Conservative: only flags clear malformations, not merely uncommon hosts.
 */
export function validateBaseUrl(baseUrl: string): UrlValidation {
  const trimmed = baseUrl.trim()
  if (!trimmed) return { suspect: false, reason: '' }
  if (!/^https?:\/\//i.test(trimmed)) {
    return {
      suspect: true,
      reason: 'URL should start with http:// or https://',
    }
  }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { suspect: true, reason: 'Not a valid URL' }
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { suspect: true, reason: 'Protocol must be http or https' }
  }
  const host = parsed.hostname
  if (!host) return { suspect: true, reason: 'Missing hostname' }
  // localhost / IP are legitimate for local servers (Ollama, vLLM, LM Studio).
  const isLocal =
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    /^127\.\d+\.\d+\.\d+$/.test(host) ||
    /^192\.168\.\d+\.\d+$/.test(host) ||
    /^10\.\d+\.\d+\.\d+$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host) ||
    /^[0-9a-fA-F:]+$/.test(host) // IPv6
  if (!isLocal) {
    // Public host must have a dot (a TLD) and a recognisable suffix.
    if (!host.includes('.')) {
      return {
        suspect: true,
        reason: 'Hostname has no TLD — not a real public endpoint',
      }
    }
    const tld = host.split('.').pop() ?? ''
    if (tld.length < 2) {
      return { suspect: true, reason: 'TLD looks invalid' }
    }
  }
  // Flag obvious non-API web URLs the user likely pasted by mistake.
  const path = parsed.pathname.toLowerCase()
  if (
    path.includes('/chat/completions') ||
    path.endsWith('/models') ||
    path.endsWith('/messages')
  ) {
    // fine — these are real API paths
  } else if (
    /^\/(index\.html?|home|about|pricing|login|signup|dashboard)\/?$/.test(
      path,
    )
  ) {
    return {
      suspect: true,
      reason: 'Path looks like a marketing/login page, not an API base URL',
    }
  }
  return { suspect: false, reason: '' }
}

export function providerLabel(provider: ProviderType): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic'
    case 'openai':
      return 'OpenAI-compatible'
    case 'unknown':
      return 'Unknown'
    default: {
      const _exhaustive: never = provider
      return _exhaustive
    }
  }
}

/** Canonical base URL for the /models and chat endpoints, trailing slash removed. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, '')
}

/**
 * The /models endpoint for a given provider + base URL.
 * OpenAI-compatible: {base}/models  (or {base}/v1/models if base lacks /v1)
 * Anthropic:          {base}/v1/models  (api.anthropic.com base is /v1)
 */
export function modelsEndpointUrl(baseUrl: string, provider: ProviderType): string {
  const base = normalizeBaseUrl(baseUrl)
  if (provider === 'anthropic') {
    if (base.endsWith('/v1')) return `${base}/models`
    if (base.endsWith('/v1/models')) return base
    return `${base}/v1/models`
  }
  // OpenAI-compatible
  if (base.endsWith('/models')) return base
  if (base.endsWith('/v1')) return `${base}/models`
  return `${base}/v1/models`
}

/**
 * The chat/messages endpoint for a given provider + base URL.
 * OpenAI-compatible: {base}/chat/completions (or {base}/v1/chat/completions)
 * Anthropic:          {base}/v1/messages
 */
export function chatEndpointUrl(baseUrl: string, provider: ProviderType): string {
  const base = normalizeBaseUrl(baseUrl)
  if (provider === 'anthropic') {
    if (base.endsWith('/v1/messages')) return base
    if (base.endsWith('/v1')) return `${base}/messages`
    return `${base}/v1/messages`
  }
  if (base.endsWith('/chat/completions')) return base
  if (base.endsWith('/v1')) return `${base}/chat/completions`
  return `${base}/v1/chat/completions`
}

/** Build request headers for the /models call, per provider. */
export function authHeaders(
  apiKey: string,
  provider: ProviderType,
): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  }
  if (provider === 'anthropic') {
    if (apiKey.trim()) headers['x-api-key'] = apiKey.trim()
    headers['anthropic-version'] = '2023-06-01'
    // Enable direct browser calls (Anthropic CORS gate).
    headers['anthropic-dangerous-direct-browser-access'] = 'true'
    return headers
  }
  if (apiKey.trim()) headers.Authorization = `Bearer ${apiKey.trim()}`
  return headers
}
