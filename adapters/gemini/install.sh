#!/usr/bin/env bash
# Install llm-speed-bench extension for Gemini CLI (or Qwen Code).
#
#   ./install.sh            → gemini: ~/.gemini/extensions/llm-speed-bench
#   ./install.sh qwen       → qwen:   ~/.qwen/extensions/llm-speed-bench
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"
WHICH="${1:-gemini}"

case "$WHICH" in
  gemini) BIN=gemini; DIR="$HOME/.gemini" ;;
  qwen)   BIN=qwen;   DIR="$HOME/.qwen" ;;
  *) echo "usage: $0 [gemini|qwen]"; exit 1 ;;
esac

command -v "$BIN" >/dev/null 2>&1 || { echo "$BIN not found on PATH"; exit 1; }

# The extension dir must be self-contained (Gemini copies it on install), so
# vendor the shared core next to the hook.
DEST="$DIR/extensions/llm-speed-bench"
rm -rf "$DEST"
mkdir -p "$DEST"
cp -R "$SRC/adapters/gemini/"* "$DEST/"
mkdir -p "$DEST/core"
cp "$SRC/core/speed-core.mjs" "$DEST/core/"
# re-point the hook's relative import: it now sits beside core/
node -e '
  const fs = require("fs");
  const f = process.argv[1] + "/speed-hook.mjs";
  let s = fs.readFileSync(f, "utf8");
  s = s.replace("../../core/speed-core.mjs", "./core/speed-core.mjs");
  fs.writeFileSync(f, s);
' "$DEST"

"$BIN" --version >/dev/null 2>&1 || true

# No `extensions link` call: Gemini auto-discovers every directory under
# $DIR/extensions/ at startup (reported "Enabled (User): true", no registration
# file needed), so the copy above is the whole install. We deliberately do not
# invoke `link` — it is interactive, and with stdout/stderr redirected (as in a
# script) its "workspace is not trusted / continue? [Y/n]" prompt blocks forever
# on a stdin read the user cannot even see. Verified hang-proof and functional
# in a clean HOME.
echo "  extension → $DEST  (auto-discovered; no link step needed)"
echo "  activate:  restart $BIN — it loads $DIR/extensions at startup"
echo "done. stats → ~/.cache/llm-speed-bench/stats.jsonl; in-session: /speed"
