#!/usr/bin/env bash
# Install llm-speed-bench hooks for Claude Code, Codex, and Grok Build.
#
#   ./install.sh claude   → ~/.claude/llm-speed-bench + settings.json merge (hooks + statusline)
#   ./install.sh codex    → ~/.codex/llm-speed-bench + hooks.json merge (trust via /hooks)
#   ./install.sh grok     → ~/.grok/llm-speed-bench + hooks/llm-speed-bench.json
#   ./install.sh all
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"   # app root (contains core/ + adapters/)

case "${1:-all}" in
  claude|codex|grok|all) TARGETS="${1:-all}" ;;
  *) echo "usage: $0 [claude|codex|grok|all]"; exit 1 ;;
esac

# Idempotent: wipe our own dir, then copy the whole tree (hook imports ../../core/).
install_files() {
  local dest="$1"
  rm -rf "$dest"
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
    const sl = `node "${process.env.HOME}/.claude/llm-speed-bench/adapters/claude/statusline.mjs"`;
    if (!s.statusLine || JSON.stringify(s.statusLine).includes("llm-speed-bench")) {
      s.statusLine = { type: "command", command: sl }; // claim only if unset or already ours
      console.log("  statusline → wired");
    }
    fs.writeFileSync(sf, JSON.stringify(s, null, 2) + "\n");
    console.log("  hooks merged → " + sf);
  ' "$sf"
}

# Codex reads ONE user-level file: ~/.codex/hooks.json — merge, never clobber.
merge_codex_hooks() {
  local hf="$HOME/.codex/hooks.json"
  mkdir -p "$HOME/.codex"
  node -e '
    const fs = require("fs");
    const hf = process.argv[1];
    let h = {};
    try { h = JSON.parse(fs.readFileSync(hf, "utf8")); } catch {}
    h.hooks = h.hooks || {};
    const cmd = `node "${process.env.HOME}/.codex/llm-speed-bench/adapters/claude/speed-hook.mjs" --agent codex`;
    for (const ev of ["UserPromptSubmit", "Stop"]) {
      h.hooks[ev] = (h.hooks[ev] || []).filter((g) => !JSON.stringify(g).includes("llm-speed-bench"));
      h.hooks[ev].push({ hooks: [{ type: "command", command: cmd, async: true, timeout: 10 }] });
    }
    if (!h.description) h.description = "llm-speed-bench: turn-level speed metrics";
    fs.writeFileSync(hf, JSON.stringify(h, null, 2) + "\n");
    console.log("  hooks merged → " + hf);
  ' "$hf"
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
    merge_codex_hooks
    echo "  note: Codex trusts hooks by hash — run /hooks in Codex after (re)install to trust it"
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
echo "print them anytime: node \"$SRC/adapters/claude/speed-hook.mjs\" table"
