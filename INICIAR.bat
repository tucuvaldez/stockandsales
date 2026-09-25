@echo off
cd /d "%~dp0"
chcp 65001 >nul
title StockLocal
where node >nul 2>&1
if errorlevel 1 goto no_node
node backend\scripts\iniciar.js %*
if errorlevel 1 pause
exit /b 0

:no_node
echo  Node.js no esta instalado. Ejecuta INSTALAR.bat
pause
exit /b 1
