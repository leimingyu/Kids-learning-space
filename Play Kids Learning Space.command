#!/bin/bash
# Play Kids Learning Space — macOS.
# Double-click THIS to play with saves written into this folder.
# Starts a small local server (tools/kls_server.py) so saves land as real files
# in THIS folder automatically — no browser folder-picker, any browser. Falls
# back to opening index.html directly (file://) if Python 3 isn't installed
# (the app still works; only folder-saving needs the server).
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1; then
  ( sleep 1; open "http://localhost:8000/index.html" ) &
  exec python3 tools/kls_server.py 8000
else
  echo "Python 3 not found — opening the file directly."
  echo "(Automatic folder-saving needs the local server. Install Python 3, or"
  echo " use Parent page → Choose folder… in Chrome/Edge.)"
  open "index.html"
fi
