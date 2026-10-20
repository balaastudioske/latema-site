$ErrorActionPreference = 'SilentlyContinue'

for ($candidate = 4173; $candidate -le 4190; $candidate++) {
  $listener = $null
  try {
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, $candidate)
    $listener.Start()
    $listener.Stop()
    Write-Output $candidate
    exit 0
  } catch {
    if ($listener) { $listener.Stop() }
  }
}

exit 1
