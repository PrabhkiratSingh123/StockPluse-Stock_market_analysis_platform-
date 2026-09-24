# StockPulse - Start Django Backend
$VENV_PYTHON = "C:\Users\ssard\OneDrive\Documents\stock_market_analysis\venv\Scripts\python.exe"
$MANAGE      = "C:\Users\ssard\OneDrive\Documents\stock_market_analysis\backend\manage.py"

Write-Host "Starting Django Backend..." -ForegroundColor Green
$env:OPENBLAS_NUM_THREADS = "1"
$env:OMP_NUM_THREADS      = "1"

& $VENV_PYTHON $MANAGE runserver
