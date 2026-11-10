# Rebuild the Pip launcher icon using only Windows PowerShell and System.Drawing.
# This is a face-only adaptation of shared/assets/mascot.svg, not a new mascot.
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$assetDirectory = Join-Path $repoRoot 'shared/assets'
[System.IO.Directory]::CreateDirectory($assetDirectory) | Out-Null

function New-PipBitmap([int] $size) {
    # Supersampling keeps the silhouette and eyes smooth, including at 16px.
    $renderSize = [Math]::Max(512, $size * 4)
    $surface = New-Object System.Drawing.Bitmap($renderSize, $renderSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $canvas = [System.Drawing.Graphics]::FromImage($surface)
    $canvas.Clear([System.Drawing.Color]::Transparent)
    $canvas.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $canvas.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $canvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $canvas.ScaleTransform([single]($renderSize / 200.0), [single]($renderSize / 200.0))

    $teal = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#117C7A'))
    $fur = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FF8A65'))
    $cream = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFF0E1'))
    $pink = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFB39C'))
    $ink = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#2D3436'))
    $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $mouthPen = New-Object System.Drawing.Pen($ink, 2.4)
    $mouthPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $mouthPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $face = New-Object System.Drawing.Drawing2D.GraphicsPath
    $mouth = New-Object System.Drawing.Drawing2D.GraphicsPath

    try {
        # A quiet teal tile has transparent corners and no lettering.
        $tile.AddArc(6, 6, 72, 72, 180, 90)
        $tile.AddArc(122, 6, 72, 72, 270, 90)
        $tile.AddArc(122, 122, 72, 72, 0, 90)
        $tile.AddArc(6, 122, 72, 72, 90, 90)
        $tile.CloseFigure()
        $canvas.FillPath($teal, $tile)

        # Pip's rounded head and two upright ears, enlarged for small icons.
        $canvas.FillEllipse($fur, 34, 51, 132, 118)
        $canvas.FillPolygon($fur, [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF(44, 30)),
            (New-Object System.Drawing.PointF(52, 100)),
            (New-Object System.Drawing.PointF(91, 65))))
        $canvas.FillPolygon($fur, [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF(156, 30)),
            (New-Object System.Drawing.PointF(148, 100)),
            (New-Object System.Drawing.PointF(109, 65))))
        $canvas.FillPolygon($pink, [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF(53, 49)),
            (New-Object System.Drawing.PointF(58, 81)),
            (New-Object System.Drawing.PointF(76, 65))))
        $canvas.FillPolygon($pink, [System.Drawing.PointF[]]@(
            (New-Object System.Drawing.PointF(147, 49)),
            (New-Object System.Drawing.PointF(142, 81)),
            (New-Object System.Drawing.PointF(124, 65))))

        # Curved cream muzzle follows the existing curious pose.
        $face.StartFigure()
        $face.AddBezier(55, 114, 85, 143, 115, 143, 145, 114)
        $face.AddBezier(145, 114, 130, 154, 114, 161, 100, 161)
        $face.AddBezier(100, 161, 86, 161, 70, 154, 55, 114)
        $face.CloseFigure()
        $canvas.FillPath($cream, $face)

        # Bigger open eyes remain recognizable in Explorer's small-icon view.
        $canvas.FillEllipse($ink, 69, 98, 16, 16)
        $canvas.FillEllipse($ink, 115, 98, 16, 16)
        $canvas.FillEllipse($white, 77, 100, 5.5, 5.5)
        $canvas.FillEllipse($white, 123, 100, 5.5, 5.5)
        $canvas.FillEllipse($ink, 94, 127, 12, 8)
        $mouth.StartFigure()
        $mouth.AddBezier(100, 135, 100, 143, 96, 144, 92, 144)
        $mouth.StartFigure()
        $mouth.AddBezier(100, 135, 100, 143, 104, 144, 108, 144)
        $canvas.DrawPath($mouthPen, $mouth)

        $result = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
        $outputCanvas = [System.Drawing.Graphics]::FromImage($result)
        try {
            $outputCanvas.Clear([System.Drawing.Color]::Transparent)
            $outputCanvas.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $outputCanvas.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $outputCanvas.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $outputCanvas.DrawImage($surface, (New-Object System.Drawing.Rectangle(0, 0, $size, $size)))
        } finally {
            $outputCanvas.Dispose()
        }
        return $result
    } finally {
        $tile.Dispose(); $face.Dispose(); $mouth.Dispose(); $mouthPen.Dispose()
        $teal.Dispose(); $fur.Dispose(); $cream.Dispose(); $pink.Dispose(); $ink.Dispose(); $white.Dispose()
        $canvas.Dispose(); $surface.Dispose()
    }
}

$preview = New-PipBitmap 512
try {
    $preview.Save((Join-Path $assetDirectory 'kids-learning-space-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
    $preview.Dispose()
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = @()
foreach ($size in $sizes) {
    $bitmap = New-PipBitmap $size
    $pngStream = New-Object System.IO.MemoryStream
    try {
        $bitmap.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        $frames += ,$pngStream.ToArray()
    } finally {
        $pngStream.Dispose(); $bitmap.Dispose()
    }
}

# ICO directory, followed by independent lossless RGBA PNG images. A dimension
# byte of zero means 256px in the ICO format (supported on Windows Vista+).
$iconPath = Join-Path $assetDirectory 'kids-learning-space.ico'
$file = [System.IO.File]::Create($iconPath)
$writer = New-Object System.IO.BinaryWriter($file)
try {
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$sizes.Count)
    $offset = 6 + 16 * $sizes.Count
    for ($index = 0; $index -lt $sizes.Count; $index++) {
        $dimension = if ($sizes[$index] -eq 256) { 0 } else { $sizes[$index] }
        $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
        $writer.Write([byte]0); $writer.Write([byte]0)
        $writer.Write([uint16]1); $writer.Write([uint16]32)
        $writer.Write([uint32]$frames[$index].Length)
        $writer.Write([uint32]$offset)
        $offset += $frames[$index].Length
    }
    foreach ($frame in $frames) { $writer.Write([byte[]]$frame) }
} finally {
    $writer.Dispose(); $file.Dispose()
}
Write-Host 'Built Pip icon: 16, 24, 32, 48, 64, 128, 256px; PNG preview: 512px.'
