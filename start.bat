@echo off
REM Parametra launcher: serves this folder over http (ES modules need it) and opens the browser.
cd /d "%~dp0"
set PORT=8080
echo.
echo   Parametra Home Studio  -  http://localhost:%PORT%
echo   Press Ctrl+C to stop.
echo.
start "" "http://localhost:%PORT%/index.html"
where python >nul 2>nul && (python -m http.server %PORT% & goto :eof)
where py >nul 2>nul && (py -m http.server %PORT% & goto :eof)
where npx >nul 2>nul && (npx --yes serve -l %PORT% . & goto :eof)
echo Could not find Python or Node. Install Python from https://python.org and run this again.
pause
