#!/usr/bin/env bash
# Install llm-speed-bench for opencode (and MiMo Code, its fork).
#
#   ./install.sh            → opencode: ~/.config/opencode/plugins/...
#   ./install.sh mimo       → MiMo Code: ~/.mimocode/plugins/...
set -euo pipefail

SRC="$(cd "$(dirname "$0")/../.." && pwd)"
WHICH="${1:-opencode}"

case "$WHICH" in
  opencode)
    DEST="$HOME/.config/opencode/plugins/llm-speed-bench"
    mkdir -p "$(dirname "$DEST")"
    cp -R "$SRC" "$DEST" 2>/dev/null || { rm -rf "$DEST"; cp -R "$SRC" "$DEST"; }
    node -e '
      const fs = require("fs");
      const f = process.env.HOME + "/.config/opencode/opencode.json";
      let c = {};
      try { c = JSON.parse(fs.readFileSync(f, "utf8")); } catch {}
      const entry = process.env.HOME + "/.config/opencode/plugins/llm-speed-bench/adapters/opencode/speed-counter.plugin.ts";
      c.plugin = Array.isArray(c.plugin) ? c.plugin : c.plugin ? [c.plugin] : [];
      c.plugin = c.plugin.filter((p) => !String(p).includes("llm-speed-bench"));
      c.plugin.push(entry);
      fs.writeFileSync(f, JSON.stringify(c, null, 2) + "\n");
      console.log("  plugin registered → " + f);
    '
    ;;
  mimo)
    DEST="$HOME/.mimocode/plugins/llm-speed-bench"
    mkdir -p "$(dirname "$DEST")"
    cp -R "$SRC" "$DEST" 2>/dev/null || { rm -rf "$DEST"; cp -R "$SRC" "$DEST"; }
    echo "  plugin copied → $DEST"
    echo "  register with: mimo plugin $DEST/adapters/opencode/speed-counter.plugin.ts"
    ;;
  *) echo "usage: $0 [opencode|mimo]"; exit 1 ;;
esac

echo "done. stats → ~/.cache/llm-speed-bench/stats.jsonl"
