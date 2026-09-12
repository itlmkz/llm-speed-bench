#!/usr/bin/env node
/**
 * statusline.mjs — Claude Code status line for llm-speed-bench.
 *
 * Configure in ~/.claude/settings.json:
 *   { "statusLine": { "type": "command", "command": "node ~/.claude/llm-speed-bench/adapters/claude/statusline.mjs" } }
 *
 * Reads the session's last measured response from the shared stats store and
 * renders a one-line speed summary. Fails silently (prints the model) when
 * nothing is measured yet.
 */

import { renderTable, readStats, fmtTps, fmtMs, fmtTokens, fmtCost } from "../../core/speed-core.mjs";

async function main() {
  let input = {};
  try {
    input = JSON.parse((await read(0)) || "{}");
  } catch {}

  const arg = process.argv[2];
  if (arg === "table") {
    process.stdout.write(renderTable(readStats(400).filter((s) => !input.session_id || s.session === input.session_id)) + "\n");
    return;
  }

  const sid = input.session_id || "";
  const last = [...readStats(200)].reverse().find((s) => !sid || s.session === sid);
  const model = (input.model?.display_name || last?.model || "").split("(")[0].trim();
  if (!last) {
    process.stdout.write(`⚡ speed · ${model} · no turns measured yet`);
    return;
  }
  process.stdout.write(
    `⚡ ${fmtTokens(last.outputTokens)} tok · ${fmtTps(last.overallTps)} tok/s · ${fmtMs(last.totalMs)}` +
      (last.ttftMs ? ` · TTFT ${fmtMs(last.ttftMs)}` : "") +
      ` · ${fmtCost(last.costUsd)} · ${model}`,
  );
}

function read(fd) {
  return new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (d) => (buf += d));
    process.stdin.on("end", () => resolve(buf));
    setTimeout(() => resolve(buf), 200).unref?.();
  });
}

main().catch(() => process.stdout.write("⚡ speed"));
