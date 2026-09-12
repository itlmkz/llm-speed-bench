#!/usr/bin/env node
/**
 * speed-hook.mjs — llm-speed-bench adapter for Claude Code, Codex, and Grok Build.
 *
 * All three agents share the Claude-style hook contract:
 *   - one JSON object on stdin per hook invocation
 *   - `hook_event_name`, `session_id`, `transcript_path` fields
 *
 * Wired via:
 *   Claude Code  ~/.claude/settings.json   (hooks.UserPromptSubmit / hooks.Stop)
 *   Codex        ~/.codex/hooks.json        (same event names; trust via /hooks)
 *   Grok Build   ~/.grok/hooks/*.json       (same event names)
 *
 * Metrics: turn duration + output tokens + overall tok/s + cost, mined from
 * the agent transcript at Stop time (streamed with readline — constant memory
 * even for giant transcripts). Streaming deltas are not exposed by these hook
 * APIs, so TTFT is measured by the opencode-class plugin and pi extension.
 *
 * CLI: `node speed-hook.mjs table [sessionId]` prints the stats table.
 */

import { existsSync, createReadStream, readFileSync } from "node:fs";
import * as readline from "node:readline";
import { recordStart, takeStart, computeStat, appendStat, renderTable, readStats } from "../../core/speed-core.mjs";

// --- identify which agent invoked us -------------------------------------
function detectAgent(env, input, transcriptHint) {
  if (CLI_AGENT) return CLI_AGENT; // explicit --agent flag (authoritative)
  if (transcriptHint === "claude") return "claude"; // transcript sniffing fallback
  if (transcriptHint === "codex") return "codex";
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE) return "claude";
  if (env.CODEX_HOME || env.CODEX_SANDBOX) return "codex";
  if (env.GROK_PLUGIN_ROOT) return "grok";
  if (input.agent) return String(input.agent);
  return "unknown";
}

// --- transcript mining (streaming, turn-aware, cumulative-safe) -----------
/**
 * Walk a JSONL transcript with readline and return
 * { outputTokens, inputTokens, costUsd, model, hint, lastEntryTs } for the
 * LAST turn, or null when nothing countable is found.
 */
async function mineTranscript(path) {
  if (!path || !existsSync(path)) return null;
  let out = null; // accumulated usage for the current turn
  let model = "";
  let hint = "";
  let lastEntryTs = 0;
  const rl = readline.createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; } // torn writes / bad encodings

    const ts = Date.parse(entry?.timestamp ?? "");
    if (Number.isFinite(ts)) lastEntryTs = ts;

    // A genuine user prompt starts a new turn → reset accumulation.
    // Tool results also arrive as type:"user" but carry an array content with
    // tool_result parts — those are mid-turn and must NOT reset.
    if (entry?.type === "user") {
      const c = entry?.message?.content;
      const isToolResult = Array.isArray(c) && c.some?.((p) => p?.type === "tool_result");
      if (!isToolResult) out = null;
    }

    const acc = (hint0, tok, inp, cost) => {
      const base = out?.hint === hint0 ? out : { outputTokens: 0, inputTokens: 0, costUsd: 0 };
      out = {
        outputTokens: base.outputTokens + tok,
        inputTokens: base.inputTokens + inp,
        costUsd: base.costUsd + cost,
        hint: hint0,
      };
    };

    // Claude Code: {type:"assistant", message:{model, usage:{output_tokens,…}}, costUSD}
    const usage = entry?.message?.usage ?? entry?.usage ?? null;
    if (usage && (usage.output_tokens ?? usage.outputTokens ?? 0) > 0) {
      hint = "claude";
      acc("claude",
        usage.output_tokens ?? usage.outputTokens,
        usage.input_tokens ?? usage.inputTokens ?? 0,
        entry?.costUSD ?? usage.cost_usd ?? usage.costUsd ?? 0);
    }
    // Codex rollouts: {type:"event_msg", payload:{type:"token_count", info:{…}}}
    // (older/simplified variants: {type:"token_count", info:{…}})
    const cinfo = entry?.payload?.info ?? entry?.info ?? entry?.token_count?.info;
    const isTokenCount =
      entry?.type === "token_count" || entry?.payload?.type === "token_count" ||
      (entry?.type === "event_msg" && entry?.payload?.type === "token_count");
    if (cinfo && isTokenCount) {
      const last = cinfo.last_token_usage; // per-turn delta — NOT cumulative
      const total = cinfo.total_token_usage; // cumulative across the session
      const src = last && (last.output_tokens ?? 0) > 0 ? last : total;
      if (src && (src.output_tokens ?? 0) > 0) {
        hint = "codex";
        acc("codex", src.output_tokens, src.input_tokens ?? 0, src.cost_usd ?? src.costUsd ?? 0);
      }
    }
    // Grok Build / Gemini-style: usageMetadata.candidatesTokenCount
    const um = entry?.usageMetadata ?? entry?.response?.usageMetadata;
    if (um && (um.candidatesTokenCount ?? 0) > 0) {
      hint = "grok";
      acc("grok", um.candidatesTokenCount, um.promptTokenCount ?? 0, 0);
    }
    const m = entry?.message?.model ?? entry?.model;
    if (m) model = m;
  }
  if (!out && !model) return null;
  return { ...out, model, hint, lastEntryTs };
}

// --- main -------------------------------------------------------------------
const CLI_AGENT = (() => {
  const i = process.argv.indexOf("--agent");
  return i > 0 ? process.argv[i + 1] : "";
})();

async function main() {
  const arg = process.argv[2];

  // CLI mode: `node speed-hook.mjs table [sessionId]`
  if (arg === "table") {
    const id = process.argv[3];
    const stats = readStats(400).filter((s) => !id || s.session === id);
    process.stdout.write(renderTable(stats) + "\n");
    return;
  }

  // Hook mode: one JSON payload on stdin
  let input = {};
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // not JSON — nothing to do
  }

  const event = input.hook_event_name || "";
  const sessionId = input.session_id || "unknown";
  const agent = detectAgent(process.env, input);

  if (event === "UserPromptSubmit" || event === "BeforeAgent" || event === "SessionStart") {
    if (event === "SessionStart" && !input.prompt) return; // resume/compact, not a turn kickoff
    recordStart(sessionId, { agent, model: input.model || "" });
    return;
  }

  if (event === "Stop" || event === "AfterAgent" || event === "SessionEnd") {
    // Mine first, claim second: a failed mine must not destroy the marker.
    const mined = await mineTranscript(input.transcript_path);
    if (!mined || !mined.outputTokens) return; // nothing countable
    const start = takeStart(sessionId);
    if (!start) return; // no matching turn start

    // Race guard: a marker older than the transcript's own last activity
    // belongs to a superseded prompt, not this Stop.
    if (mined.lastEntryTs && mined.lastEntryTs < start.t0) return;

    appendStat(
      computeStat({
        t0: start.t0,
        totalMs: Date.now() - start.t0,
        outputTokens: mined.outputTokens,
        costUsd: mined.costUsd || 0,
        model: mined.model || start.model || "",
        agent: detectAgent(process.env, input, mined.hint),
        session: sessionId,
      }),
    );
    return;
  }
}

main().catch(() => {});
