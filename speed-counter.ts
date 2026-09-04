/**
 * Speed Counter — live streaming-speed readout for the current pi session.
 *
 * Measures, per assistant response, from the same network path pi actually uses:
 *   TTFT        time from request send to first streamed delta
 *   decode tok/s  (output_tokens - 1) / (total - TTFT)   generation speed after first token
 *   overall tok/s output_tokens / total                  end-to-end including prefill wait
 *
 * Footer shows a live counter while streaming and the last response's numbers
 * at rest. `/speed` shows the per-model session table; `/speed clear` resets it.
 *
 * Auto-discovered from ~/.pi/agent/extensions/ (hot-reload with /reload).
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

interface ResponseStat {
  model: string;
  ttftMs: number;
  totalMs: number;
  outputTokens: number;
  decodeTps: number; // tokens/sec after first token
  overallTps: number;
  costUsd: number;
}

interface ModelAggregate {
  model: string;
  responses: number;
  ttfts: number[];
  decodes: number[];
  overalls: number[];
  tokens: number;
  costUsd: number;
}

const LIVE_UPDATE_MS = 250;

function fmtMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtTps(tps: number): string {
  return tps > 0 ? tps.toFixed(1) : "—";
}

function fmtTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

function fmtCost(usd: number): string {
  if (usd === 0) return "$0";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Dice roll while preflight/prefill is in flight, replaced by a speed animal once tokens stream. */
const DICE = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

function speedIcon(tps: number): string {
  if (tps < 5) return "🐌";
  if (tps < 15) return "🐢";
  if (tps < 30) return "🚶";
  if (tps < 60) return "🚴";
  if (tps < 120) return "🏎️";
  return "🚀";
}

