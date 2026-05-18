@echo off
setlocal
cd /d "%~dp0"

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install --cache .npm-cache
  if errorlevel 1 exit /b %errorlevel%
)

if not exist dist (
  echo Building frontend...
  call npm.cmd run build
  if errorlevel 1 exit /b %errorlevel%
)

echo.
echo Smart Supervisor Log is starting...
echo Open this URL in your browser:
echo http://localhost:3000
echo.
echo If the port is already in use, close the old Node/npm window first.
call npm.cmd run start
