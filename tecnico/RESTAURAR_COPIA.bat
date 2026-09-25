@echo off
cd /d "%~dp0.."
chcp 65001 >nul
title StockLocal - Herramientas del tecnico
node --disable-warning=ExperimentalWarning backend\scripts\tecnico.js restaurar
pause
