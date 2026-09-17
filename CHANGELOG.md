# Changelog

## v0.2.0

**llm-speed-bench becomes a cross-agent speed counter** — from a pi-only extension to one metrics engine behind eight coding agents.

Added
- `core/speed-core.mjs` — shared crash-safe metrics engine (TTFT, decode tok/s, overall tok/s, cost) writing one uniform `~/.cache/llm-speed-bench/stats.jsonl` store (atomic turn-marker claims, bounded tail reads, rotation, orphan pruning).
- `adapters/opencode/speed-counter.plugin.ts` — opencode + MiMo Code plugin with true streaming deltas (TTFT + decode tok/s), written against the real opencode SDK event shapes.
- `adapters/claude/` — one Claude-style hook script covering **Claude Code**, **Codex**, and **Grok Build** (they share the hook contract), with streaming readline transcript mining, turn-aware accumulation for agentic turns, Codex `last_token_usage` deltas, plus a Claude Code statusline.
- `adapters/gemini/` — Gemini CLI + Qwen Code extension (manifest, `BeforeModel`/`AfterModel` hooks, `/speed` command).
- `install.sh` — detects every installed agent and wires them all; safe to run via `curl … | bash`.

Fixed
- Gemini hook config now uses the required top-level `hooks` object — previously rejected on every run, so the extension measured nothing.
- Gemini/Qwen install no longer hangs on the interactive `gemini extensions link` trust prompt; extensions are auto-discovered from `~/.{gemini,qwen}/extensions/`.
- Qwen install is complete (6/6 files) — `cp` without `-R` silently skipped `hooks/`, `commands/`, and `core/`.
- Codex hooks are merged into `~/.codex/hooks.json` (the `hooks/` directory was never read by Codex).
- Idempotent installers (`rm -rf` before copy) — reruns previously nested directories and never refreshed installed files.

Changed
- README: support matrix, quick start, metric definitions, FAQ.

## v0.1.0

- pi extension: live TTFT stopwatch, per-model decode/overall tok/s medians, `/speed` command, speedometer status line.
