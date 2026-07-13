param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Word
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$encoded = [uri]::EscapeDataString($Word)
$url = "https://ci3ya8mywk.execute-api.ap-northeast-1.amazonaws.com/default/SLCG-WSearch/_search?index=sign_cg_data&q=(title.keyword:*$encoded*)&from=0&limit=10&sortkey=ruby,title,number&order=asc"

$tempFile = Join-Path $env:TEMP "nhk-lookup-$([Guid]::NewGuid().ToString()).json"
try {
    curl.exe -sL --max-time 60 $url -o $tempFile
    $raw = [System.IO.File]::ReadAllText($tempFile, [System.Text.Encoding]::UTF8)
    $response = $raw | ConvertFrom-Json
} finally {
    if (Test-Path $tempFile) {
        Remove-Item $tempFile -Force
    }
}

if ($response.status -ne 200 -or $response.total -eq 0) {
    Write-Error "No results for '$Word'."
}

function Get-Subdir([int]$Type) {
    switch ($Type) {
        1 { 'jp' }
        2 { 'eng' }
        5 { 'num' }
        6 { 'area' }
        default { 'common' }
    }
}

Write-Output ""
Write-Output "Found $($response.total) result(s) for '$Word':"
Write-Output ""

$index = 0
foreach ($item in $response.result) {
    $index += 1
    $subdir = Get-Subdir ([int]$item.type)
    $entry = [ordered]@{
        lesson = 1
        title = $item.title
        caption = $item.caption
        subdir = $subdir
        code = $item.code
        avatarId = [int]$item.avatarid
    }

    Write-Output "#$index"
    $entry.GetEnumerator() | ForEach-Object {
        if ($_.Value -is [string]) {
            Write-Output "  $($_.Key): '$($_.Value)'"
        } else {
            Write-Output "  $($_.Key): $($_.Value)"
        }
    }
    Write-Output ""
    Write-Output "JSON:"
    Write-Output (($entry | ConvertTo-Json -Compress) -replace '"', "'")
    Write-Output ""
}

Write-Output "Copy one entry into src/data/words.js"
