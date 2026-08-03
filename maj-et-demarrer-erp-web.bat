@echo off
cd /d "%~dp0"
echo ==========================================
echo ERP RODIS WEB - MISE A JOUR + DEMARRAGE
echo ==========================================
echo.
echo 1. Import Articles
py -3 scripts\import_articles.py
echo.
echo 2. Import Stock
py -3 scripts\import_lots_stock.py
echo.
echo 3. Ouverture du site
start "" http://localhost:3000
"C:\Program Files\nodejs\npm.cmd" run dev -- --webpack
