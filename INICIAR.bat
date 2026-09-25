@echo off
title StockLocal
color 0A
echo.
echo  ==========================================
echo   STOCKLOCAL - Instalacion y arranque
echo  ==========================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo  [ERROR] Node.js no esta instalado.
    echo  Descargar en: https://nodejs.org
    echo  Luego vuelve a abrir este archivo.
    pause & exit /b 1
)

if not exist "backend\.env" (
    echo  Configuracion inicial del backend...
    copy "backend\.env.example" "backend\.env" >nul
)

:MODE_CHOICE
cls
echo.
echo  Elegi el modo de uso del sistema:
echo  [1] Local - gestion de stock y ventas simple
echo   [2] Facturacion - incluye tipo A, B, C, consumidor final y modulo de facturacion
set /p MODE="Opcion [1/2]: "
if "%MODE%"=="" set MODE=1
if /I "%MODE%"=="1" set APP_MODE=local
if /I "%MODE%"=="2" set APP_MODE=facturacion
if /I "%MODE%"=="local" set APP_MODE=local
if /I "%MODE%"=="facturacion" set APP_MODE=facturacion
if /I "%MODE%"=="billing" set APP_MODE=facturacion
if "%APP_MODE%"=="" (
    echo  Opcion invalida.
    timeout /t 2 /nobreak >nul
    goto MODE_CHOICE
)

powershell -NoProfile -Command "$p = Get-Content 'backend\.env' -Raw; $p = ($p -replace 'APP_MODE=.*','APP_MODE=' + '%APP_MODE%'); Set-Content 'backend\.env' $p"

if not exist "backend\node_modules" (
    echo  Instalando dependencias del backend (solo la primera vez)...
    cd backend & call npm install & cd ..
)
if not exist "frontend\node_modules" (
    echo  Instalando dependencias del frontend (solo la primera vez)...
    cd frontend & call npm install & cd ..
)

echo  Iniciando backend...
start "StockLocal Backend" cmd /k "cd backend && node server.js"
timeout /t 3 /nobreak >nul

echo  Iniciando frontend...
start "StockLocal Frontend" cmd /k "cd frontend && npx vite"
timeout /t 4 /nobreak >nul

echo  Abriendo el sistema en el navegador...
start http://localhost:3000

echo.
echo  Sistema iniciado en modo: %APP_MODE%
echo  Si la base MongoDB no esta corriendo, arrancala primero.
echo  Luego abrira la app en el navegador.
echo.
pause
