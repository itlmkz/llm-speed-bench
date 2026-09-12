#!/usr/bin/env bash
# llm-speed-bench — install the speed counter into every agent found on this machine.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "llm-speed-bench installer — detecting agents…"
echo

have() { command -v "$1" >/dev/null 2>&1; }

if have pi; then
  mkdir -p "$HOME/.pi/agent/extensions"
  cp "$HERE/speed-counter.ts" "$HOME/.pi/agent/extensions/" 2>/dev/null && echo "✓ pi        → ~/.pi/agent/extensions/speed-counter.ts (/reload to activate)"
fi
if have claude; then "$HERE/adapters/claude/install.sh" claude; fi
if have codex;  then "$HERE/adapters/claude/install.sh" codex; fi
if have grok;   then "$HERE/adapters/claude/install.sh" grok; fi
if have opencode; then "$HERE/adapters/opencode/install.sh"; fi
if have mimo;   then "$HERE/adapters/opencode/install.sh" mimo; fi
if have gemini; then "$HERE/adapters/gemini/install.sh"; fi
if have qwen;   then "$HERE/adapters/gemini/install.sh" qwen; fi

echo
echo "Stats for all agents land in ~/.cache/llm-speed-bench/stats.jsonl"
echo "Table: node $HERE/adapters/claude/speed-hook.mjs table"
