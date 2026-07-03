#!/bin/bash
# Kids Learning Space — macOS launcher.
# Double-click in Finder to open the hub in your default browser.
# No install, no server: it just opens index.html via file://.
#
# Tip: for full silent auto-backup in Firefox/Safari, run a local server
# instead:  python3 -m http.server 8000   then open http://localhost:8000
cd "$(dirname "$0")" || exit 1
open "index.html"
