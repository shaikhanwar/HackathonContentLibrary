# serve.ps1 — minimal static file server for the prototype (no Python/Node needed).
# Usage:  powershell -ExecutionPolicy Bypass -File serve.ps1   then open http://localhost:8099/
param([int]$Port = 8099)
$root = $PSScriptRoot
$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Hackathon Content Library prototype: http://localhost:$Port/  (Ctrl+C to stop)"
$mime = @{ '.html'='text/html'; '.css'='text/css'; '.js'='text/javascript'; '.json'='application/json'; '.svg'='image/svg+xml' }
$dataDir = Join-Path $root 'data-live'

function Send-Json($ctx, $text) {
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($text)
  $ctx.Response.ContentType = 'application/json'
  $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $ctx.Response.Close()
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    $method = $ctx.Request.HttpMethod

    # ---- CSV persistence API (lets the prototype run from blank, stored as CSV on disk) ----
    if ($rel -eq 'api/csv' -and $method -eq 'GET') {
      if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
      $map = [ordered]@{}
      Get-ChildItem $dataDir -Filter *.csv -ErrorAction SilentlyContinue | ForEach-Object {
        $map[$_.BaseName] = [System.IO.File]::ReadAllText($_.FullName)
      }
      $json = if ($map.Count) { $map | ConvertTo-Json -Depth 4 -Compress } else { '{}' }
      Send-Json $ctx $json; continue
    }
    if ($rel -eq 'api/csv' -and $method -eq 'POST') {
      $reader = [System.IO.StreamReader]::new($ctx.Request.InputStream, [System.Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd(); $reader.Close()
      if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Force -Path $dataDir | Out-Null }
      $enc = [System.Text.UTF8Encoding]::new($false)
      $data = $body | ConvertFrom-Json
      foreach ($p in $data.PSObject.Properties) {
        $file = Join-Path $dataDir ("$($p.Name).csv")
        [System.IO.File]::WriteAllText($file, [string]$p.Value, $enc)
      }
      Send-Json $ctx '{"ok":true}'; continue
    }
    if ($rel -eq 'api/csv/reset' -and $method -eq 'POST') {
      if (Test-Path $dataDir) { Get-ChildItem $dataDir -Filter *.csv -ErrorAction SilentlyContinue | Remove-Item -Force }
      Send-Json $ctx '{"ok":true}'; continue
    }

    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $root $rel
    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      $ctx.Response.ContentType = $ct
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("Not found: $rel")
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.Close()
  }
} finally { $listener.Stop() }
