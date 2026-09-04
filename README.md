# pi-LLM-speed-test-extension

**A live streaming-speed readout for [pi](https://github.com/earendil-works/pi-coding-agent).** While your agent streams a response, the footer becomes a speedometer — and when the run settles, `/speed` gives you the real numbers: time-to-first-token, decode speed, and end-to-end throughput, per model, for the session.

This is not a web page that benchmarks someone else's machine. It measures **your** providers, **your** API keys, from **your** network path — the exact path pi already uses when it talks to your model.

## Ontology: what "speed" means for a streamed LLM response

Every streamed response has three phases, and each one feels different to a human waiting at a terminal:

| Phase | Metric | What you feel |
| --- | --- | --- |
| **Prefill / wait** | **TTFT** — time from request sent to first streamed token | You staring at nothing. Queueing + prompt processing + first-byte travel. |
| **Generation** | **decode tok/s** — `(tokens − 1) ÷ seconds after first token` | The raw generation speed of the model, once tokens are flowing. |
| **Whole call** | **overall tok/s** — `tokens ÷ total seconds` | The speed you actually experience, including the prefill wait. |

Two numbers that look alike are not the same:

- **decode tok/s** ignores the prefill wait. It tells you how fast the model can *produce*.
- **overall tok/s** includes the wait. It tells you how fast the call *felt*.

A model can decode at 120 tok/s and still feel slow if it sat in prefill for 6 seconds on a short prompt. Both numbers are in the footer and in `/speed`, because they answer different questions.

Token counts prefer provider `usage` from the completed message (authoritative). When a provider does not report usage, the live delta count is the fallback.

## Topology: why it lives inside pi

| | Web benchmark (Artificial Analysis, iamspeed-style sites) | This extension |
| --- | --- | --- |
| Vantage point | Their servers, their region | **Your machine, your network path** |
| Keys / providers | Bring-your-own, or a fixed public set | **Your pi config — already there** |
| CORS walls | Strict providers fail in the browser | **None — runs in Node** |
| When you check it | When you remember to open a tab | **Every response, in the footer** |
| History | Dashboard you must visit | **Session stats via `/speed`** |

Geography is the biggest term in the latency budget — a user far from an inference region pays hundreds of milliseconds before any model runs. Published leaderboards cannot represent your seat. This extension measures the seat you actually sit in.

## Speedometer

While a response streams, the footer shows a live readout. The icon reacts to live decode speed:

| decode tok/s | Icon |
| --- | --- |
| < 5 | 🐌 |
| < 15 | 🐢 |
| < 30 | 🚶 |
| < 60 | 🚴 |
| < 120 | 🏎️ |
| ≥ 120 | 🚀 |

While you wait for the first token (prefill), the icon is a rolling die with a live TTFT countdown: `⚄ TTFT 2.3s…`. When the run settles, the animal that earned it stays with the final numbers:

```
🏎️ claude-opus-4-6: 890 tok · TTFT 812ms · decode 61.3 tok/s · overall 58.1 tok/s
```

## Install

### Global (all sessions)

```bash
pi install git:github.com/itlmkz/pi-LLM-speed-test-extension
```

or clone this repo and copy the extension into your agent extension directory:

```bash
cp speed-counter.ts ~/.pi/agent/extensions/
```

Then `/reload` in a running session (or restart pi). The extension is auto-discovered from `~/.pi/agent/extensions/`.

### Project-local

```bash
mkdir -p .pi/extensions && cp speed-counter.ts .pi/extensions/
```

Project-local extensions load once the project is trusted.

## Usage

Nothing to configure. It starts measuring the next assistant response.

| Command | Effect |
| --- | --- |
| `/speed` | Show the session table above the editor: per-model median TTFT, decode tok/s, overall tok/s, output tokens, cost |
| `/speed clear` | Reset session stats |
| `/speed off` | Hide the footer readout (stops measuring display) |
| `/speed on` | Re-enable |

The `/speed` table includes a plain-words legend under the columns so the metrics stay legible at a glance:

```
 Speed counter — this session (per-model medians)
 model                          resp      TTFT  decode tok/s  overall tok/s  out tok      cost
 glm-5.3                          12      6.6s          47.2            6.2     5.2k     $0.04
 claude-opus-4-6                   3     812ms          61.3           58.1      890     $0.35
 ─────────────────────────────────────────────────────────────────────────────────────────
 TTFT · time from request sent to first streamed token (e.g. 1.2s = you stared at nothing for 1.2s)
 decode tok/s · (tokens−1) ÷ seconds AFTER first token — raw generation speed of the model
 overall tok/s · tokens ÷ TOTAL seconds — the speed you actually feel (includes prefill wait)
 out tok · total output tokens this session · 15 responses · $0.39 spent
```

The widget clears automatically when you send your next prompt.

## Why measure from your own seat?

Most published "which model is fastest" numbers come from datacenter vantage points in a few regions, using synthetic prompts. Real answers to the real weekly decision — *which provider and model should I route my coding work through this week* — depend on where you are, what your machine does, and which keys you already hold. The only measurement that answers that question is one taken from your own seat, running real work. That is what this extension does, and it costs nothing to run: it piggybacks on responses pi already makes.

## License

MIT
