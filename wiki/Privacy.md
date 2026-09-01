# Privacy

API keys and authorization headers must **never** appear in Neon, in Netlify function logs, or in the downloadable request log.

## Never stored

| Item | Why |
| --- | --- |
| `apiKey` / `sk-…` / `sk-ant-…` | Credential |
| `Authorization`, `x-api-key`, `Proxy-Authorization`, cookies | Credential |
| Key prefixes or suffixes (`sk-or-v1-ab…xyz`) | Still secret material |
| Raw IP address | Identifier |
| Full URL query string / userinfo | Can embed tokens |
| Request headers (any) | Auth lives there |
| Request bodies | Could be customized later; presets are identified by `prompt_version` |
| Response / SSE bodies | Completions; sometimes error JSON with account ids |
| `proxyUrl` | May contain a secret in the path |
| Client-reported GPS or country | Spoofable; we use CDN geo instead |

There are **no columns** for any of the above. Do not add them.

## Defense in depth

1. **Capture** — `redactHeaders` / `redactUrl` / `redactDeep` as soon as a log entry is built. Header names matching `api-key`, `authorization`, `token`, `secret`, `credential` are replaced with `[redacted]` in full. No first-6 / last-4 leftovers.
2. **Download** — `downloadLogs` runs `sanitizeLogEntry` again, including the JSON dump at the bottom of the file.
3. **Ingest** — the client POSTs an allowlisted metrics object (host, slug, task, numbers). The function rejects the body if it still looks like it contains a key, then inserts named fields only.
4. **Ops** — do not `console.log` ingest bodies or headers in the function. `DATABASE_URL` is a Netlify env var, never `VITE_*`.

## What is stored when you opt in

Anonymous `session_id` (random UUID in localStorage), provider type, **hostname only**, optional label, model slug, task id, prompt hash, status, metrics, error **kind** (not the error JSON), HTTP status, country, continent, timezone, app version.

## Keys in the browser

Keys remain in `localStorage` under `llm-speed-bench:v1`. The provider still receives them on the direct browser request. We do not.

Export JSON continues to send `apiKeySet: true/false` rather than the key.
