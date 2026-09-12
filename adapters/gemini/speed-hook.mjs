#!/usr/bin/env node
/**
 * speed-hook.mjs — llm-speed-bench adapter for Gemini CLI and Qwen Code.
 *
 * Gemini hooks receive one JSON payload on stdin. We use:
 *   BeforeModel → mark turn start (env: GEMINI_SESSION_ID)
 *   AfterModel  → mine usageMetadata from the response payload, record stat
 *
 * Works for Qwen Code (a Gemini CLI fork) via the same extension layout.
 * CLI: `node speed-hook.mjs table [sessionId]`.
 */

import { readFileSync } from "node:fs";
import { recordStart, takeStart, computeStat, appendStat, renderTable, readStats } from "../../core/speed-core.mjs";

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

/** Recursively hunt for a usage-like object with output token counts. */
function findUsage(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return null;
  const c =
    node.candidatesTokenCount ?? node.outputTokenCount ?? node.output_tokens ??
    node.completionTokens ?? node.outputTokens ?? node.generatedTokens;
  if (typeof c === "number" && c > 0) {
    const p = node.promptTokenCount ?? node.inputTokenCount ?? node.input_tokens ?? node.inputTokens ?? 0;
    const t = node.thoughtsTokenCount ?? 0;
    return { outputTokens: c + t, inputTokens: p, costUsd: node.costUsd ?? node.cost_usd ?? 0 };
  }
  for (const k of Object.keys(node)) {
    const found = findUsage(node[k], depth + 1);
    if (found) return found;
  }
  return null;
}

/** Recursively hunt for a model id string. */
function findModel(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 8) return "";
  if (typeof node.model === "string") return node.model;
  for (const k of Object.keys(node)) {
    const m = findModel(node[k], depth + 1);
    if (m) return m;
  }
  return "";
}

function main() {
  const arg = process.argv[2];
  if (arg === "table") {
    const id = process.argv[3] || process.env.GEMINI_SESSION_ID;
    const stats = readStats(400).filter((s) => !id || s.session === id);
    process.stdout.write(renderTable(stats) + "\n");
    return;
  }

  const input = readStdin();
  const sessionId = process.env.GEMINI_SESSION_ID || input.session_id || input.sessionId || "unknown";
  const event =
    input.hook_event_name ||
    process.env.LLM_SPEED_EVENT ||
    (input.usageMetadata || input.response ? "AfterModel" : input.prompt ? "BeforeModel" : "");

  if (event === "BeforeModel") {
    recordStart(sessionId, { agent: "gemini", model: findModel(input) });
    return;
  }

  if (event === "AfterModel") {
    // Mine first, claim second: a failed mine must not destroy the marker.
    const usage = findUsage(input);
    if (!usage) return;
    const start = takeStart(sessionId);
    if (!start) return;
    appendStat(
      computeStat({
        t0: start.t0,
        totalMs: Date.now() - start.t0,
        outputTokens: usage.outputTokens,
        costUsd: usage.costUsd || 0,
        model: findModel(input) || start.model || "",
        agent: "gemini",
        session: sessionId,
      }),
    );
    return;
  }
}

try {
  main();
} catch {
  /* never break the host agent */
}
