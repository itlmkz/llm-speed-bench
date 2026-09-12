#!/usr/bin/env node
/**
 * statusline.mjs — Claude Code status line for llm-speed-bench.
 *
 * Configure in ~/.claude/settings.json (install.sh does this for you):
 *   { "statusLine": { "type": "command", "command": "node ~/.claude/llm-speed-bench/adapters/claude/statusline.mjs" } }
 *
 * Reads the session's last measured response from the shared stats store and
 * renders a one-line speed summary. Fails silently (prints the model) when
 * nothing is measured yet. `node statusline.mjs table` prints the full table.
 */

let core;
try {
  core = await import("../../core/speed-core.mjs");
} catch {
  process.stdout.write("⚡ speed");
  process.exit(0);
}
const { renderTable, readStats, fmtTps, fmtMs, fmtTokens, fmtCost } = core;

async function main() {
  let input = {};
  try {
    input = JSON.parse((await readStdin()) || "{}");
  } catch {}

  const arg = process.argv[2];
  if (arg === "table") {
    const sid = input.session_id;
    process.stdout.write(renderTable(readStats(400).filter((s) => !sid || s.session === sid)) + "\n");
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

/** Drain stdin without crashing on EPIPE, truncating on slow writers, or hanging. */
function readStdin() {
  return new Promise((resolve) => {
    let buf = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      process.stdin.off("data", onData);
      process.stdin.off("end", finish);
      process.stdin.off("error", finish);
      try { process.stdin.destroy(); } catch {}
      resolve(buf);
    };
    const onData = (d) => (buf += d);
    const timer = setTimeout(finish, 1500); // generous cap, not a truncation risk
    timer.unref?.();
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.on("end", finish);
    process.stdin.on("error", finish); // EPIPE no longer crashes
  });
}

main().catch(() => process.stdout.write("⚡ speed"));
