# Schema

SQL lives in [`sql/001_speed_index.sql`](../sql/001_speed_index.sql). Apply it in the Neon SQL editor.

## `runs` (append-only fact table)

One row per contributed bench (success or classified error).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid | Default `gen_random_uuid()` |
| `created_at` | timestamptz | Server time |
| `session_id` | uuid | Anonymous client session |
| `provider_type` | text | `openai` \| `anthropic` |
| `endpoint_host` | text | Hostname only |
| `endpoint_label` | text | Optional, truncated |
| `model_slug` | text | As typed |
| `task_id` | text | `debug` \| `document` \| `coding` |
| `prompt_version` | text | SHA-256 hex of preset |
| `status` | text | `ok` \| `error` |
| `ttft_ms`, `total_ms`, `decode_tok_s`, `overall_tok_s` | float | Nullable |
| `completion_tokens`, `prompt_tokens` | int | Nullable |
| `token_source` | text | `usage` \| `estimated` \| `unknown` |
| `error_kind` | text | Class, not raw body |
| `http_status` | int | Nullable |
| `geo_country` | char(2) | CDN, not client |
| `geo_continent` | text | Derived |
| `client_tz` | text | IANA |
| `app_version` | text | |
| `schema_version` | int | `1` |

## `ingest_rate`

`ip_hmac` + hourly `window_start` + `hit_count`. HMAC is not reversible without the server secret.

## Views

`speed_index_7d` and `speed_index_30d` group by:

`model_slug, endpoint_host, task_id, geo_country, geo_continent`

Percentiles use **successful runs only** and drop outlier tok/s / TTFT. There is no view that averages all models together.

If write volume grows, replace the views with materialized views and refresh on a schedule. Do not add a “global average tok/s” rollup.
