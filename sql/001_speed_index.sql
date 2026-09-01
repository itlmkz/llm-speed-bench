-- LLM Speed Test — public speed index
-- NEVER add columns for API keys, Authorization, x-api-key, cookies, raw IP,
-- request headers, request bodies, response bodies, or full URLs with query.

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL,
  provider_type text NOT NULL CHECK (provider_type IN ('openai', 'anthropic')),
  endpoint_host text NOT NULL,
  endpoint_label text,
  model_slug text NOT NULL,
  task_id text NOT NULL CHECK (task_id IN ('debug', 'document', 'coding')),
  prompt_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  ttft_ms double precision,
  total_ms double precision,
  decode_tok_s double precision,
  overall_tok_s double precision,
  completion_tokens integer,
  prompt_tokens integer,
  token_source text,
  error_kind text,
  http_status integer,
  geo_country char(2),
  geo_continent text,
  client_tz text,
  app_version text,
  schema_version integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS runs_speed_dims
  ON runs (model_slug, endpoint_host, task_id, geo_country, created_at DESC);

CREATE INDEX IF NOT EXISTS runs_ok_created
  ON runs (created_at DESC)
  WHERE status = 'ok';

-- HMAC of client IP + hour window. Not the IP.
CREATE TABLE IF NOT EXISTS ingest_rate (
  ip_hmac text NOT NULL,
  window_start timestamptz NOT NULL,
  hit_count integer NOT NULL,
  PRIMARY KEY (ip_hmac, window_start)
);

CREATE OR REPLACE VIEW speed_index_7d AS
SELECT
  model_slug,
  endpoint_host,
  task_id,
  geo_country,
  geo_continent,
  count(*) FILTER (WHERE status = 'ok') AS n_ok,
  count(*) AS n_total,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms)
    FILTER (
      WHERE status = 'ok'
        AND ttft_ms IS NOT NULL
        AND ttft_ms BETWEEN 0 AND 180000
    ) AS p50_ttft_ms,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY ttft_ms)
    FILTER (
      WHERE status = 'ok'
        AND ttft_ms IS NOT NULL
        AND ttft_ms BETWEEN 0 AND 180000
    ) AS p90_ttft_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY decode_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND decode_tok_s BETWEEN 0.05 AND 4000
    ) AS p50_decode_tok_s,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY decode_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND decode_tok_s BETWEEN 0.05 AND 4000
    ) AS p90_decode_tok_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY overall_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND overall_tok_s BETWEEN 0.05 AND 4000
    ) AS p50_overall_tok_s
FROM runs
WHERE created_at > now() - interval '7 days'
GROUP BY model_slug, endpoint_host, task_id, geo_country, geo_continent;

CREATE OR REPLACE VIEW speed_index_30d AS
SELECT
  model_slug,
  endpoint_host,
  task_id,
  geo_country,
  geo_continent,
  count(*) FILTER (WHERE status = 'ok') AS n_ok,
  count(*) AS n_total,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY ttft_ms)
    FILTER (
      WHERE status = 'ok'
        AND ttft_ms IS NOT NULL
        AND ttft_ms BETWEEN 0 AND 180000
    ) AS p50_ttft_ms,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY ttft_ms)
    FILTER (
      WHERE status = 'ok'
        AND ttft_ms IS NOT NULL
        AND ttft_ms BETWEEN 0 AND 180000
    ) AS p90_ttft_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY decode_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND decode_tok_s BETWEEN 0.05 AND 4000
    ) AS p50_decode_tok_s,
  percentile_cont(0.9) WITHIN GROUP (ORDER BY decode_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND decode_tok_s BETWEEN 0.05 AND 4000
    ) AS p90_decode_tok_s,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY overall_tok_s)
    FILTER (
      WHERE status = 'ok'
        AND overall_tok_s BETWEEN 0.05 AND 4000
    ) AS p50_overall_tok_s
FROM runs
WHERE created_at > now() - interval '30 days'
GROUP BY model_slug, endpoint_host, task_id, geo_country, geo_continent;
