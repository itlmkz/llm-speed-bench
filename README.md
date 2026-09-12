# ⚡ llm-speed-bench

**Live streaming-speed benchmark for every AI coding agent — tokens per second (tok/s), TTFT, and cost, measured inside your terminal.** A speedometer extension that shows — right inside your agent — how fast your model *actually* generates: TTFT (time to first token), decode tok/s, overall tok/s, tokens, and cost per response.

Stop guessing whether Claude is faster than Codex, whether GLM streams faster than Grok, or why your agent feels slow. Measure it. Run a Claude Code speed test, a Codex vs Claude speed comparison, or a per-model TTFT benchmark — against your own providers, API keys, and network path, not a third-party leaderboard.

```
 agent    model                          resp     TTFT  decode tok/s  overall tok/s  out tok     cost
 grok     xai/grok-4.1-fast                5    0.9s          74.2           45.1    2.4k   $0.004
 codex    gpt-5.2-codex                    4    1.2s          92.1           54.8    3.4k   $0.051
 opencode zai/glm-4.6                       3    0.4s         121.7           88.3    4.0k   $0.006
```

## Supported agents

| Agent | Install | Metrics |
| --- | --- | --- |
| [pi](https://github.com/earendil-works/pi-coding-agent) | extension API | ✅ TTFT · decode tok/s · overall tok/s · cost |
| [opencode](https://opencode.ai) | plugin | ✅ TTFT · decode tok/s · overall tok/s · cost |
| [MiMo Code](https://mimo.xiaomi.com) (Xiaomi) | plugin (`mimo plugin`) | ✅ TTFT · decode tok/s · overall tok/s · cost |
| [Claude Code](https://code.claude.com/docs/en/hooks) | hooks + statusline | ✅ turn tok/s · tokens · cost |
| [Codex](https://developers.openai.com/codex/) (OpenAI) | hooks | ✅ turn tok/s · tokens · cost |
| [Grok Build](https://x.ai/cli) (xAI) | hooks | ✅ turn tok/s · tokens · cost |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) (Google) | extension + hooks | ✅ turn tok/s · tokens · cost |
| [Qwen Code](https://github.com/QwenLM/qwen-code) (Alibaba) | extension + hooks | ✅ turn tok/s · tokens · cost |
| Cursor · Droid · Amp · Aider · … | on the roadmap — PRs welcome | — |

Why the difference? Agents that expose streaming events (pi, opencode-class) get the full TTFT + decode-speed treatment. Hook-based agents (Claude-style) currently only expose turn boundaries and token usage, so they report end-to-end speed — the number you actually feel.

## Quick start

**macOS / Linux** (bash + Node ≥ 18). Windows: use WSL.

```bash
git clone https://github.com/itlmkz/llm-speed-bench.git
cd llm-speed-bench
./install.sh    # auto-detects every agent on this machine and installs into all of them
```

Or install per agent:

```bash
./adapters/claude/install.sh claude    # Claude Code (hooks + statusline)
./adapters/claude/install.sh codex     # Codex — trust the hook via /hooks
./adapters/claude/install.sh grok      # Grok Build
./adapters/opencode/install.sh         # opencode
./adapters/opencode/install.sh mimo    # MiMo Code
./adapters/gemini/install.sh           # Gemini CLI
./adapters/gemini/install.sh qwen      # Qwen Code
```

In pi, Gemini CLI, and Qwen Code, `/speed` prints the per-model medians table right in the session. No dependencies beyond Node ≥ 18 (pi users: pi itself, obviously). Nothing leaves your machine — hook/plugin stats stay in `~/.cache/llm-speed-bench/`; pi stats stay in memory.

## The metrics (same definitions in every agent)

- **TTFT** — time from *request sent* to *first streamed token*. 1.2s = you stared at a spinner for 1.2 seconds.
- **decode tok/s** — `(tokens − 1) ÷ seconds after the first token`. The raw generation speed of the model.
- **overall tok/s** — `tokens ÷ total seconds`. The speed you actually feel, prefill wait included.
- **cost** — what the response cost you, when the agent reports it.

## Reading your numbers

- High TTFT + high decode = fast model behind a slow queue (cold starts, routing, long prompts).
- Low TTFT + low decode = the model is dribbling tokens. Overall tok/s is what your fingers are waiting on.
- Compare across agents: same model behind two agents can differ 2× in *felt* speed because of client-side buffering.

## How it works

```
you ──► agent ──► extension / plugin / hooks
                     │
                     ├─ turn start  (UserPromptSubmit / BeforeModel / chat.message)
                     ├─ first token (text_delta / message.part.updated)
                     └─ turn end    (Stop / AfterModel / message.completed → usage)
                            │
                            ▼
        ~/.cache/llm-speed-bench/stats.jsonl   ← one uniform JSONL for every agent
```

Every hook- and plugin-based adapter writes the same JSONL schema, so `node adapters/claude/speed-hook.mjs table` prints a cross-agent comparison of everything you've measured on this machine (pi keeps its numbers in-session — view them with `/speed`; Qwen Code/MiMo rows currently label as gemini/opencode).

## FAQ

**Does it slow my agent down?** No. Hooks run async where the agent supports it, transcripts are streamed (constant memory), and the store is a single append.

**Does it send data anywhere?** Never. It's a local file. That's the whole point.

**Which is fastest — Claude, Codex, GPT, Gemini, Grok, GLM, Kimi, Qwen?** Run the benchmark yourself; your measured medians don't lie. Providers reshuffle every month.

## License

MIT
