# Isolated Windows launcher checks. Never starts the real app server/browser and
# never writes to the real desktop. Run after build.ps1 on Windows PowerShell.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$launcherName = 'Play Kids Learning Space.exe'
$batchName = 'Play Kids Learning Space.bat'
$launcherPath = Join-Path $repoRoot $launcherName
if (-not [System.IO.File]::Exists($launcherPath)) {
    throw 'Build the launcher with tools/windows-launcher/build.ps1 first.'
}

$tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$fixtureRoot = [System.IO.Path]::GetFullPath((Join-Path $tempParent ('kls-launcher-test-' + [Guid]::NewGuid().ToString('N'))))
$originalPath = $env:PATH
$originalLiteralVariable = $env:KLS_LAUNCHER_LITERAL_TEST
$env:KLS_LAUNCHER_LITERAL_TEST = 'MUST_NOT_EXPAND'
$checks = 0

function Assert-True([bool] $condition, [string] $message) {
    if (-not $condition) { throw $message }
    $script:checks++
}

function Invoke-Launcher([string] $path, [string] $workingDirectory, [string] $arguments = '') {
    $start = New-Object System.Diagnostics.ProcessStartInfo
    $start.FileName = $path
    $start.WorkingDirectory = $workingDirectory
    $start.Arguments = $arguments
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $process = [System.Diagnostics.Process]::Start($start)
    try {
        if (-not $process.WaitForExit(5000)) {
            $process.Kill()
            throw 'The fixture launcher did not finish within five seconds.'
        }
        return $process.ExitCode
    } finally {
        $process.Dispose()
    }
}

function Wait-ForMarker([string] $path) {
    $timeout = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timeout.ElapsedMilliseconds -lt 5000) {
        if ([System.IO.File]::Exists($path)) {
            # A completed write has the working directory and arguments lines.
            try {
                $lines = [System.IO.File]::ReadAllLines($path)
                if ($lines.Length -ge 2) { return ,$lines }
            } catch [System.IO.IOException] { }
        }
        Start-Sleep -Milliseconds 50
    }
    throw ('The fixture batch file did not produce its marker: ' + $path)
}

function New-Fixture([string] $directoryName) {
    $directory = Join-Path $fixtureRoot $directoryName
    [System.IO.Directory]::CreateDirectory((Join-Path $directory 'tools')) | Out-Null
    Copy-Item -LiteralPath $launcherPath -Destination (Join-Path $directory $launcherName)
    [System.IO.File]::WriteAllText((Join-Path $directory 'index.html'), '<!doctype html><title>Launcher test</title>')
    [System.IO.File]::WriteAllText((Join-Path $directory 'tools/kls_server.py'), '# Placeholder; never execute.')
    # Quotes keep ampersands/parentheses in the current directory inert. The
    # batch file records arguments but never runs them as commands.
    $stub = "@echo off`r`nsetlocal DisableDelayedExpansion`r`n`"%SystemRoot%\System32\chcp.com`" 65001 >nul`r`n>launch-marker.txt echo `"%cd%`"`r`n>>launch-marker.txt echo args=[%*]`r`nexit /b 0`r`n"
    [System.IO.File]::WriteAllText((Join-Path $directory $batchName), $stub, [System.Text.Encoding]::ASCII)
    return $directory
}

