# Speed Index

A public index of **actual** streaming speed: how fast model **M** is, from country **C**, on task **T**, through provider host **H**.

It is not a single “average tokens/sec” for the internet. Blending Grok with Haiku, or OpenRouter with a local Ollama box, is a lie with extra steps. The UI and the database use the same grain.

## What we are indexing

| Dimension | Why |
| --- | --- |
| **Model** (`model_slug`) | Speed is a property of a specific model id, not a family nickname |
| **Provider host** (`endpoint_host`) | The same slug on `openrouter.ai` vs `api.x.ai` is a different path |
| **Task** (`task_id`) | Debug / document / coding — prefill vs decode mix differs |
| **Geography** (`geo_country`, `geo_continent`) | TTFT is dominated by the path from the user to the provider |

Prompt text is not stored. We store `prompt_version`, a SHA-256 of the built-in preset, so a future wording change does not silently mix series.

## Architecture

```
Browser                    Netlify Function                 Neon
───────                    ────────────────                 ────
1. Stream to provider  ─►  (never sees the API key)
2. Measure TTFT / tok/s
3. If user opted in ──► POST /api/ingest
                         • reject secrets
                         • allowlist fields
                         • geo from CDN headers
                         • HMAC of IP for rate limit only
                         • INSERT into runs
4. GET /api/speed-index ◄── SELECT from speed_index_7d/30d
   (grouped; no raw dumps)
```

The Vite app never receives `DATABASE_URL`. Completions are not proxied through us. We are not a gateway.

### Why a function in front of Neon

A browser talking to Postgres would leak the database URL and invite write spam. One ingest function is the only writer. It strips secrets **again** even though the client already did.

## Local UI (this run)

After a benchmark, **This run, by model** lists each **provider × model**.

- Decode tok/s, overall tok/s, and TTFT are **means across the scenarios you ran for that pair**.
- Different models are never averaged together.
- Overall tok/s is useful **per model** (it includes waiting for the first token). It is useless as a site-wide KPI.

The public index goes one step further and also splits by **task** and **country**.

## Public index metrics

For each `(model_slug, endpoint_host, task_id, geo_country)` in a window (7d / 30d):

| Metric | Definition |
| --- | --- |
| **p50 / p90 decode tok/s** | Percentile of successful runs only, after dropping insane outliers (`0.05–4000` tok/s) |
| **p50 overall tok/s** | Same, for end-to-end including TTFT |
| **p50 / p90 TTFT** | Successful runs, TTFT `0–180s` |
| **n_ok / n_total** | Availability vs speed. CORS and HTTP 403 are availability, not slowness |
| **OK rate** | `n_ok / n_total` — shown separately so a geo-blocked model is not “slow” |

Rows with `n_ok < 5` are labeled **early** in the UI. Treat them as directional.

Two indexes, not one:

1. **Speed** — percentiles on `status = 'ok'`
2. **Availability** — error kinds (`cors`, `http_403_geo`, `http_404`, …) by country

Error rows are stored so we can chart “this model is disabled in this country.” They never enter tok/s percentiles.

## Geography (privacy-preserving)

1. Prefer **CDN country** on the ingest request (`x-country`, Netlify / Cloudflare / CloudFront). That is the user’s network location relative to the provider, which is what TTFT cares about.
2. Map country → continent in the function. Store `geo_country` (ISO 3166-1 alpha-2) and `geo_continent`. **Never lat/lng.**
3. Store IANA `client_tz` as a coarse check, not as a location of record.
4. **Do not trust a client-supplied country.**
5. **Do not store IP.** For rate limiting only, HMAC-SHA256(IP, server secret) goes to `ingest_rate` with an hourly window. The secret never hits Neon as plaintext IP.

## Anti-abuse

- Opt-in only (localStorage `llm-speed-bench:contribute-index:v1`)
- Allowlist JSON; extra keys ignored by virtue of reading named fields only
- Reject the whole body if it still matches key-like patterns (`sk-…`, `Bearer …`, `"authorization":`)
- Drop impossible metrics at ingest
- ~80 posts per HMAC per hour
- Public read API returns **aggregates**, cap 200 rows, no session ids

## What this is not

- Not a substitute for [Artificial Analysis](https://artificialanalysis.ai/) lab benches
- Not a store of completions or prompts
- Not a proxy that would see your keys
- Not a global average tokens/sec
