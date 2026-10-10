@echo off
rem Sauvegarde de l'ERP sur cet ordinateur (donnees + fichiers joints) - double-clic pour la lancer a la main.
rem Elle est aussi lancee automatiquement chaque soir par la tache planifiee "Sauvegarde ERP Rodis".
cd /d "%~dp0..\.."
"C:\Program Files\nodejs\node.exe" scripts\sauvegarde\sauvegarde-erp.mjs
if "%1"=="auto" exit /b %errorlevel%
echo.
echo Appuyez sur une touche pour fermer...
pause >nul
