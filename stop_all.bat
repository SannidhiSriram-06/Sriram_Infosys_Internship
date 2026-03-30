@echo off
echo Stopping all KYC services...

REM Kill Python (Flask ML service on port 5001)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5001" ^| find "LISTENING"') do (
    echo Killing ML Service (PID %%a)
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill Node (Backend on port 5000)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5000" ^| find "LISTENING"') do (
    echo Killing Backend (PID %%a)
    taskkill /PID %%a /F >nul 2>&1
)

REM Kill Node (Frontend on port 5173)
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do (
    echo Killing Frontend (PID %%a)
    taskkill /PID %%a /F >nul 2>&1
)

echo Done. All services stopped.
pause
