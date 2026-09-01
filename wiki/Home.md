# LLM Speed Test wiki

**By Manuel Milliery · Milliery**

This wiki is the source of truth for how speed is measured, stored, and published.

## Pages

- [Speed Index](Speed-Index.md) — architecture of the crowdsourced index (by geography, model, and task)
- [Privacy](Privacy.md) — what is never stored (API keys, authorization headers, raw logs)
- [Schema](Schema.md) — Neon tables and views
- [Operations](Operations.md) — how to connect Neon and Netlify

## Product in one line

The bench still talks **directly** from your browser to the provider. Neon is an **optional, opt-in** store of **sanitized metrics** so we can publish actual speed — not a blended “average tok/s” across unrelated models.

## Live

- App: https://llm-speed-test.milliery.com
- Code: https://github.com/itlmkz/llm-speed-bench
