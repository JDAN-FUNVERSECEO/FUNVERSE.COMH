param([string]$Destination)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = $PSScriptRoot
$source = Join-Path $projectRoot 'assets'
if (-not (Test-Path -LiteralPath $source -PathType Container)) { throw "No encontré assets: $source" }
$files = @(Get-ChildItem -LiteralPath $source -Recurse -File | Where-Object { $_.Extension -notin @('.gguf', '.jinja') -and $_.Name -notmatch 'FUNSISTANT|FUN-CODER' })
if ($files.Count -eq 0) { throw 'No hay recursos para exportar dentro de assets.' }
if ([string]::IsNullOrWhiteSpace($Destination)) { $Destination = Join-Path $projectRoot ('funverse-recursos-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip') }
else { $Destination = [IO.Path]::GetFullPath($Destination) }
if (Test-Path -LiteralPath $Destination) { throw 'El archivo de destino ya existe; elige otro nombre para no sobrescribirlo.' }
$parent = Split-Path -Parent $Destination
if (-not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
$archive = [IO.Compression.ZipFile]::Open($Destination, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($source.Length).TrimStart([char[]]@('\', '/')).Replace('\', '/')
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $relative, [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
Write-Output ('Exporté ' + $files.Count + ' recursos con sus subcarpetas a: ' + $Destination)