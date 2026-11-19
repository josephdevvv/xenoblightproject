<#
.SYNOPSIS
  Converts the Moonsteel status UI kit (art-source/ui/status_moonsteel) into game-ready textures.

.DESCRIPTION
  The kit is a 480x270 canvas with 1-px lines - the game's own pixel density - so layers are used
  at 1:1 (no resampling). Each transparent full-canvas layer is cropped to its content.
  Output:
    public/assets/ui/status/<layer>.png        cropped layers (pixels unchanged)
    src/ui/status/statusKit.generated.json     canvas size + crop offsets, in render order

  Re-run after replacing the kit:  powershell -ExecutionPolicy Bypass -File tools/import-status-kit.ps1
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot '..\art-source\ui\status_moonsteel'),
  [string]$OutImages = (Join-Path $PSScriptRoot '..\public\assets\ui\status'),
  [string]$OutJson = (Join-Path $PSScriptRoot '..\src\ui\status\statusKit.generated.json')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force $OutImages | Out-Null
New-Item -ItemType Directory -Force (Split-Path $OutJson) | Out-Null

# Render order = file name order (01_window_frame ... 06_accents), as listed in the kit README.
$files = Get-ChildItem (Join-Path $Source 'layers') -Filter '*.png' | Sort-Object Name
$canvasW = 0; $canvasH = 0
$layers = @()
foreach ($f in $files) {
  $src = [System.Drawing.Bitmap]::FromFile($f.FullName)
  if ($canvasW -eq 0) { $canvasW = $src.Width; $canvasH = $src.Height }
  if ($src.Width -ne $canvasW -or $src.Height -ne $canvasH) { throw "$($f.Name) does not match the ${canvasW}x${canvasH} canvas" }
  $minX = $canvasW; $minY = $canvasH; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $canvasH; $y++) { for ($x = 0; $x -lt $canvasW; $x++) {
    if ($src.GetPixel($x, $y).A -gt 0) { if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } }
  } }
  if ($maxX -lt 0) { throw "$($f.Name) is empty" }
  $w = $maxX - $minX + 1; $h = $maxY - $minY + 1
  $crop = $src.Clone((New-Object System.Drawing.Rectangle $minX, $minY, $w, $h), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $id = $f.BaseName
  $crop.Save((Join-Path $OutImages "$id.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $crop.Dispose(); $src.Dispose()
  $layers += [ordered]@{ id = $id; url = "assets/ui/status/$id.png"; x = $minX; y = $minY; width = $w; height = $h }
  Write-Host ("{0}: {1},{2} {3}x{4}" -f $id, $minX, $minY, $w, $h)
}
$doc = [ordered]@{
  generatedBy = 'tools/import-status-kit.ps1 (do not edit by hand)'
  source = 'art-source/ui/status_moonsteel'
  canvas = [ordered]@{ width = $canvasW; height = $canvasH }
  layers = $layers
}
$out = Join-Path (Resolve-Path (Split-Path $OutJson)).Path (Split-Path $OutJson -Leaf)
[IO.File]::WriteAllText($out, ($doc | ConvertTo-Json -Depth 6), (New-Object System.Text.UTF8Encoding($false)))
Write-Host "wrote $out"
