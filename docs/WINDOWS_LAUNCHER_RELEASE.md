# Windows fox-icon launcher

The root **Play Kids Learning Space.exe** is a small Windows launcher using
Pip's face on a teal tile. Keep it in the complete game folder. Windows 10/11's
.NET Framework runtime runs it; the games themselves still have no build step.

## Behavior and compatibility

- The EXE finds its own folder and starts the original batch launcher from
  that folder, with its console minimized. Restore that console to inspect or
  stop the server. Leave it running while playing.
- The existing batch file, macOS launcher, Python server, browser origin,
  port 8000, profile keys, backup format, and saved_status location are unchanged.
- The existing Python detection, same-folder server reuse, browser-open order,
  conflict handling, and direct-file fallback stay in the original launcher.
  Python is not bundled; automatic folder backups still require Python 3.
- The EXE uses an asInvoker manifest and does not request administrator access.
  It is a locally compiled, unsigned executable with its source included.
- Moving the whole local game folder is supported. Copying just the EXE is not; a
  clear missing-file message points back to the full folder or original BAT.
- **Create Kids Learning Space Shortcut.bat** explicitly creates a desktop
  shortcut using the EXE's embedded icon. Existing filenames are preserved; an
  additional shortcut gets a numbered filename. After moving the game folder,
  recreate its desktop shortcut. No machine-specific .lnk is stored in Git.

## Files and build

- `tools/windows-launcher/Launcher.cs`: Windows entry point and shortcut
  helper. No game, storage, HTTP or Python logic is duplicated here.
- `tools/windows-launcher/launcher.manifest`: runs as the current user.
- `tools/windows-launcher/build.ps1`: compiles with the local .NET Framework
  compiler, without downloading dependencies.
- `tools/windows-launcher/build-icon.ps1`: draws the existing Pip palette into
  a seven-size ICO (16, 24, 32, 48, 64, 128, 256px) and a 512px PNG preview.
- `shared/assets/kids-learning-space.ico`: embedded Windows icon resource.
- `shared/assets/kids-learning-space-icon.png`: preview of the icon.

From PowerShell on Windows:

```powershell
./tools/windows-launcher/build.ps1
./tools/windows-launcher/test-launcher.ps1
```

The read-only diagnostic `Play Kids Learning Space.exe --check` returns 0 when
the required game files are together and 2 when a file is missing. It never
opens a browser or starts a server. Normal play needs no arguments.

## Verification

Launcher checks run against disposable folders, not family profiles, desktop
shortcuts or the real server on port 8000. They check relocation and working
directory, no forwarded arguments, required files, embedded icon decoding,
shortcut metadata and existing-link preservation. The original server's tests
also exercise backup durability, restore reads, browser-open ordering and
same-folder server reuse.

Executed on Windows on November 7, 2026:

- 43 launcher assertions passed: moved folders with spaces, ampersands,
  parentheses, Chinese text and literal percent sequences; dependency checks;
  native shortcut creation, collision preservation and actual shortcut launch;
  embedded icon decoding; the original Python branch and isolated no-Python
  fallback. The fallback test replaces only the final browser-open action with
  a marker in a disposable copy, so no real browser or server is started.
- All 31 Python server tests passed, covering backup durability and the existing
  launcher/server contract.
- Shared save-session, backup snapshot, dashboard and game-startup suites passed.
- The original .bat, .command and kls_server.py have no changes.

Windows supplies the shortcut through its native Shell Link interface. Paths
are stored as file identifiers to retain literal percent characters. The fixed
batch command receives the game folder separately as its working directory;
folder names are not inserted into shell command text.
