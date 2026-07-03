#!/bin/bash
# Kids Learning Space — macOS launcher.
# Prefers a local server (http://localhost:8000) so ALL features work, including
# saving the history into a folder and full silent auto-backup in any browser.
# Falls back to opening index.html directly (file://) if Python 3 isn't installed
# (the app still works; only folder-saving needs the server).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  echo "Kids Learning Space is running at http://localhost:8000"
  echo "Keep this window open while you play. Close it to stop the server."
  ( sleep 1; open "http://localhost:8000/index.html" ) &
  exec python3 -m http.server 8000
else
  echo "Python 3 not found — opening the file directly."
  echo "(Folder-saving needs the local server, in Chrome or Edge.)"
  open "index.html"
fi
