#!/usr/bin/env node
/**
 * speed-hook.mjs — llm-speed-bench adapter for Claude Code, Codex, and Grok Build.
 *
 * All three agents share the Claude-style hook contract:
 *   - one JSON object on stdin per hook invocation
 *   - `hook_event_name`, `session_id`, `transcript_path` fields
 *
 * Wired via:
 *   Claude Code  ~/.claude/settings.json          (hooks.UserPromptSubmit / hooks.Stop)
 *   Codex        ~/.codex/hooks.json               (same event names)
 *   Grok Build   ~/.grok/hooks/llm-speed-bench.json (same event names)
 *
 * Metrics: turn duration + output tokens + overall tok/s + cost, read from the
 * agent transcript at Stop time. Streaming deltas are not exposed by these
 * hook APIs, so TTFT is measured by the opencode/Gemini-class adapters and the
 * pi extension instead. Use `node speed-hook.mjs table` to print the stats.
 */

import { readFileSync, existsSync } from "node:fs";
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

// --- transcript mining -----------------------------------------------------
/** Walk a JSONL transcript and return the best {outputTokens, costUsd, model} found. */
function mineTranscript(path) {
  if (!path || !existsSync(path)) return null;
  let out = null;
  let model = "";
  let hint = "";
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }

    // Claude Code: {type:"assistant", message:{model, usage:{output_tokens,...}}}
    const usage = entry?.message?.usage ?? entry?.usage ?? null;
    if (usage && (usage.output_tokens ?? usage.outputTokens ?? 0) > 0) {
      hint = "claude";
      out = {
        outputTokens: usage.output_tokens ?? usage.outputTokens,
        inputTokens: usage.input_tokens ?? usage.inputTokens ?? 0,
        costUsd: entry?.costUSD ?? usage.cost_usd ?? usage.costUsd ?? 0,
      };
    }
    // Codex: {type:"token_count", info:{total_token_usage:{output_tokens,...}}}
    const ttu = entry?.info?.total_token_usage;
    if (entry?.type === "token_count" && ttu && (ttu.output_tokens ?? 0) > 0) {
      hint = "codex";
      out = {
        outputTokens: ttu.output_tokens,
        inputTokens: ttu.input_tokens ?? 0,
        costUsd: ttu.cost_usd ?? ttu.costUsd ?? 0,
      };
    }
    // Codex newer: {type:"event_msg", ...} / generic token_count shapes
    const tu2 = entry?.token_count?.info?.total_token_usage;
    if (tu2 && (tu2.output_tokens ?? 0) > 0) {
      out = { outputTokens: tu2.output_tokens, inputTokens: tu2.input_tokens ?? 0, costUsd: 0 };
    }
    // Grok Build / generic: usageMetadata (Gemini-style) or last model hint
    const um = entry?.usageMetadata ?? entry?.response?.usageMetadata;
    if (um && (um.candidatesTokenCount ?? 0) > 0) {
      out = {
        outputTokens: um.candidatesTokenCount,
        inputTokens: um.promptTokenCount ?? 0,
        costUsd: 0,
      };
    }
    const m = entry?.message?.model ?? entry?.model;
    if (m) model = m;
  }
  if (!out && !model) return null;
  return { ...out, model, hint };
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
    if (event !== "SessionStart" || !input.prompt) {
      // SessionStart without a prompt is not a turn kickoff — skip, unless it
      // carries BeforeAgent semantics (some agents blur these).
      if (event === "SessionStart") return;
    }
    recordStart(sessionId, { agent, model: input.model || "" });
    return;
  }

  if (event === "Stop" || event === "AfterAgent" || event === "SessionEnd") {
    const start = takeStart(sessionId);
    if (!start) return; // no matching turn start
    const mined = mineTranscript(input.transcript_path);
    const totalMs = Date.now() - start.t0;
    if (!mined || !mined.outputTokens) return; // nothing countable
    appendStat(
      computeStat({
        t0: start.t0,
        totalMs,
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
