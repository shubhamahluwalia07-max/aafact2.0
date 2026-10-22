@echo off
setlocal enabledelayedexpansion

echo ===================================================================
echo [AAFACT 2.0] Prerequisite Check: MATLAB Runtime R2023a (v9.14)
echo ===================================================================

set SCRIPT_DIR=%~dp0
cd /d "%SCRIPT_DIR%"

set PYTHON_CMD=python
if exist "%SCRIPT_DIR%venv\Scripts\python.exe" (
    set PYTHON_CMD="%SCRIPT_DIR%venv\Scripts\python.exe"
)

%PYTHON_CMD% "%SCRIPT_DIR%check_matlab_runtime.py" --check-only >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] MATLAB Runtime R2023a (v9.14) is already installed.
    exit /b 0
)

echo [!] MATLAB Runtime R2023a (v9.14) was NOT found in the Windows Registry.
set INSTALLER="%SCRIPT_DIR%MATLAB_Runtime_R2023a_Update_8_win64\setup.exe"

if exist %INSTALLER% (
    echo [*] Found local installer at: %INSTALLER%
    echo [*] Starting silent installation of MATLAB Runtime R2023a...
    echo [*] Command: %INSTALLER% -mode silent -agreeToLicense yes
    echo [*] Note: This may take several minutes. Please do not close this window.
    
    %INSTALLER% -mode silent -agreeToLicense yes
    set RET=%ERRORLEVEL%
    
    if !RET! equ 0 (
        echo [SUCCESS] MATLAB Runtime R2023a installed successfully.
        exit /b 0
    ) else (
        echo [WARNING] Installer exited with code !RET!.
        exit /b !RET!
    )
) else (
    echo [ERROR] Installer not found at: %INSTALLER%
    echo [!] Please verify that MATLAB_Runtime_R2023a_Update_8_win64 exists.
    exit /b 1
)
