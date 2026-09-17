#!/bin/bash
# Run HERALD on a schedule on this Mac with launchd.
#
#   tools/herald-schedule.sh install [hours]   # default every 3 hours
#   tools/herald-schedule.sh uninstall
#   tools/herald-schedule.sh status
#
# Each firing: pull, sync the site's status changes into the vault, one
# HERALD run through the Claude API, regenerate the board and exports,
# commit and push, so the site redeploys with the new drafts. Output goes
# to data/herald-auto.log. Needs ANTHROPIC_API_KEY in .env.
set -e
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.arcane.herald.plist"
NODE="$(command -v node)"
case "${1:-status}" in
  install)
    HOURS="${2:-3}"
    mkdir -p "$REPO/data" "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.arcane.herald</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string><string>-lc</string>
    <string>cd "$REPO" && git pull -q --rebase origin main; "$NODE" tools/vault-sync.mjs; "$NODE" .claude/skills/herald/scripts/auto.mjs --push</string>
  </array>
  <key>StartInterval</key><integer>$((HOURS * 3600))</integer>
  <key>RunAtLoad</key><false/>
  <key>StandardOutPath</key><string>$REPO/data/herald-auto.log</string>
  <key>StandardErrorPath</key><string>$REPO/data/herald-auto.log</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>$(dirname "$NODE"):/usr/bin:/bin:/usr/local/bin</string></dict>
</dict></plist>
PL
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "✓ HERALD scheduled every $HOURS h → $PLIST (log: data/herald-auto.log). Run now: launchctl start com.arcane.herald"
    ;;
  uninstall) launchctl unload "$PLIST" 2>/dev/null || true; rm -f "$PLIST"; echo "✓ HERALD schedule removed" ;;
  status) launchctl list 2>/dev/null | grep -q com.arcane.herald && { echo "scheduled ✓"; tail -5 "$REPO/data/herald-auto.log" 2>/dev/null; } || echo "not scheduled" ;;
esac
