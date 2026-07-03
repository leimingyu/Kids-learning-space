@echo off
rem Kids Learning Space - Windows launcher.
rem Prefers a local server (http://localhost:8000) so ALL features work, including
rem saving the history into a folder. Falls back to opening index.html (file://)
rem if Python isn't installed (the app still works; only folder-saving needs it).
cd /d "%~dp0"
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD where python >nul 2>nul && set "PYCMD=python"
if defined PYCMD (
  echo Kids Learning Space is running at http://localhost:8000
  echo Keep this window open while you play. Close it to stop the server.
  start "" "http://localhost:8000/index.html"
  %PYCMD% -m http.server 8000
) else (
  echo Python not found - opening the file directly.
  echo ^(Folder-saving needs the local server, in Chrome or Edge.^)
  start "" "index.html"
)
