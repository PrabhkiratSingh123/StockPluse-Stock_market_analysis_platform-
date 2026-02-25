# StockPulse — Start Django Backend
# Run from: C:\Users\ssard\OneDrive\Documents\stock_market_analysis
# Usage: .\start_backend.ps1

$VENV_PYTHON = "C:\Users\ssard\OneDrive\Documents\stock_market_analysis\venv\Scripts\python.exe"
$MANAGE      = "C:\Users\ssard\OneDrive\Documents\stock_market_analysis\stock_project\manage.py"

Write-Host "🔪 Killing leftover Python processes..." -ForegroundColor Yellow
Get-Process -Name "python" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 1

# Fix OpenBLAS memory allocation crash
$env:OPENBLAS_NUM_THREADS = "1"
$env:OMP_NUM_THREADS      = "1"

Write-Host "✅ Environment set. Starting Django..." -ForegroundColor Green
Write-Host "   → http://127.0.0.1:8000" -ForegroundColor Cyan
Write-Host ""

& $VENV_PYTHON $MANAGE runserver
