$ErrorActionPreference = 'Stop'

$videosDir = Join-Path $PSScriptRoot '..\videos' | Resolve-Path
$cropFilter = 'crop=538:510:366:66'

$names = @(
  'hokkaido', 'aomori', 'iwate', 'miyagi', 'akita', 'yamagata', 'fukushima',
  'ibaraki', 'tochigi', 'gunma', 'saitama', 'chiba', 'toukyo', 'kanagawa',
  'niigata', 'toyama', 'ishikawa', 'fukui', 'yamanashi', 'nagano', 'gifu',
  'shizuoka', 'aichi', 'mie', 'shiga', 'kyouto', 'oosaka', 'hyougo', 'nara',
  'wakayama', 'tottori', 'shimane', 'okayama', 'hiroshima', 'yamaguchi',
  'tokushima', 'kagawa', 'ehime', 'kouchi', 'fukuoka', 'saga', 'nagasaki',
  'kumamoto', 'ooita', 'miyazaki', 'kagoshima', 'okinawa'
)

function Get-VideoSize([string]$path) {
  $output = & ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 $path 2>$null
  if (-not $output) { return $null }
  $parts = $output.Trim() -split ','
  return @{ Width = [int]$parts[0]; Height = [int]$parts[1] }
}

function Test-IsCropped([string]$path) {
  if (-not (Test-Path $path)) { return $false }
  $size = Get-VideoSize $path
  return $size -and $size.Width -eq 538 -and $size.Height -eq 510
}

# Aichi was cropped earlier into aichi-cropped.webm
$aichiCropped = Join-Path $videosDir 'aichi-cropped.webm'
$aichiOriginal = Join-Path $videosDir 'aichi_original.webm'
$aichiCurrent = Join-Path $videosDir 'aichi.webm'

if (Test-Path $aichiCropped) {
  if ((Test-Path $aichiCurrent) -and -not (Test-Path $aichiOriginal)) {
    Rename-Item $aichiCurrent $aichiOriginal
  }
  if (Test-Path $aichiCurrent) {
    Remove-Item $aichiCurrent
  }
  Rename-Item $aichiCropped 'aichi.webm'
  Write-Host '[aichi] Renamed aichi-cropped.webm -> aichi.webm'
}

$processed = 0
$skipped = 0

foreach ($name in $names) {
  $original = Join-Path $videosDir "${name}_original.webm"
  $output = Join-Path $videosDir "${name}.webm"

  if (-not (Test-Path $original)) {
    if (Test-Path $output) {
      Rename-Item $output $original
      Write-Host "[$name] Renamed to ${name}_original.webm"
    } else {
      Write-Warning "[$name] No source video found, skipping"
      continue
    }
  }

  if (Test-IsCropped $output) {
    Write-Host "[$name] Already cropped, skipping"
    $skipped++
    continue
  }

  $temp = Join-Path $videosDir "${name}.cropping.webm"
  if (Test-Path $temp) { Remove-Item $temp }

  Write-Host "[$name] Cropping..."
  & ffmpeg -y -hide_banner -loglevel error -i $original -vf $cropFilter -c:v libvpx-vp9 -crf 32 -b:v 0 -an $temp
  if ($LASTEXITCODE -ne 0) {
    throw "ffmpeg failed for $name"
  }

  if (Test-Path $output) { Remove-Item $output }
  Rename-Item $temp "${name}.webm"
  Write-Host "[$name] Done"
  $processed++
}

Write-Host "Finished. Cropped: $processed, skipped: $skipped"