export default function speedCounter(pi: ExtensionAPI) {
  // Current stream epoch (one per provider request, including retries)
  let epoch = 0;
  let t0 = 0;
  let ttftMs = 0;
  let deltaCount = 0;
  let currentModel = "";
  let lastRender = 0;
  let enabled = true;
  let diceTick = 0;

  const stats: ResponseStat[] = [];

  // Live TTFT stopwatch while no token has arrived yet
  let waitTimer: ReturnType<typeof setInterval> | null = null;

  const stopWaitTimer = () => {
    if (waitTimer !== null) {
      clearInterval(waitTimer);
      waitTimer = null;
    }
  };

  const aggregates = (): ModelAggregate[] => {
    const map = new Map<string, ModelAggregate>();
    for (const s of stats) {
      let agg = map.get(s.model);
      if (!agg) {
        agg = {
          model: s.model,
          responses: 0,
          ttfts: [],
          decodes: [],
          overalls: [],
          tokens: 0,
          costUsd: 0,
        };
        map.set(s.model, agg);
      }
      agg.responses++;
      agg.ttfts.push(s.ttftMs);
      agg.decodes.push(s.decodeTps);
      agg.overalls.push(s.overallTps);
      agg.tokens += s.outputTokens;
      agg.costUsd += s.costUsd;
    }
    return [...map.values()];
  };

  const statusLine = (text: string, ctx: { ui: { setStatus(k: string, v: string | undefined): void; theme: { fg(c: string, s: string): string } } }) => {
    if (!enabled) {
      ctx.ui.setStatus("speed", undefined);
      return;
    }
    ctx.ui.setStatus("speed", ctx.ui.theme.fg("dim", text));
  };

  pi.on("before_agent_start", async (_event, ctx) => {
    // Clear the /speed table widget when the user starts a new turn.
    ctx.ui.setWidget("speed-counter", undefined);
  });

  pi.on("session_shutdown", async () => {
    stopWaitTimer();
  });

  pi.on("turn_end", async () => {
    // Backstop: never leave the stopwatch running past a turn.
    stopWaitTimer();
  });

  pi.on("before_provider_request", async (_event, ctx) => {
    epoch++;
    t0 = Date.now();
    ttftMs = 0;
    deltaCount = 0;
    currentModel = "";
    stopWaitTimer();
    if (!enabled) return;
    const myEpoch = epoch;
    // Tick the elapsed time up while the first token is still in flight.
    // Guarded by epoch so a stale timer can never overwrite a newer request.
    const timer = setInterval(() => {
      if (myEpoch !== epoch) {
        stopWaitTimer();
        return;
      }
      statusLine(`${DICE[diceTick++ % DICE.length]} TTFT ${(Math.max(0, Date.now() - t0) / 1000).toFixed(1)}s…`, ctx);
    }, 100);
    (timer as { unref?: () => void }).unref?.();
    waitTimer = timer;
  });

  pi.on("message_update", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    const ev = event.assistantMessageEvent as { type?: string };
    const type = ev?.type ?? "";
    const isDelta = type === "text_delta" || type === "thinking_delta" || type === "toolcall_delta";
    if (!isDelta) return;

    const now = Date.now();
    if (!currentModel && event.message.model) {
      currentModel = `${event.message.provider}/${event.message.model}`;
    }
    if (ttftMs === 0) {
      ttftMs = Math.max(1, now - t0);
      stopWaitTimer(); // first token landed; stopwatch hands off to tok/s counter
    }
    deltaCount++;

    // Throttled live readout
    if (now - lastRender < LIVE_UPDATE_MS) return;
    lastRender = now;
    const genMs = now - t0 - ttftMs;
    const liveTps = genMs > 0 ? deltaCount / (genMs / 1000) : 0;
    const model = currentModel.split("/").pop() ?? currentModel;
    statusLine(
      `${speedIcon(liveTps)} ${fmtTps(liveTps)} tok/s · TTFT ${fmtMs(ttftMs)} · ~${fmtTokens(deltaCount)} tok · ${model}`,
      ctx,
    );
  });

  pi.on("message_end", async (event, ctx) => {
    if (event.message.role !== "assistant") return;
    stopWaitTimer();
    const msg = event.message;
    const model = `${msg.provider}/${msg.model}`;
    const totalMs = t0 > 0 ? Math.max(1, Date.now() - t0) : 0;
    const failed = msg.stopReason === "error" || msg.stopReason === "aborted";
    if (failed || ttftMs === 0 || totalMs === 0) {
      const reason = failed ? msg.stopReason ?? "failed" : "no stream data";
      statusLine("🤷 speed: " + reason, ctx);
      return;
    }

    // Provider usage is authoritative; fall back to delta count when unreported.
    const usage = msg.usage;
    const outputTokens = usage.output > 0 ? usage.output : deltaCount;
    const genMs = Math.max(1, totalMs - ttftMs);
    const decodeTps = Math.max(0, outputTokens - 1) / (genMs / 1000);
    const overallTps = outputTokens / (totalMs / 1000);
    const costUsd = usage.cost?.total ?? 0;

    stats.push({
      model,
      ttftMs,
      totalMs,
      outputTokens,
      decodeTps,
      overallTps,
      costUsd,
    });

    const shortModel = msg.model;
    statusLine(
      `${speedIcon(decodeTps)} ${shortModel}: ${fmtTokens(outputTokens)} tok · TTFT ${fmtMs(ttftMs)} · decode ${fmtTps(decodeTps)} tok/s · overall ${fmtTps(overallTps)} tok/s`,
      ctx,
    );
  });

  pi.registerCommand("speed", {
    description: "Show streaming speed stats for this session (TTFT / decode tok/s per model)",
    getArgumentCompletions: (prefix) => {
      const options = ["clear", "off", "on"];
      const filtered = options.filter((o) => o.startsWith(prefix));
      return filtered.length > 0 ? filtered.map((o) => ({ value: o, label: o })) : null;
    },
    handler: async (args, ctx) => {
      const action = args.trim();
      if (action === "off") {
        enabled = false;
        ctx.ui.setStatus("speed", undefined);
        ctx.ui.notify("Speed counter off", "info");
        return;
      }
      if (action === "on") {
        enabled = true;
        ctx.ui.notify("Speed counter on", "info");
        return;
      }
      if (action === "clear") {
        stats.length = 0;
        ctx.ui.notify("Speed stats cleared", "info");
        return;
      }

      const aggs = aggregates();
      if (aggs.length === 0) {
        ctx.ui.notify("No responses measured yet in this session.", "info");
        return;
      }

      const theme = ctx.ui.theme;
      const lines: string[] = [];
      lines.push(theme.fg("accent", " Speed counter — this session (per-model medians)"));
      lines.push(
        theme.fg(
          "dim",
          ` ${"model".padEnd(30)} ${"resp".padStart(4)}  ${"TTFT".padStart(8)}  ${"decode tok/s".padStart(12)}  ${"overall tok/s".padStart(13)}  ${"out tok".padStart(7)}  ${"cost".padStart(8)}`,
        ),
      );

      for (const agg of aggs) {
        const shortModel = agg.model.split("/").slice(1).join("/") || agg.model;
        lines.push(
          ` ${shortModel.padEnd(30).slice(0, 30)} ${String(agg.responses).padStart(4)}  ${fmtMs(median(agg.ttfts)).padStart(8)}  ${fmtTps(median(agg.decodes)).padStart(12)}  ${fmtTps(median(agg.overalls)).padStart(13)}  ${fmtTokens(agg.tokens).padStart(7)}  ${fmtCost(agg.costUsd).padStart(8)}`,
        );
      }

      const totalCost = aggs.reduce((a, x) => a + x.costUsd, 0);
      const totalResponses = aggs.reduce((a, x) => a + x.responses, 0);
      lines.push(theme.fg("dim", ` ${"─".repeat(88)}`));
      lines.push(
        theme.fg(
          "dim",
          ` TTFT · time from request sent to first streamed token (e.g. 1.2s = you stared at nothing for 1.2s)`,
        ),
      );
      lines.push(
        theme.fg(
          "dim",
          ` decode tok/s · (tokens−1) ÷ seconds AFTER first token — raw generation speed of the model`,
        ),
      );
      lines.push(
        theme.fg(
          "dim",
          ` overall tok/s · tokens ÷ TOTAL seconds — the speed you actually feel (includes prefill wait)`,
        ),
      );
      lines.push(
        theme.fg(
          "dim",
          ` out tok · total output tokens this session · ${totalResponses} responses · ${fmtCost(totalCost)} spent`,
        ),
      );

      ctx.ui.setWidget("speed-counter", lines);
      ctx.ui.notify("Speed stats shown above the editor (clears on next prompt)", "info");
    },
  });
}
