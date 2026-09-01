export type ErrorKind =
  | 'none'
  | 'cors'
  | 'http_401'
  | 'http_403'
  | 'http_403_geo'
  | 'http_404'
  | 'http_429'
  | 'http_other'
  | 'timeout'
  | 'abort'
  | 'network'
  | 'unknown'

const GEO_DENY =
  /location|region|geograph|not (?:available|enabled|supported) in|country|territory|where you are/i

export function classifyHttpError(status: number, body: string): ErrorKind {
  if (status === 401) return 'http_401'
  if (status === 404) return 'http_404'
  if (status === 429) return 'http_429'
  if (status === 403) return GEO_DENY.test(body) ? 'http_403_geo' : 'http_403'
  if (status >= 400) return 'http_other'
  return 'none'
}

export function classifyBenchError(args: {
  message: string
  httpStatus?: number | null
  aborted?: boolean
  cors?: boolean
}): ErrorKind {
  if (args.aborted) return 'abort'
  if (args.cors) return 'cors'
  const status = args.httpStatus
  if (status && status >= 400) {
    return classifyHttpError(status, args.message)
  }
  if (/timeout|timed out|took longer/i.test(args.message)) return 'timeout'
  if (/couldn't reach|failed to fetch|network/i.test(args.message)) {
    return 'network'
  }
  return 'unknown'
}

export function friendlyHttpError(
  status: number,
  url: string,
  body: string,
): string {
  const kind = classifyHttpError(status, body)
  switch (kind) {
    case 'http_403_geo':
      return 'Sorry, error 403: in your location this model is not enabled.'
    case 'http_401':
      return `The provider rejected the key (HTTP 401) at ${url}.`
    case 'http_403':
      return `The provider forbade this request (HTTP 403) at ${url}.`
    case 'http_404':
      return `The provider returned HTTP 404 at ${url}. Check the base URL and model slug.`
    case 'http_429':
      return `The provider rate-limited this request (HTTP 429) at ${url}.`
    case 'http_other':
      return `The provider returned HTTP ${status} at ${url}: ${body.slice(0, 400) || '(no response body)'}`
    case 'none':
    case 'cors':
    case 'timeout':
    case 'abort':
    case 'network':
    case 'unknown':
      return `The provider returned HTTP ${status} at ${url}: ${body.slice(0, 400) || '(no response body)'}`
    default: {
      const _exhaustive: never = kind
      return _exhaustive
    }
  }
}
