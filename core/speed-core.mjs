/**
 * speed-core — shared metrics engine for the llm-speed-bench agent adapters.
 *
 * Every adapter (Claude Code, Codex, Grok Build, Gemini CLI, Qwen Code,
 * opencode, MiMo Code, pi) writes to the same on-disk store so tooling can
 * read one uniform format:
 *
 *   ~/.cache/llm-speed-bench/
 *     starts/<sessionId>.json   in-flight turn markers (t0, model, agent)
 *     stats.jsonl               one line per completed response
 *
 * Metrics (same definitions everywhere):
 *   TTFT          request sent → first streamed token
 *   decode tok/s  (tokens − 1) ÷ seconds AFTER the first token
 *   overall tok/s tokens ÷ total seconds (what you actually feel)
 */

import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const STORE_DIR =
  process.env.LLM_SPEED_DIR || join(homedir(), ".cache", "llm-speed-bench");
const STARTS = join(STORE_DIR, "starts");
const STATS = join(STORE_DIR, "stats.jsonl");

function ensureDirs() {
  mkdirSync(STARTS, { recursive: true });
}

function safeId(id) {
  return String(id ?? "unknown").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

/** Record the moment a turn was kicked off (user prompt / model request). */
export function recordStart(sessionId, meta = {}) {
  ensureDirs();
  const file = join(STARTS, safeId(sessionId) + ".json");
  writeFileSync(file, JSON.stringify({ t0: Date.now(), ...meta }));
}

/** Read + remove the in-flight marker. Returns null when absent. */
export function takeStart(sessionId) {
  const file = join(STARTS, safeId(sessionId) + ".json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  } finally {
    try { rmSync(file); } catch {}
  }
}

/** Append one completed-response stat. */
export function appendStat(stat) {
  ensureDirs();
  appendFileSync(STATS, JSON.stringify({ ts: Date.now(), ...stat }) + "\n");
}

/** Read the last `limit` stats (newest last). */
export function readStats(limit = 200) {
  if (!existsSync(STATS)) return [];
  const lines = readFileSync(STATS, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function median(values) {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!v.length) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** Build a full stat from raw timings. */
export function computeStat({ t0, ttftMs = 0, totalMs, outputTokens, costUsd = 0, model = "", agent = "", session = "" }) {
  const total = Math.max(1, totalMs);
  const ttft = ttftMs > 0 ? ttftMs : 0;
  const gen = Math.max(1, total - ttft);
  return {
    agent, session, model,
    ttftMs: ttft,
    totalMs: total,
    outputTokens,
    decodeTps: outputTokens > 0 ? (outputTokens - 1) / (gen / 1000) : 0,
    overallTps: outputTokens > 0 ? outputTokens / (total / 1000) : 0,
    costUsd,
  };
}

/** Rough token estimate when only character counts are available (~4 chars/token). */
export function charsToTokens(chars) {
  return Math.max(0, Math.round(chars / 4));
}

/** Aggregate stats by agent+model. */
export function aggregate(stats = readStats()) {
  const map = new Map();
  for (const s of stats) {
    const key = `${s.agent || "?"}|${s.model || "?"}`;
    const agg =
      map.get(key) ||
      { agent: s.agent || "?", model: s.model || "?", responses: 0, ttfts: [], decodes: [], overalls: [], tokens: 0, costUsd: 0 };
    agg.responses++;
    if (s.ttftMs > 0) agg.ttfts.push(s.ttftMs);
    if (s.decodeTps > 0) agg.decodes.push(s.decodeTps);
    if (s.overallTps > 0) agg.overalls.push(s.overallTps);
    agg.tokens += s.outputTokens || 0;
    agg.costUsd += s.costUsd || 0;
    map.set(key, agg);
  }
  return [...map.values()];
}

export function fmtMs(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function fmtTps(tps) {
  return tps > 0 ? tps.toFixed(1) : "—";
}

export function fmtTokens(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

export function fmtCost(usd) {
  if (!usd) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

/** Render the aggregate table (used by /speed-style commands across agents). */
export function renderTable(stats = readStats()) {
  const aggs = aggregate(stats);
  if (!aggs.length) return "No responses measured yet.";
  const lines = [];
  lines.push("Speed counter — per-model medians");
  lines.push(
    `${"agent".padEnd(9)} ${"model".padEnd(28)} ${"resp".padStart(4)}  ${"TTFT".padStart(7)}  ${"decode tok/s".padStart(12)}  ${"overall tok/s".padStart(13)}  ${"out tok".padStart(7)}  ${"cost".padStart(8)}`,
  );
  for (const a of aggs) {
    lines.push(
      `${a.agent.padEnd(9).slice(0, 9)} ${a.model.padEnd(28).slice(0, 28)} ${String(a.responses).padStart(4)}  ${a.ttfts.length ? fmtMs(median(a.ttfts)).padStart(7) : "—".padStart(7)}  ${fmtTps(median(a.decodes)).padStart(12)}  ${fmtTps(median(a.overalls)).padStart(13)}  ${fmtTokens(a.tokens).padStart(7)}  ${fmtCost(a.costUsd).padStart(8)}`,
    );
  }
  lines.push("");
  lines.push("TTFT · request sent → first streamed token");
  lines.push("decode tok/s · generation speed after the first token");
  lines.push("overall tok/s · tokens ÷ total seconds (includes prefill wait)");
  return lines.join("\n");
}
