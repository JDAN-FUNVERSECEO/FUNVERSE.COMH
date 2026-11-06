@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo No encontre Node.js. Instala Node.js y vuelve a abrir este archivo.
  pause
  exit /b 1
)

node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)"
if errorlevel 1 (
  echo FUNVERSE necesita Node.js 18 o posterior. Actualiza Node.js y vuelve a abrir este archivo.
  pause
  exit /b 1
)

if exist "node_modules\nodemailer\package.json" goto dependencies_ready
echo Preparando las dependencias de FUNVERSE...
where npm >nul 2>nul
if errorlevel 1 (
  echo No encontre npm. Reinstala Node.js con npm incluido y vuelve a abrir este archivo.
  pause
  exit /b 1
)
npm install --omit=dev --no-audit --no-fund
if errorlevel 1 (
  echo No pude instalar las dependencias. Comprueba tu conexion e intenta otra vez.
  pause
  exit /b 1
)

:dependencies_ready

echo Comprobando si FUNVERSE ya esta abierto...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3000/'; if ($r.StatusCode -eq 200) { exit 0 } } catch {}; exit 1"
if not errorlevel 1 (
  echo FUNVERSE ya esta activo. Abriendo la pagina.
  start "" "http://127.0.0.1:3000"
  exit /b 0
)

echo Iniciando FUNVERSE y el puente local de FUNSISTANT...
start "FUNVERSE - servidor local" /D "%~dp0" cmd /k node server.js
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready = $false; for ($i = 0; $i -lt 180; $i++) { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 'http://127.0.0.1:3000/'; if ($r.StatusCode -eq 200) { $ready = $true; break } } catch {}; Start-Sleep -Milliseconds 500 }; if ($ready) { Start-Process 'http://127.0.0.1:3000'; exit 0 }; exit 1"
if errorlevel 1 (
  echo FUNVERSE no pudo iniciar en el puerto 3000. Revisa la ventana del servidor para ver el error.
  pause
  exit /b 1
)

echo FUNVERSE esta listo en http://127.0.0.1:3000
exit /b 0
