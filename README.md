# LLM Speed Test

**By [Manuel Milliery](https://llm-speed-test.milliery.com) · Milliery**

Browser tool to measure **real streaming speed** of OpenAI-compatible LLM APIs — not the cherry-picked numbers on a provider slide deck.

**Live:** https://llm-speed-test.milliery.com  
**Also:** https://llm-speed-bench.netlify.app (Netlify default URL until DNS is pointed)

Add one or more base URLs (OpenRouter, xAI/Grok, OpenAI, Groq, Ollama, …), attach model slugs, pick scenarios, click **Run benchmark**.

API keys stay in your browser only — see [Privacy & API keys](#privacy--api-keys) below. There is no backend.

## About

Every week a provider publishes a new “fastest model” headline — tokens per second on a synthetic benchmark, latency on a toy prompt, numbers that rarely match production.

I built this because I was tired of the gap between those claims and reality. When you pick a model and a provider, you deserve to know how fast it actually streams with **your** API key, **your** region, and **your** workload.

LLM Speed Test runs fixed scenarios (debug triage, document analysis, coding) and reports TTFT, total latency, and decode tokens per second from real streaming responses. Export JSON and share when someone asks “how fast is it, really?”

— **Manuel Milliery**, Milliery

## Privacy & API keys

This app is **client-only**. We do not operate a server that receives or stores your API keys.

| What | Where |
| --- | --- |
| **API keys** | Your browser’s `localStorage`, key `llm-speed-bench:v1`, inside each endpoint’s `apiKey` field |
| **Who can read them** | Only scripts on this origin in your browser (you, on this device) |
| **Who cannot** | Netlify (static hosting only), this repo’s authors, other users |
| **When keys are used** | On “Run benchmark”, your browser sends them directly to the provider (e.g. OpenRouter) as `Authorization: Bearer …` |
| **Export JSON** | Keys are **not** included — only `apiKeySet: true/false` |
| **If you switch browser / clear site data** | Keys are gone until you paste them again |

The live site explains this in the UI banner and next to each API key field.

## Provider support & model discovery

The bench detects the provider from the base URL and uses the right wire format automatically:

- **Anthropic** (`api.anthropic.com`) → native Messages API (`/v1/messages`, `x-api-key`, `anthropic-version`, `anthropic-dangerous-direct-browser-access`), SSE events (`message_start`, `content_block_delta`, `message_delta`).
- **OpenAI-compatible** (everything else: OpenRouter, xAI, OpenAI, Groq, Ollama, vLLM, …) → `/chat/completions` with `Authorization: Bearer`.
- A `sk-ant-` key prefix is treated as Anthropic even behind a proxy.

**URL validation:** base URLs that don’t look like a real AI API endpoint (non-http(s), no TLD, marketing/login paths) are flagged inline.

**Automatic model fetcher:** each endpoint has a **Fetch models** button that calls the provider’s `/models` endpoint with your key and lists available slugs. The slug field becomes a combobox — pick from fetched models or type your own. Models auto-fetch once a valid URL + key are present.

**Failure diagnostics:** if the model fetch times out, 404s, or errors, a plain-language message explains what’s wrong (wrong key, wrong URL, no `/models` endpoint, CORS, timeout) and the full request/response is added to the downloadable log.

## Metrics

| Metric | Meaning |
| --- | --- |
| **TTFT** | Time from request send to first streamed token |
| **Total** | Time from request send until the stream finishes |
| **Decode tok/s** | `(completion_tokens − 1) / (total − TTFT)` — generation speed after the first token |
| **Overall tok/s** | `completion_tokens / total` — end-to-end including prefill wait |

Token counts prefer provider `usage` from the stream (`stream_options.include_usage`). If missing, output tokens are estimated from the text.

## Test scenarios

1. **Debug triage** — short bug report → concise fix advice  
2. **Document analysis** — longer context → priorities / risks / actions  
3. **Coding task** — small TypeScript utility  

Toggle any combination, then run.

## Quick start

HeroUI Pro needs a license token so the package can download Pro artifacts on install:

```bash
export HEROUI_AUTH_TOKEN=your-token   # from https://heroui.pro/dashboard
npm install
npm run dev
```

Open the local URL, paste API keys, edit slugs, click **Run benchmark**.

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

Or GitHub Pages / Cloudflare Pages / Vercel — publish `dist`.

**Live demo:** https://llm-speed-test.milliery.com

### Custom domain (milliery.com)

Point a CNAME record for `llm-speed-test` to your Netlify site URL, then add the domain in Netlify → Domain management → Add domain alias.

For Netlify builds from Git, set `HEROUI_AUTH_TOKEN` in the site’s build environment (Site settings → Environment variables, scope: Builds).

## Related tools

Existing options (mostly CLI or different focus):

- [llm-latency-bench](https://pypi.org/project/llm-latency-bench/) — rigorous CLI percentiles (TTFT, ITL, cost)
- [llm-gateway-bench](https://github.com/mnbplus/llm-gateway-bench) — CLI for gateways/providers
- [llm-latency-checker](https://github.com/skcript/llm-latency-checker) — client dashboard with hour-of-day charts
- [Artificial Analysis](https://artificialanalysis.ai/) — published industry speed tables (not your live keys)

This project is a **portable, click-to-run** multi-URL / multi-slug speed bench with fixed scenario prompts — easy to fork and share.

## CORS note

The browser calls APIs directly. Providers that block browser origins (strict CORS) will fail here; use a provider that allows browser access (OpenRouter does) or run behind your own proxy.

## License

MIT
