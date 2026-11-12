param(
    [string]$Source = (Join-Path $PSScriptRoot '../assets/icons/rice-sun-source-v1.png')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$directory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../assets/icons'))
$original = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
try {
    foreach ($size in @(512, 192, 180, 32)) {
        $bitmap = New-Object System.Drawing.Bitmap($size, $size)
        $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
        try {
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.DrawImage($original, 0, 0, $size, $size)
            $target = Join-Path $directory "rice-sun-v1-$size.png"
            $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output $target
        } finally {
            $graphics.Dispose()
            $bitmap.Dispose()
        }
    }
} finally {
    $original.Dispose()
}
