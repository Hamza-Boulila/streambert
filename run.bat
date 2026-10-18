@echo off
setlocal enabledelayedexpansion
title Streambert Web Launcher
cd /d "%~dp0"

echo.
echo   ==============================================================
echo                STREAMBERT WEB - ONE-CLICK LAUNCHER
echo   ==============================================================
echo.

where docker >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    docker info >nul 2>nul
    if %ERRORLEVEL% EQU 0 (
        echo [OK] Docker detected. Starting container...
        if exist .env.local (
            docker compose --env-file .env.local up -d --build
        ) else if exist .env (
            docker compose --env-file .env up -d --build
        ) else (
            if exist .env.example copy .env.example .env >nul
            docker compose up -d --build
        )
        echo [OK] Opening Streambert in your browser...
        timeout /t 3 /nobreak >nul
        start http://localhost:3000
        goto done
    )
)

echo [INFO] Docker not running. Falling back to local Node.js...
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Neither Docker nor Node.js was found.
    echo Please install Docker Desktop (https://www.docker.com/) or Node.js (https://nodejs.org/).
    pause
    exit /b 1
)

if not exist node_modules (
    echo [INFO] Installing dependencies...
    call npm install
)

if not exist dist (
    echo [INFO] Building web assets...
    call npm run build
)

echo [OK] Starting local server at http://localhost:3000...
start http://localhost:3000
call npm start

:done
echo.
echo Streambert is running at http://localhost:3000
pause
