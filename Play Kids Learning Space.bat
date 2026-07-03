@echo off
rem Play Kids Learning Space - Windows.
rem Double-click THIS to play with saves written into this folder.
rem Starts a small local server (tools\kls_server.py) so saves land as real files
rem in THIS folder automatically - no browser folder-picker, any browser. Falls
rem back to opening index.html directly (file://) if Python isn't installed
rem (the app still works; only folder-saving needs the server).
cd /d "%~dp0"
set "PYCMD="
where py >nul 2>nul && set "PYCMD=py"
if not defined PYCMD where python >nul 2>nul && set "PYCMD=python"
if defined PYCMD (
  start "" "http://localhost:8000/index.html"
  %PYCMD% tools\kls_server.py 8000
) else (
  echo Python not found - opening the file directly.
  echo (Automatic folder-saving needs the local server. Install Python 3, or
  echo  use Parent page -^> Choose folder... in Chrome/Edge.^)
  start "" "index.html"
)
