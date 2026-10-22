@echo off
setlocal enabledelayedexpansion

title AAFACT 2.0 - Bone Alignment ^& Corticotomy Planning System
echo ===================================================================
echo   AAFACT 2.0: Bone Alignment ^& Corticotomy Planning System
echo ===================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

:: Step 1: Check Python installation
where python >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH. Please install Python 3.10+
    pause
    exit /b 1
)

:: Step 2: Check or create virtual environment
if not exist "%SCRIPT_DIR%venv\Scripts\python.exe" (
    echo [*] Virtual environment not found. Creating venv in %SCRIPT_DIR%venv...
    python -m venv "%SCRIPT_DIR%venv"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo [*] Installing dependencies from requirements.txt...
    "%SCRIPT_DIR%venv\Scripts\pip" install -r "%SCRIPT_DIR%requirements.txt"
    if %ERRORLEVEL% neq 0 (
        echo [WARNING] One or more packages encountered issues during installation.
    )
) else (
    echo [OK] Virtual environment verified: %SCRIPT_DIR%venv
)

:: Step 3: Check MATLAB Runtime R2023a (v9.14)
echo [*] Checking MATLAB Runtime R2023a prerequisites...
call "%SCRIPT_DIR%check_runtime.bat"

:: Step 4: Ensure output folders exist
if not exist "%SCRIPT_DIR%outputs\aligned" mkdir "%SCRIPT_DIR%outputs\aligned"
if not exist "%SCRIPT_DIR%outputs\cut_segments" mkdir "%SCRIPT_DIR%outputs\cut_segments"
if not exist "%SCRIPT_DIR%uploads" mkdir "%SCRIPT_DIR%uploads"

:: Step 5: Start Flask application and launch browser
echo.
echo ===================================================================
echo [AAFACT 2.0] Starting Flask Server on http://127.0.0.1:5000 ...
echo ===================================================================

start "" http://127.0.0.1:5000
"%SCRIPT_DIR%venv\Scripts\python.exe" "%SCRIPT_DIR%app.py"

pause
