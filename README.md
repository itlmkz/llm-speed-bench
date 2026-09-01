# LLM Speed Test

**By [Manuel Milliery](https://llm-speed-test.milliery.com) · Milliery**

A browser tool for measuring **real streaming speed** from OpenAI-compatible and Anthropic APIs. No cherry-picked slide-deck numbers.

**Live:** https://llm-speed-test.milliery.com  
**Also:** https://llm-speed-bench.netlify.app (Netlify default URL until DNS is pointed)

Add an endpoint, choose a model, pick a scenario, and hit **Run benchmark**.

Your API keys stay in your browser. See [Privacy & API keys](#privacy--api-keys). Completions go straight to the provider. An optional, opt-in **Speed Index** can store **anonymized metrics only** (never keys or auth headers). Design: [wiki/Home.md](wiki/Home.md).

## About

Every week someone announces the “fastest model yet.” Tokens per second on a benchmark nobody actually runs, latency on a prompt nobody uses. The numbers almost never match what you see when you ship.

I got tired of guessing. So I built this: paste your key, point it at any OpenAI-compatible or Anthropic endpoint, and watch the real stream — time to first token, total time, tokens per second. Your numbers, your region, your workload.

LLM Speed Test runs three fixed scenarios (a bug triage, a doc summary, a small coding task) so you can compare models fairly. Keys stay in your browser and requests go straight to the provider. Export the JSON and send it to whoever asked “but how fast is it, really?”

— **Manuel Milliery**, Milliery

## Privacy & API keys

This app keeps **API keys in your browser**. We do not store them in Neon, in Netlify logs, or in the downloadable request log.

| What | Where |
| --- | --- |
| **API keys** | Your browser’s `localStorage`, key `llm-speed-bench:v1`, inside each endpoint’s `apiKey` field |
| **Who can read them** | Only scripts on this origin in your browser (you, on this device) |
| **Who cannot** | Neon, Netlify function logs, other users, downloadable logs |
| **When keys are used** | On “Run benchmark”, your browser sends them **directly to the provider** as `Authorization` / `x-api-key` |
| **Export JSON** | Keys are **not** included — only `apiKeySet: true/false` |
| **Downloadable log** | Headers and key-like strings are replaced with `[redacted]` (no prefix/suffix leftovers) |
| **Speed Index (opt-in)** | Model, provider **host**, task, country, and timing numbers only. See [wiki/Privacy.md](wiki/Privacy.md) |
| **If you switch browser / clear site data** | Keys are gone until you paste them again |

The live site explains this in the UI banner and next to each API key field.

## Speed Index

The old “average overall tok/s” across every model in a run was meaningless. The bench now compares **per model on each provider**. The public index (wiki: [Speed Index](wiki/Speed-Index.md)) uses the same idea and also splits by **task** and **geography**.

Neon holds the opt-in fact table. The browser never gets `DATABASE_URL`. Setup: [wiki/Operations.md](wiki/Operations.md).

## Provider support & model discovery

The bench reads the base URL and picks the right request format:

- **Anthropic** (`api.anthropic.com`) → native Messages API (`/v1/messages`, `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`), SSE events (`message_start`, `content_block_delta`, `message_delta`).
- **OpenAI-compatible** (everything else: OpenRouter, xAI, OpenAI, Groq, Ollama, vLLM, …) → `/chat/completions` with `Authorization: Bearer`.
- A `sk-ant-` key prefix is treated as Anthropic even behind a proxy.

**URL validation:** base URLs that don’t look like a real AI API endpoint (non-http(s), no TLD, marketing/login paths) are flagged inline.

**Automatic model fetcher:** each endpoint has a **Fetch models** button. It calls `/models` with your key and fills the slug suggestions for you. You can still type your own slug. Models are fetched automatically once a valid URL and key are present.

**Failure diagnostics:** if fetching models times out, returns a 404, or fails for another reason, you get a plain-language explanation (bad key, bad URL, missing `/models`, CORS, or timeout). The request and response are also saved in the downloadable log.

## Metrics

| Metric | Meaning |
| --- | --- |
| **TTFT** | Time from request send to first streamed token |
| **Total** | Time from request send until the stream finishes |
| **Decode tok/s** | `(completion_tokens − 1) / (total − TTFT)` — generation speed after the first token |
| **Overall tok/s** | `completion_tokens / total` — end-to-end including prefill wait |

When the provider reports usage in the stream (`stream_options.include_usage`), we use it. Otherwise, output tokens are estimated from the text.

## Test scenarios

1. **Debug triage** — short bug report → concise fix advice  
2. **Document analysis** — longer context → priorities / risks / actions  
3. **Coding task** — small TypeScript utility  

Turn on the scenarios you want, then run the test.

## Quick start

HeroUI Pro needs a license token so the package can download Pro artifacts on install:

```bash
export HEROUI_AUTH_TOKEN=your-token   # from https://heroui.pro/dashboard
npm install
npm run dev
```

Open the local URL, paste your keys, check the model slugs, and click **Run benchmark**.

```bash
npm run build
npm run preview
```

## Deploy (static)

Any static host works. Example Netlify:

```toml
# netlify.toml
[build]
  command = "npm run build"
  publish = "dist"
```

GitHub Pages, Cloudflare Pages, and Vercel work too. Publish `dist`.

**Live demo:** https://llm-speed-test.milliery.com

### Custom domain (milliery.com)

Point a CNAME record for `llm-speed-test` to your Netlify site URL. Then add the domain in Netlify → Domain management → Add domain alias.

For Netlify builds from Git, set `HEROUI_AUTH_TOKEN` in the site’s build environment (Site settings → Environment variables, scope: Builds).

## Related tools

There are other good tools, mostly focused on the command line or a different kind of benchmark:

- [llm-latency-bench](https://pypi.org/project/llm-latency-bench/) — rigorous CLI percentiles (TTFT, ITL, cost)
- [llm-gateway-bench](https://github.com/mnbplus/llm-gateway-bench) — CLI for gateways/providers
- [llm-latency-checker](https://github.com/skcript/llm-latency-checker) — client dashboard with hour-of-day charts
- [Artificial Analysis](https://artificialanalysis.ai/) — published industry speed tables (not your live keys)

This project is a **portable, click-to-run** speed test for multiple URLs and model slugs, with the same prompts each time. It is easy to fork and share.

## CORS note

The browser calls APIs directly. Some providers block browser requests with strict CORS rules. Use a provider that allows browser calls (OpenRouter does), or put your own proxy in front of the endpoint.

## License

MIT
