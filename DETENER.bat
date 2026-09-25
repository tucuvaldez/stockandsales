@echo off
cd /d "%~dp0"
chcp 65001 >nul
node backend\scripts\iniciar.js --detener
timeout /t 3 >nul
