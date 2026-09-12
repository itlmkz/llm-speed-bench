/**
 * speed-counter.plugin.ts — llm-speed-bench plugin for opencode and MiMo Code.
 *
 * Measures per assistant response:
 *   TTFT          user message → first streamed text part
 *   decode tok/s  generation speed after the first token
 *   overall tok/s end-to-end including prefill wait
 *
 * Install (opencode): registered in ~/.config/opencode/opencode.json
 *   { "plugin": ["~/.config/opencode/plugins/llm-speed-bench/speed-counter.plugin.ts"] }
 * Install (MiMo Code): mimo plugin ~/.mimocode/plugins/llm-speed-bench/speed-counter.plugin.ts
 *
 * Event shapes verified against the sst/opencode SDK (types.gen.ts):
 *   EventMessagePartUpdated  { properties: { part, delta? } }   — part carries sessionID
 *   EventMessageUpdated      { properties: { info } }           — info.time.completed,
 *                                                             flat providerID/modelID
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

export const SpeedCounter: Plugin = async () => {
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

      // hygiene: prune abandoned stopwatches when a session goes idle/deleted
      if (type === "session.idle" || type === "session.deleted") {
        live.delete(e.properties?.sessionID);
        return;
      }

      if (type === "message.part.updated") {
        const p = e.properties ?? {};
        const part = p.part;                                  // { id, sessionID, messageID, type, text? }
        const sessionID = part?.sessionID ?? p.sessionID;     // sessionID lives on the PART
        if (!sessionID) return;
        const st = live.get(sessionID);
        if (!st) return;
        // No role on this event. Any streamed *text* part after chat.message is
        // assistant output (user parts are files, tool calls are type:"tool").
        // Reasoning parts also stream — arm TTFT on them too (thinking models).
        if ((part?.type === "text" || part?.type === "reasoning") &&
            (typeof part.text === "string" ? part.text.length > 0 : true)) {
          if (st.tFirst === 0) st.tFirst = Date.now();        // TTFT landed
        }
        return;
      }

      if (type === "message.updated" || type === "message.completed") {
        const info = e.properties?.info ?? e.properties?.message?.info;
        const sessionID = info?.sessionID ?? e.properties?.sessionID;
        if (!sessionID || info?.role !== "assistant") return;
        const st = live.get(sessionID);
        if (!st) return;

        // assistant model is flat: providerID + modelID (no `model` object)
        if (!st.model && info.modelID) {
          st.model = `${info.providerID ?? ""}/${info.modelID}`.replace(/^\//, "");
        }

        // aborted / errored response: drop the stopwatch so next turn starts clean
        if (info.error) { live.delete(sessionID); return; }

        const completed = info.time?.completed ?? info.completedAt; // fork compat (MiMo)
        if (!completed) return;                               // still streaming

        const outputTokens = info.tokens?.output ?? 0;
        // cross-turn guard: this assistant message must belong to the measured turn
        if (outputTokens > 0 && (info.time?.created ?? info.time?.completed) >= st.tUser - 2000) {
          const totalMs = Math.max(1, Date.now() - st.tUser);
          const ttftMs = st.tFirst > 0 ? Math.max(1, st.tFirst - st.tUser) : 0;
          const genMs = Math.max(1, totalMs - ttftMs);
          log({
            agent: st.agent || agent,
            session: sessionID,
            model: st.model,
            ttftMs,
            totalMs,
            outputTokens,
            decodeTps: (outputTokens - 1) / (genMs / 1000),
            overallTps: outputTokens / (totalMs / 1000),
            costUsd: info.cost ?? 0,
          });
        }
        live.delete(sessionID);
        return;
      }
    },
  };
};

export default SpeedCounter;
