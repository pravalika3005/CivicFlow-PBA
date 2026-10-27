@echo off
title CivicFlow launcher
cd /d "%~dp0"

rem Use the project's own virtual environment if it exists, otherwise your normal Python.
set "PY=python"
if exist "backend\.venv\Scripts\python.exe" set "PY=%~dp0backend\.venv\Scripts\python.exe"

echo.
echo  CivicFlow PBA - starting...
echo.

"%PY%" -c "import uvicorn, fastapi, sqlalchemy, cv2, pydantic_settings" >nul 2>nul
if errorlevel 1 (
  echo  First run: installing the backend packages. This can take a few minutes.
  "%PY%" -m pip install -r "%~dp0backend\requirements.txt"
  if errorlevel 1 (
    echo.
    echo  The backend packages could not be installed. Read the message above.
    pause
    exit /b 1
  )
)

if not exist "frontend\node_modules" (
  echo  First run: installing the website packages. This can take a few minutes.
  pushd frontend
  call npm install
  popd
)

start "CivicFlow BACKEND - keep this window open" /D "%~dp0backend" cmd /k ""%PY%" -m uvicorn app.main:app --reload --port 8000"
start "CivicFlow WEBSITE - keep this window open" /D "%~dp0frontend" cmd /k "npm run dev"

echo  Two new windows opened (backend and website). Keep both open.
echo  Opening your browser in a few seconds at http://localhost:5173
timeout /t 8 /nobreak >nul
start "" http://localhost:5173
echo.
echo  You can close THIS window. To stop CivicFlow, close the other two windows.
pause
