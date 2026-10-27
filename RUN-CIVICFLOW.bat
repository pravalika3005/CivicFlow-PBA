@echo off
title CivicFlow - keep this window open
cd /d "%~dp0backend"
echo.
echo  CivicFlow PBA is starting. KEEP THIS WINDOW OPEN while you use the app.
echo  Your browser opens in a few seconds at http://127.0.0.1:8000
echo  To stop the app, close this window.
echo.
start "" /b cmd /c "timeout /t 5 /nobreak >nul & start http://127.0.0.1:8000"
set "PY=python"
if exist ".venv\Scripts\python.exe" set "PY=%~dp0backend\.venv\Scripts\python.exe"
"%PY%" -m uvicorn app.main:app --port 8000
echo.
echo  The server stopped. Read any message above, then press a key to close.
pause
