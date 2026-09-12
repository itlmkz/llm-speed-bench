/**
 * speed-counter.plugin.ts — llm-speed-bench plugin for opencode and MiMo Code.
 *
 * Measures per assistant response:
 *   TTFT          user message → first streamed text part
 *   decode tok/s  generation speed after the first token
 *   overall tok/s end-to-end including prefill wait
 *
 * Install (opencode): add to ~/.config/opencode/opencode.json
 *   { "plugin": ["~/.config/opencode/plugins/llm-speed-bench/speed-counter.plugin.ts"] }
 * Install (MiMo Code): mimo plugin ~/.mimocode/plugins/llm-speed-bench
 *
 * Stats are appended to ~/.cache/llm-speed-bench/stats.jsonl (shared format
 * with all other llm-speed-bench adapters).
 */

import type { Plugin } from "@opencode-ai/plugin";
import { appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STORE =
  process.env.LLM_SPEED_DIR || join(homedir(), ".cache", "llm-speed-bench");
const STATS = join(STORE, "stats.jsonl");

type Any = Record<string, any>;

/** sessionID → measurement state */
const live = new Map<string, {
  tUser: number;       // user message sent
  tFirst: number;      // first streamed token arrived
  model: string;
  agent: string;
}>();

function log(line: Any) {
  try {
    mkdirSync(STORE, { recursive: true });
    appendFileSync(STATS, JSON.stringify({ ts: Date.now(), ...line }) + "\n");
  } catch {
    /* never break the agent */
  }
}

export const SpeedCounter: Plugin = async (ctx) => {
  const agent = "opencode";
  return {
    // user sends a message → start the stopwatch
    "chat.message": async (input) => {
      const sessionID = input?.sessionID;
      if (!sessionID) return;
      live.set(sessionID, { tUser: Date.now(), tFirst: 0, model: "", agent });
    },

    // opencode event bus
    event: async ({ event }) => {
      const e = event as Any;
      const type = e?.type;

      if (type === "message.part.updated") {
        const p = e.properties ?? {};
        const sessionID = p.sessionID ?? p.info?.sessionID;
        const part = p.part ?? p.info?.part;
        const role = p.info?.role ?? p.message?.info?.role;
        if (!sessionID || role !== "assistant") return;
        const st = live.get(sessionID);
        if (!st) return;
        if (p.info?.model) st.model = `${p.info.model.providerID ?? ""}/${p.info.model.modelID ?? ""}`.replace(/^\//, "");
        // text parts stream; part.text grows as tokens arrive
        if (part?.type === "text" && typeof part.text === "string" && part.text.length > 0) {
          if (st.tFirst === 0) st.tFirst = Date.now(); // TTFT landed
        }
        return;
      }

      if (type === "message.updated" || type === "message.completed") {
        const info = e.properties?.info ?? e.properties?.message?.info;
        const sessionID = e.properties?.sessionID ?? info?.sessionID;
        if (!sessionID || info?.role !== "assistant") return;
        const st = live.get(sessionID);
        if (!st || !info?.completedAt) return;

        const tokens = info.tokens ?? {};
        const outputTokens = tokens.output ?? 0;
        const costUsd = info.cost ?? 0;
        if (outputTokens > 0) {
          const totalMs = Math.max(1, Date.now() - st.tUser);
          const ttftMs = st.tFirst > 0 ? Math.max(1, st.tFirst - st.tUser) : 0;
          const genMs = Math.max(1, totalMs - ttftMs);
          log({
            agent: st.agent || agent,
            session: sessionID,
            model: st.model || info.model?.modelID || "",
            ttftMs,
            totalMs,
            outputTokens,
            decodeTps: (outputTokens - 1) / (genMs / 1000),
            overallTps: outputTokens / (totalMs / 1000),
            costUsd,
          });
        }
        live.delete(sessionID);
        return;
      }
    },
  };
};

export default SpeedCounter;
