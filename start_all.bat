@echo off
setlocal

set "ROOT=%~dp0"
set "ROOT=%ROOT:~0,-1%"

echo ============================================================
echo  KYC AI Platform - Auto Startup
echo ============================================================
echo.

REM ── 1. Python ML Service ─────────────────────────────────────
echo [1/3] Starting Flask ML Service (port 5001)...
echo       Installing Python dependencies first...
start "ML-Service" cmd /k "cd /d "%ROOT%\ml-service" && pip install flask flask-cors numpy opencv-python tensorflow torch torch-geometric sentence-transformers openbharatocr scikit-learn networkx && echo. && echo [ML-Service] Dependencies installed. Starting server... && python app.py"

REM ── 2. Node.js Backend ───────────────────────────────────────
echo [2/3] Starting Node.js Backend (port 5000)...
echo       Installing npm dependencies first...
start "Backend" cmd /k "cd /d "%ROOT%\backend" && npm install && echo. && echo [Backend] Dependencies installed. Starting server... && node server.js"

REM ── 3. React Frontend ────────────────────────────────────────
echo [3/3] Starting React Frontend (port 5173)...
echo       Installing npm dependencies first...
start "Frontend" cmd /k "cd /d "%ROOT%\frontend" && npm install && echo. && echo [Frontend] Dependencies installed. Starting dev server... && npm run dev"

echo.
echo ============================================================
echo  Three terminal windows have been opened.
echo  Wait for each to finish installing before they start.
echo.
echo  ML Service : http://localhost:5001/api/ml/health
echo  Backend    : http://localhost:5000
echo  Frontend   : http://localhost:5173
echo ============================================================
echo.
pause
