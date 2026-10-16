@echo off
setlocal EnableExtensions DisableDelayedExpansion
title Property Map - Local Shared Server

cd /d "%~dp0"

echo.
echo ============================================================
echo   Property Map - Local Shared Server
echo ============================================================
echo.

rem Find an installed Python 3 launcher or executable.
where py.exe >nul 2>nul
if not errorlevel 1 (
    set "PYTHON_EXE=py"
    set "PYTHON_ARGS=-3"
) else (
    where python.exe >nul 2>nul
    if not errorlevel 1 (
        set "PYTHON_EXE=python"
        set "PYTHON_ARGS="
    ) else (
        echo ERROR: Python 3.10 or newer was not found.
        echo Install Python from https://www.python.org/downloads/windows/
        echo During installation, select "Add Python to PATH".
        echo.
        pause
        exit /b 1
    )
)

%PYTHON_EXE% %PYTHON_ARGS% -c "import sys; raise SystemExit(0 if sys.version_info ^>= (3, 10) else 1)" >nul 2>nul
if errorlevel 1 (
    echo ERROR: Property Map requires Python 3.10 or newer.
    %PYTHON_EXE% %PYTHON_ARGS% --version
    echo.
    pause
    exit /b 1
)

where powershell.exe >nul 2>nul
if errorlevel 1 (
    echo ERROR: Windows PowerShell is required for the secure password prompt.
    echo Ask your IT administrator to enable Windows PowerShell and try again.
    echo.
    pause
    exit /b 1
)

set "PROPERTY_MAP_MODE=shared"
set "PROPERTY_MAP_DATA=%~dp0shared-data"
set "PROPERTY_MAP_ADMIN_EMAIL=vivek.r@igt.com"
set "PROPERTY_MAP_SECURE_COOKIE=0"
set "PROPERTY_MAP_ADMIN_PASSWORD="

if not exist "%PROPERTY_MAP_DATA%" mkdir "%PROPERTY_MAP_DATA%"

rem Check for a completed administrator setup. This also recovers safely if a
rem previous first run was interrupted after SQLite created an empty database.
set "NEEDS_SETUP=1"
if exist "%PROPERTY_MAP_DATA%\property-map.sqlite3" (
    %PYTHON_EXE% %PYTHON_ARGS% -c "import os,sqlite3; p=os.path.join(os.environ['PROPERTY_MAP_DATA'],'property-map.sqlite3'); c=sqlite3.connect(p); ok=c.execute('SELECT 1 FROM users WHERE role=? AND password^<^>? LIMIT 1',('admin','')).fetchone(); raise SystemExit(0 if ok else 1)" >nul 2>nul
    if not errorlevel 1 set "NEEDS_SETUP=0"
)

rem The initial password is needed only while creating the first administrator.
if "%NEEDS_SETUP%"=="1" (
    echo First-time setup
    echo Create an administrator password containing at least 12 characters.
    echo The password will not be displayed or saved in this BAT file.
    echo.

    for /f "usebackq delims=" %%P in (`powershell.exe -NoProfile -Command "$s=Read-Host 'Administrator password' -AsSecureString; $b=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try {[Runtime.InteropServices.Marshal]::PtrToStringBSTR($b)} finally {[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($b)}"`) do set "PROPERTY_MAP_ADMIN_PASSWORD=%%P"

    if not defined PROPERTY_MAP_ADMIN_PASSWORD (
        echo.
        echo ERROR: An administrator password is required for first-time setup.
        pause
        exit /b 1
    )

    if "%PROPERTY_MAP_ADMIN_PASSWORD:~11,1%"=="" (
        echo.
        echo ERROR: The administrator password must contain at least 12 characters.
        pause
        exit /b 1
    )
)

echo Starting Property Map...
echo Member URL: http://127.0.0.1:8000/
echo Admin URL:  http://127.0.0.1:8000/admin
echo.
echo Keep this window open while using Property Map.
echo Press Ctrl+C in this window to stop the server.
echo.

start "" powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:8000/'"

%PYTHON_EXE% %PYTHON_ARGS% server.py --host 127.0.0.1 --port 8000
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if not "%SERVER_EXIT%"=="0" (
    echo Property Map stopped with error code %SERVER_EXIT%.
) else (
    echo Property Map stopped.
)
pause
exit /b %SERVER_EXIT%
