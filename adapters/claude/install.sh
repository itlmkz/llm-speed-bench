#!/usr/bin/env bash
# Install llm-speed-bench hooks for Claude Code, Codex, and Grok Build.
#
#   ./install.sh claude   → ~/.claude/llm-speed-bench + settings.json merge
#   ./install.sh codex    → ~/.codex/llm-speed-bench + hooks.json
#   ./install.sh grok     → ~/.grok/llm-speed-bench + hooks/llm-speed-bench.json
#   ./install.sh all
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"   # repo root (contains core/ + adapters/)
TARGETS="${1:-all}"

install_files() {
  local dest="$1"
  mkdir -p "$dest"
  cp -R "$SRC/core" "$dest/core"
  cp -R "$SRC/adapters" "$dest/adapters"
  echo "  files → $dest"
}

merge_claude_settings() {
  local sf="$HOME/.claude/settings.json"
  mkdir -p "$HOME/.claude"
  node -e '
    const fs = require("fs");
    const sf = process.argv[1];
    let s = {};
    try { s = JSON.parse(fs.readFileSync(sf, "utf8")); } catch {}
    s.hooks = s.hooks || {};
    const cmd = `node "${process.env.HOME}/.claude/llm-speed-bench/adapters/claude/speed-hook.mjs" --agent claude`;
    for (const ev of ["UserPromptSubmit", "Stop"]) {
      s.hooks[ev] = (s.hooks[ev] || []).filter((g) => !JSON.stringify(g).includes("llm-speed-bench"));
      s.hooks[ev].push({ hooks: [{ type: "command", command: cmd, async: true, timeout: 10 }] });
    }
    fs.writeFileSync(sf, JSON.stringify(s, null, 2) + "\n");
    console.log("  hooks merged → " + sf);
  ' "$sf"
}

case "$TARGETS" in
  claude|all)
    echo "claude:"
    install_files "$HOME/.claude/llm-speed-bench"
    merge_claude_settings
    ;;
esac

case "$TARGETS" in
  codex|all)
    echo "codex:"
    install_files "$HOME/.codex/llm-speed-bench"
    mkdir -p "$HOME/.codex"
    cp "$SRC/adapters/claude/hooks.codex.json" "$HOME/.codex/hooks/llm-speed-bench.json" 2>/dev/null || {
      mkdir -p "$HOME/.codex/hooks"; cp "$SRC/adapters/claude/hooks.codex.json" "$HOME/.codex/hooks/llm-speed-bench.json"; }
    echo "  hooks → ~/.codex/hooks/llm-speed-bench.json (trust via /hooks in Codex)"
    ;;
esac

case "$TARGETS" in
  grok|all)
    echo "grok:"
    install_files "$HOME/.grok/llm-speed-bench"
    mkdir -p "$HOME/.grok/hooks"
    cp "$SRC/adapters/claude/hooks.grok.json" "$HOME/.grok/hooks/llm-speed-bench.json"
    echo "  hooks → ~/.grok/hooks/llm-speed-bench.json"
    ;;
esac

echo "done. stats land in ~/.cache/llm-speed-bench/stats.jsonl"
echo "print them anytime: node $SRC/adapters/claude/speed-hook.mjs table"
