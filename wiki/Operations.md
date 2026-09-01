# Operations

## 1. Create a Neon project

Create a Postgres database (region close to Netlify is fine). Copy the **pooled** connection string (`DATABASE_URL`).

Do not put that URL in Vite, Git, or any `VITE_` variable.

## 2. Apply schema

Run [`sql/001_speed_index.sql`](../sql/001_speed_index.sql) in the Neon SQL editor.

## 3. Netlify env

Site settings → Environment variables (runtime, not just builds):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled URL |
| `INGEST_HMAC_SECRET` | Optional. Random 32+ bytes. If omitted, HMAC uses `DATABASE_URL` as the key |

Redeploy so functions pick up the variables.

## 4. Confirm functions

- `POST /.netlify/functions/ingest` (pretty URL `/api/ingest`)
- `GET /.netlify/functions/speed-index` (pretty URL `/api/speed-index`)

Without `DATABASE_URL`, ingest returns **503** `not_configured` and the Speed index tab stays empty. The bench still works; keys never left the browser.

## 5. What not to do

- Do not enable Netlify function logging of request bodies
- Do not add a “debug” column for headers
- Do not connect Neon MCP to this app from the browser
- Do not proxy chat completions through the function “to fix CORS” — that would put keys on our server

## CORS vs the index

Users still need a provider that allows browser calls, or their own CORS proxy. A failed CORS run can be contributed as `error_kind = cors` (availability), never as a tok/s sample.
