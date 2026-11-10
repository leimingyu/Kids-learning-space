param([switch]$SkipIcon)
$ErrorActionPreference = 'Stop'
if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) {
    throw 'Build the Windows launcher on Windows. The games themselves still need no build.'
}
$launcherRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe'
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) {
    throw 'The .NET Framework C# compiler was not found. The existing batch launcher still works.'
}
if (-not $SkipIcon) { & (Join-Path $PSScriptRoot 'build-icon.ps1') }
$launcherIcon = Join-Path $launcherRoot 'shared/assets/kids-learning-space.ico'
$launcherOutput = Join-Path $launcherRoot 'Play Kids Learning Space.exe'
$compilerArgs = @(
    '/nologo', '/target:winexe', '/platform:anycpu', '/optimize+',
    '/reference:System.Windows.Forms.dll',
    ('/out:' + $launcherOutput), ('/win32icon:' + $launcherIcon),
    ('/win32manifest:' + (Join-Path $PSScriptRoot 'launcher.manifest')),
    (Join-Path $PSScriptRoot 'Launcher.cs')
)
& $compiler @compilerArgs
if ($LASTEXITCODE -ne 0) { throw 'The Windows launcher build failed.' }
Write-Output ('Built: ' + $launcherOutput)
