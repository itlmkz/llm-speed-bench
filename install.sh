#!/usr/bin/env bash
# llm-speed-bench — install the speed counter into every agent found on this machine.
#
# From a clone:      ./install.sh
# One-liner (anywhere): curl -fsSL https://raw.githubusercontent.com/itlmkz/llm-speed-bench/main/install.sh | bash
set -euo pipefail

# When piped from curl there is no local checkout — fetch the repo and re-exec.
if [ "${0##*/}" = "bash" ] || [ "${0##*/}" = "sh" ]; then
  tmp="$(mktemp -d)"
  curl -fsSL https://github.com/itlmkz/llm-speed-bench/archive/refs/heads/main.tar.gz \
    | tar -xz -C "$tmp" --strip-components=1
  exec bash "$tmp/install.sh" "$@"
fi

HERE="$(cd "$(dirname "$0")" && pwd)"

echo "llm-speed-bench installer — detecting agents…"
echo

have() { command -v "$1" >/dev/null 2>&1; }

have node || { echo "✗ Node.js ≥ 18 required — https://nodejs.org"; exit 1; }

if have pi; then
  mkdir -p "$HOME/.pi/agent/extensions"
  cp "$HERE/speed-counter.ts" "$HOME/.pi/agent/extensions/" \
    && echo "✓ pi        → ~/.pi/agent/extensions/speed-counter.ts (/reload to activate)" \
    || echo "⚠ pi: failed to copy speed-counter.ts" >&2
fi
if have claude;   then "$HERE/adapters/claude/install.sh" claude   || echo "⚠ claude adapter failed"   >&2; fi
if have codex;    then "$HERE/adapters/claude/install.sh" codex    || echo "⚠ codex adapter failed"    >&2; fi
if have grok;     then "$HERE/adapters/claude/install.sh" grok     || echo "⚠ grok adapter failed"     >&2; fi
if have opencode; then "$HERE/adapters/opencode/install.sh"        || echo "⚠ opencode adapter failed" >&2; fi
if have mimo;     then "$HERE/adapters/opencode/install.sh" mimo   || echo "⚠ mimo adapter failed"     >&2; fi
if have gemini;   then "$HERE/adapters/gemini/install.sh"          || echo "⚠ gemini adapter failed"   >&2; fi
if have qwen;     then "$HERE/adapters/gemini/install.sh" qwen     || echo "⚠ qwen adapter failed"     >&2; fi

echo
echo "Stats for all agents land in ~/.cache/llm-speed-bench/stats.jsonl"
echo "Table: node \"$HERE/adapters/claude/speed-hook.mjs\" table"