try {
    [System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
    $unrelatedDirectory = Join-Path $fixtureRoot 'Unrelated working directory'
    [System.IO.Directory]::CreateDirectory($unrelatedDirectory) | Out-Null

    # Relocation, shell metacharacters, Unicode, and percent-shaped folder names.
    # Construct Unicode by code point so this source also runs on Windows PS 5.1
    # without requiring a UTF-8 BOM.
    $unicodeName = ([string][char]0x5B69) + [char]0x5B50
    $folderNames = @(
        'Kids Learning Space moved',
        ('Kids & family (moved) ' + $unicodeName),
        ('Kids %KLS_LAUNCHER_LITERAL_TEST% (100%) & ' + $unicodeName)
    )
    $specialFixture = $null
    $launchFailures = @()
    foreach ($folderName in $folderNames) {
        try {
            $fixture = New-Fixture $folderName
            $fixtureExe = Join-Path $fixture $launcherName
            $marker = Join-Path $fixture 'launch-marker.txt'
            $code = Invoke-Launcher $fixtureExe $unrelatedDirectory '--check'
            Assert-True ($code -eq 0) ('Valid fixture failed --check: ' + $folderName)
            Assert-True (-not [System.IO.File]::Exists($marker)) '--check must not launch the batch file.'
            $code = Invoke-Launcher $fixtureExe $unrelatedDirectory
            Assert-True ($code -eq 0) ('Relocated launcher failed: ' + $folderName)
            $lines = Wait-ForMarker $marker
            Assert-True ($lines[0].Trim('"') -ceq $fixture) ('Incorrect batch working directory: ' + $folderName)
            Assert-True ($lines[1] -ceq 'args=[]') 'The launcher must not forward arguments to the batch file.'
            if ($folderName.Contains('%KLS_LAUNCHER_LITERAL_TEST%')) { $specialFixture = $fixture }
            Write-Host ('PASS relocated launch: ' + $folderName)
        } catch {
            $launchFailures += $_.Exception.Message
            Write-Host ('FAIL relocated launch: ' + $folderName)
        }
    }

    # Every required file is checked independently, without interactive dialogs.
    foreach ($missing in @($batchName, 'index.html', 'tools/kls_server.py')) {
        $fixture = New-Fixture ('Missing dependency ' + $checks)
        Remove-Item -LiteralPath (Join-Path $fixture $missing)
        $code = Invoke-Launcher (Join-Path $fixture $launcherName) $unrelatedDirectory '--check'
        Assert-True ($code -eq 2) ('Missing dependency must return 2: ' + $missing)
        Assert-True (-not [System.IO.File]::Exists((Join-Path $fixture 'launch-marker.txt'))) 'A failed check must not launch anything.'
    }
    Write-Host 'PASS dependency checks are non-interactive.'

    # Call the exact shortcut implementation used by --create-shortcut, but give
    # it a fixture destination instead of the user desktop. Preserve a collision.
    $assembly = [System.Reflection.Assembly]::LoadFile($launcherPath)
    $launcherType = $assembly.GetType('KidsLearningSpace.Launcher', $true)
    $createShortcut = $launcherType.GetMethod('CreateShortcut', [System.Reflection.BindingFlags]'Public, Static')
    Assert-True ($null -ne $createShortcut) 'The shortcut method is missing.'
    $shortcutDirectory = Join-Path $fixtureRoot 'Shortcut output'
    [System.IO.Directory]::CreateDirectory($shortcutDirectory) | Out-Null
    $existingShortcut = Join-Path $shortcutDirectory 'Play Kids Learning Space.lnk'
    [System.IO.File]::WriteAllText($existingShortcut, 'Keep this existing shortcut unchanged.')
    $shortcutPath = [string]$createShortcut.Invoke($null, [object[]]@($launcherPath.ToString(), $shortcutDirectory.ToString()))
    Assert-True ([System.IO.File]::Exists($shortcutPath)) 'Shortcut was not created.'
    Assert-True ($shortcutPath -cne $existingShortcut) 'An existing shortcut must not be overwritten.'
    Assert-True ([System.IO.File]::ReadAllText($existingShortcut) -ceq 'Keep this existing shortcut unchanged.') 'Existing shortcut content changed.'
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $null
    try {
        $shortcut = $shell.CreateShortcut($shortcutPath)
        Assert-True ($shortcut.TargetPath -ieq $launcherPath) 'Shortcut must target the executable.'
        Assert-True ($shortcut.WorkingDirectory -ieq $repoRoot) 'Shortcut must use the project folder.'
        Assert-True ($shortcut.Arguments -eq '') 'Shortcut must not add command arguments.'
        Assert-True ($shortcut.IconLocation -ieq ($launcherPath + ',0')) 'Shortcut must use the embedded icon.'
    } finally {
        if ($null -ne $shortcut) { [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) }
        [void][System.Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
    }
    Write-Host 'PASS isolated shortcut target, icon, and collision handling.'

    if ($null -ne $specialFixture) {
        $specialExe = Join-Path $specialFixture $launcherName
        $specialShortcut = [string]$createShortcut.Invoke($null, [object[]]@($specialExe.ToString(), $shortcutDirectory.ToString()))
        Assert-True ([System.IO.Path]::GetFileName($specialShortcut) -ceq 'Play Kids Learning Space (3).lnk') 'Repeated shortcut creation must choose the next unused filename.'
        $marker = Join-Path $specialFixture 'launch-marker.txt'
        Remove-Item -LiteralPath $marker
        $linkStart = New-Object System.Diagnostics.ProcessStartInfo
        $linkStart.FileName = $specialShortcut
        $linkStart.WorkingDirectory = $unrelatedDirectory
        $linkStart.UseShellExecute = $true
        $linkStart.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Minimized
        $linkProcess = [System.Diagnostics.Process]::Start($linkStart)
        if ($null -ne $linkProcess) { $linkProcess.Dispose() }
        $lines = Wait-ForMarker $marker
        Assert-True ($lines[0].Trim('"') -ceq $specialFixture) 'Shortcut launch must preserve the relocated special-character project path.'
        Assert-True ($lines[1] -ceq 'args=[]') 'Shortcut launch must not forward arguments.'
        Write-Host 'PASS real shortcut launch into isolated relocated fixture.'
    }

    # Verify the exe carries the illustrated icon, rather than the generic app
    # icon, using its opaque teal background and orange fox colors.
    Add-Type -AssemblyName System.Drawing
    $icon = [System.Drawing.Icon]::ExtractAssociatedIcon($launcherPath)
    Assert-True ($null -ne $icon) 'The executable has no extractable icon.'
    $bitmap = $null
    try {
        $bitmap = $icon.ToBitmap()
        $tealPixels = 0
        $orangePixels = 0
        for ($y = 0; $y -lt $bitmap.Height; $y++) {
            for ($x = 0; $x -lt $bitmap.Width; $x++) {
                $color = $bitmap.GetPixel($x, $y)
                if ($color.A -lt 200) { continue }
                if ($color.G -gt $color.R * 1.5 -and $color.B -gt $color.R * 1.5) { $tealPixels++ }
                if ($color.R -gt 190 -and $color.G -gt 60 -and $color.G -lt 190 -and $color.B -lt 150) { $orangePixels++ }
            }
        }
        Assert-True ($tealPixels -gt 10 -and $orangePixels -gt 10) 'Expected teal and orange Pip artwork in the embedded icon.'
    } finally {
        if ($null -ne $bitmap) { $bitmap.Dispose() }
        $icon.Dispose()
    }
    Write-Host 'PASS embedded Pip icon.'

    # Exercise the original production batch logic with a harmless fake Python
    # launcher. This verifies the thin exe keeps the save-server launch contract.
    $fakePythonDirectory = Join-Path $fixtureRoot 'Fake Python'
    [System.IO.Directory]::CreateDirectory($fakePythonDirectory) | Out-Null
    $fakePythonPath = Join-Path $fakePythonDirectory 'py.exe'
    $fakePythonSource = @'
using System;
using System.IO;
public static class KlsLauncherTestPython {
    public static void Main(string[] args) {
        File.WriteAllLines("python-branch-marker.txt", new string[] {
            Environment.CurrentDirectory, string.Join("|", args)
        });
    }
}
'@
    Add-Type -TypeDefinition $fakePythonSource -Language CSharp -OutputAssembly $fakePythonPath -OutputType ConsoleApplication
    Assert-True ([System.IO.File]::Exists($fakePythonPath)) 'The harmless Python fixture was not compiled.'
    $fixture = New-Fixture 'Original batch contract'
    Copy-Item -LiteralPath (Join-Path $repoRoot $batchName) -Destination (Join-Path $fixture $batchName) -Force
    $env:PATH = $fakePythonDirectory + ';' + $originalPath
    $code = Invoke-Launcher (Join-Path $fixture $launcherName) $unrelatedDirectory
    Assert-True ($code -eq 0) 'The original batch launch failed.'
    $lines = Wait-ForMarker (Join-Path $fixture 'python-branch-marker.txt')
    Assert-True ($lines[0] -ceq $fixture) 'The Python branch must keep the project working directory.'
    Assert-True ($lines[1] -ceq '-3|tools\kls_server.py|8000|--open') 'The Python/save-server arguments changed.'
    Write-Host 'PASS original batch save-server contract, using fake Python only.'

    # Keep the production Python detection and fallback branch intact. Substitute
    # only the final browser-opening leaf with a marker, and make every `where`
    # lookup fail through an isolated stub so no installed Python can start.
    $fakeWhereDirectory = Join-Path $fixtureRoot 'No Python tools'
    [System.IO.Directory]::CreateDirectory($fakeWhereDirectory) | Out-Null
    $fakeWherePath = Join-Path $fakeWhereDirectory 'where.exe'
    Add-Type -TypeDefinition 'public static class KlsLauncherTestWhere { public static int Main(string[] args) { return 1; } }' -Language CSharp -OutputAssembly $fakeWherePath -OutputType ConsoleApplication
    Assert-True ([System.IO.File]::Exists($fakeWherePath)) 'The harmless where fixture was not compiled.'
    $originalBatch = [System.IO.File]::ReadAllText((Join-Path $repoRoot $batchName))
    $browserLeaf = '  start "" "index.html"'
    Assert-True ($originalBatch.Contains($browserLeaf)) 'Expected the original batch browser fallback leaf.'
    $markerLeaf = "  `"%SystemRoot%\System32\chcp.com`" 65001 >nul`r`n  >fallback-marker.txt echo `"%cd%`"`r`n  >>fallback-marker.txt echo target=index.html"
    $fixture = New-Fixture 'Original batch no Python fallback'
    [System.IO.File]::WriteAllText((Join-Path $fixture $batchName), $originalBatch.Replace($browserLeaf, $markerLeaf), [System.Text.Encoding]::ASCII)
    $env:PATH = $fakeWhereDirectory
    $code = Invoke-Launcher (Join-Path $fixture $launcherName) $unrelatedDirectory
    Assert-True ($code -eq 0) 'The no-Python fallback launch failed.'
    $lines = Wait-ForMarker (Join-Path $fixture 'fallback-marker.txt')
    Assert-True ($lines[0].Trim('"') -ceq $fixture) 'The fallback must keep the project working directory.'
    Assert-True ($lines[1] -ceq 'target=index.html') 'The fallback must still open the project index.'
    Write-Host 'PASS original no-Python fallback, with only browser leaf stubbed.'

    if ($launchFailures.Count -gt 0) { throw ($launchFailures -join [Environment]::NewLine) }
    Write-Host ('Windows launcher checks passed (' + $checks + ' assertions). No real browser, server, or desktop writes.')
} finally {
    $env:PATH = $originalPath
    $env:KLS_LAUNCHER_LITERAL_TEST = $originalLiteralVariable
    # This is the sole recursive delete. Verify the final absolute target is the
    # task-created GUID folder directly below the original system temp directory.
    $resolvedTarget = [System.IO.Path]::GetFullPath($fixtureRoot).TrimEnd('\')
    $resolvedParent = [System.IO.Path]::GetDirectoryName($resolvedTarget)
    $expectedName = [System.IO.Path]::GetFileName($resolvedTarget)
    if ($resolvedParent.TrimEnd('\') -ine $tempParent.TrimEnd('\') -or
        $expectedName -notmatch '^kls-launcher-test-[0-9a-f]{32}$') {
        throw 'Refusing fixture cleanup outside the verified task-created temp folder.'
    }
    if ([System.IO.Directory]::Exists($resolvedTarget)) {
        Remove-Item -LiteralPath $resolvedTarget -Recurse -Force
    }
}
