@echo off
cd /d "%~dp0"
echo ==========================================
echo ERP RODIS WEB - DEMARRAGE LOCAL
echo ==========================================
echo.
echo Le site sera disponible ici :
echo http://localhost:3000
echo.
start "" http://localhost:3000
"C:\Program Files\nodejs\npm.cmd" run dev -- --webpack
