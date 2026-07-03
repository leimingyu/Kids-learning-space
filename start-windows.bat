@echo off
rem Kids Learning Space - Windows launcher.
rem Double-click to open the hub in your default browser.
rem No install, no server: it just opens index.html via file://.
rem
rem Tip: for full silent auto-backup in Firefox, run a local server instead:
rem   py -m http.server 8000    then open http://localhost:8000
cd /d "%~dp0"
start "" "index.html"
