@echo off
setlocal EnableExtensions
title Xenoblight - Dev Server

rem Always run from the folder this file lives in (works with spaces in the path).
cd /d "%~dp0"

echo ============================================
echo   XENOBLIGHT - Development Server
echo ============================================
echo.

if not exist "package.json" (
  echo [ERROR] package.json was not found in "%CD%".
  echo         Keep Start.bat in the project root folder.
  goto :fail
)

rem --- Node.js / npm ------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js is not installed or is not on PATH.
  echo         Install the LTS version from https://nodejs.org then run Start.bat again.
  goto :fail
)
where npm >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js from https://nodejs.org
  goto :fail
)
for /f "delims=" %%v in ('node --version') do set "NODE_VERSION=%%v"
echo [OK] Node.js %NODE_VERSION%

rem --- Dependencies (install only when missing) -----------------------------
set "NEED_INSTALL="
if not exist "node_modules\" set "NEED_INSTALL=1"
if not exist "node_modules\.bin\vite.cmd" set "NEED_INSTALL=1"
if not exist "node_modules\phaser\package.json" set "NEED_INSTALL=1"

if defined NEED_INSTALL (
  echo [..] Dependencies are missing - running npm install...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. See the messages above.
    goto :fail
  )
  echo.
  echo [OK] Dependencies installed.
) else (
  echo [OK] Dependencies already installed.
)

rem --- Dev server ---------------------------------------------------------
echo.
echo [..] Starting the Vite dev server. The game opens in your default browser.
echo      Keep this window open while you play. Press Ctrl+C here to stop.
echo.
rem --open makes Vite open the browser at the real URL once the server is ready
rem (it also handles the case where port 5173 is busy and Vite picks another port).
call npm run dev -- --open
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo [!] The dev server stopped with exit code %EXIT_CODE%.
  echo     If you did not press Ctrl+C, check the error messages above.
  goto :fail
)
echo Dev server stopped.
pause
exit /b 0

:fail
echo.
pause
exit /b 1
