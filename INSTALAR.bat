@echo off
setlocal
cd /d "%~dp0"
chcp 65001 >nul
title StockLocal - Instalacion

echo.
echo  ==========================================
echo    STOCKLOCAL - Instalacion
echo  ==========================================
echo.

where node >nul 2>&1
if errorlevel 1 goto no_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto old_node

if exist "backend\node_modules\express\package.json" goto deps_ok
echo  Instalando componentes. Puede tardar unos minutos...
pushd backend
call npm ci --omit=dev --no-audit --no-fund
if errorlevel 1 call npm install --omit=dev --no-audit --no-fund
popd
if not exist "backend\node_modules\express\package.json" goto npm_fail
:deps_ok

if exist "frontend\dist\index.html" goto ui_ok
echo  Preparando la interfaz...
pushd frontend
call npm ci --no-audit --no-fund
if errorlevel 1 goto npm_fail_pop
call npm run build
if errorlevel 1 goto npm_fail_pop
popd
:ui_ok

node --disable-warning=ExperimentalWarning backend\scripts\install.js
if errorlevel 1 goto fail

echo  Creando acceso directo en el escritorio...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Desktop'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'StockLocal.lnk')); $s.TargetPath=(Join-Path '%~dp0' 'INICIAR.bat'); $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.IconLocation=\"$env:SystemRoot\System32\shell32.dll,43\"; $s.Save()"

echo.
choice /c SN /m "  Abrir StockLocal automaticamente al encender la PC"
if errorlevel 2 goto no_autostart
powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=[Environment]::GetFolderPath('Startup'); $s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $d 'StockLocal.lnk')); $s.TargetPath=(Join-Path '%~dp0' 'INICIAR.bat'); $s.Arguments='--sin-navegador'; $s.WorkingDirectory='%~dp0'; $s.WindowStyle=7; $s.Save()"
:no_autostart

echo.
echo  Listo. Abriendo StockLocal...
call "%~dp0INICIAR.bat"
exit /b 0

:no_node
echo  [ERROR] Falta instalar Node.js.
echo  Se abrira la pagina de descarga: instala la version LTS con las opciones por defecto
echo  y despues volve a ejecutar INSTALAR.bat.
start https://nodejs.org/es/download
pause
exit /b 1

:old_node
echo  [ERROR] La version de Node.js instalada es muy vieja. Se necesita la 22.13 o superior.
echo  Instala la version LTS desde la pagina que se abrira y volve a ejecutar INSTALAR.bat.
start https://nodejs.org/es/download
pause
exit /b 1

:npm_fail_pop
popd
:npm_fail
echo  [ERROR] No se pudieron instalar los componentes. Verifica la conexion a internet
echo  o usa el paquete completo generado con "npm run release".
pause
exit /b 1

:fail
echo  La instalacion no se completo.
pause
exit /b 1
