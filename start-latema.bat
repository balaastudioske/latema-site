@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install the current LTS release from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if not errorlevel 1 (
  echo Updating installed project dependencies...
  call npm update --ignore-scripts --fetch-timeout=8000 --fetch-retries=0
  if errorlevel 1 echo Dependency update was unavailable; continuing with installed packages.
  echo Preparing the Vercel-ready static site...
  call npm run build:static
  if errorlevel 1 (
    echo Static build failed. Check the error above before starting the preview.
    pause
    exit /b 1
  )
) else (
  echo npm was not found; preparing the static site directly with Node.js.
  node scripts/build-static.mjs
  if errorlevel 1 (
    echo Static build failed. Check the error above before starting the preview.
    pause
    exit /b 1
  )
)
set "LATEMA_PORT="
for /f %%P in ('powershell -NoProfile -File "%~dp0scripts\select-latema-port.ps1"') do set "LATEMA_PORT=%%P"
if not defined LATEMA_PORT (
  echo Could not find an available local port between 4173 and 4190.
  pause
  exit /b 1
)
echo Starting the freshly built static site from dist on port %LATEMA_PORT%...
set "PORT=%LATEMA_PORT%"
set "LATEMA_STATIC_PREVIEW=1"
start "Latema Travels server" /b node server.mjs
set "PORT="
set "LATEMA_STATIC_PREVIEW="
powershell -NoProfile -Command "$ready=$false;for($i=0;$i -lt 16;$i++){try{$f=Invoke-WebRequest -Uri 'http://127.0.0.1:%LATEMA_PORT%/fonts/manrope-latin.woff2' -TimeoutSec 1 -UseBasicParsing;if($f.Headers['Content-Type'] -match 'font/woff2'){$ready=$true;break}}catch{};Start-Sleep -Milliseconds 500};if($ready){exit 0}else{exit 1}"
if errorlevel 1 (
  echo The local preview did not become ready. Check that Node.js can start server.mjs.
  pause
  exit /b 1
)
start "" "http://localhost:%LATEMA_PORT%/?preview=%RANDOM%%RANDOM%"
echo This run is serving the newly built dist folder, not an older running preview.
echo Static deployment files are ready in the dist folder.
echo Keep this window open while using the local demo.
pause
