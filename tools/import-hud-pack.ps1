<#
.SYNOPSIS
  Converts the dungeon HUD layer pack (art-source/ui/dungeon_hud) into game-ready HUD textures.

.DESCRIPTION
  The pack is drawn on a 1664x940 reference canvas with 2-px lines - twice the game's pixel density
  (the game renders at 960x480). For each layer this script:
    1. crops the transparent 1664x940 PNG to its content (crop origin rounded down to even pixels),
    2. halves it by point-sampling every even pixel. Every 2-px line maps to exactly one 1-px line
       (never blurred, never thickened, never dropped). A 1-px grey bevel line inside a block is kept
       ("promoted") when the sampled pixel is the dark panel fill.
  Output:
    public/assets/ui/hud/<layer>.png        cropped, half-resolution layers
    src/ui/hud/hudPack.generated.json       crop data + a BOM-free copy of hud_layout.json

  Re-run after replacing the pack:  powershell -ExecutionPolicy Bypass -File tools/import-hud-pack.ps1
#>
param(
  [string]$Source = (Join-Path $PSScriptRoot '..\art-source\ui\dungeon_hud'),
  [string]$OutImages = (Join-Path $PSScriptRoot '..\public\assets\ui\hud'),
  [string]$OutJson = (Join-Path $PSScriptRoot '..\src\ui\hud\hudPack.generated.json')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Get-Luma([System.Drawing.Color]$c) { return 0.299 * $c.R + 0.587 * $c.G + 0.114 * $c.B }

$layout = Get-Content -Raw -Encoding UTF8 (Join-Path $Source 'hud_layout.json') | ConvertFrom-Json
$refW = [int]$layout.reference_resolution.width
$refH = [int]$layout.reference_resolution.height
New-Item -ItemType Directory -Force $OutImages | Out-Null
New-Item -ItemType Directory -Force (Split-Path $OutJson) | Out-Null

$layers = @()
foreach ($file in $layout.render_order) {
  $path = Join-Path (Join-Path $Source 'layers') $file
  $src = [System.Drawing.Bitmap]::FromFile((Resolve-Path $path))
  if ($src.Width -ne $refW -or $src.Height -ne $refH) { throw "$file is $($src.Width)x$($src.Height), expected ${refW}x${refH}" }

  # Content bounds.
  $minX = $refW; $minY = $refH; $maxX = -1; $maxY = -1
  for ($y = 0; $y -lt $refH; $y++) { for ($x = 0; $x -lt $refW; $x++) {
    if ($src.GetPixel($x, $y).A -gt 0) { if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }; if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y } }
  } }
  if ($maxX -lt 0) { throw "$file is empty" }
  $cx = $minX - ($minX % 2); $cy = $minY - ($minY % 2)
  $w = [int][Math]::Floor(($maxX - $cx) / 2) + 1
  $h = [int][Math]::Floor(($maxY - $cy) / 2) + 1

  $out = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  for ($j = 0; $j -lt $h; $j++) { for ($i = 0; $i -lt $w; $i++) {
    $sx = $cx + 2 * $i; $sy = $cy + 2 * $j
    $p = $src.GetPixel($sx, $sy)
    if ($p.A -gt 0 -and (Get-Luma $p) -lt 50) {
      # Keep a 1-px bevel line that falls on the odd texel of this 2x2 block.
      foreach ($o in @(@(1, 0), @(0, 1), @(1, 1))) {
        $qx = $sx + $o[0]; $qy = $sy + $o[1]
        if ($qx -ge $refW -or $qy -ge $refH) { continue }
        $q = $src.GetPixel($qx, $qy); $l = Get-Luma $q
        if ($q.A -gt 0 -and $l -ge 50 -and $l -lt 200) { $p = $q; break }
      }
    }
    $out.SetPixel($i, $j, $p)
  } }
  $name = [IO.Path]::GetFileNameWithoutExtension($file)
  $out.Save((Join-Path $OutImages "$name.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $out.Dispose(); $src.Dispose()
  $layers += [ordered]@{ id = $name; url = "assets/ui/hud/$name.png"; refX = $cx; refY = $cy; width = $w; height = $h }
  Write-Host ("{0}: crop {1},{2} -> {3}x{4}" -f $name, $cx, $cy, $w, $h)
}

$doc = [ordered]@{
  generatedBy = 'tools/import-hud-pack.ps1 (do not edit by hand)'
  source = 'art-source/ui/dungeon_hud'
  scale = 0.5
  layers = $layers
  layout = $layout
}
$json = $doc | ConvertTo-Json -Depth 10
[IO.File]::WriteAllText((Resolve-Path (Split-Path $OutJson)).Path + '\' + (Split-Path $OutJson -Leaf), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "wrote $OutJson"
