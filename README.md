# LLM Speed Bench

Browser tool to measure **real streaming speed** of OpenAI-compatible LLM APIs.

Add one or more base URLs (OpenRouter, xAI/Grok, OpenAI, Groq, Ollama, …), attach model slugs, pick scenarios, click **Run benchmark**.

API keys stay in your browser (`localStorage`). There is no backend.

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

```bash
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
