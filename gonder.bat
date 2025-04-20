@echo off
setlocal
cls

echo =================================
echo == Git ve Fly.io Deployment ==
echo =================================
echo.

:: 1) Bütün dəyişiklikləri əlavə et
echo Butun deyisiklikler elave edilir (git add .)...
git add .
if errorlevel 1 (
    echo [Xəta] git add uğursuz oldu.
    pause
    exit /b 1
)
echo.

:: 2) Dinamik commit mesajı üçün tarix-saat al
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set d=%%a-%%b-%%c
for /f "tokens=1-2 delims=:." %%a in ('echo %time%') do set t=%%a%%b
set dt=%d%_%t%

echo Deyisiklikler commit edilir...
git commit -m "Deploy %dt%"
if errorlevel 1 (
    echo [Xəta] git commit uğursuz oldu (bəlkə dəyişiklik yoxdur).
    pause
    exit /b 1
)
echo.

:: 3) Remote‑a göndər
echo GitHub-a gonderilir (git push origin main)...
git push origin main
if errorlevel 1 (
    echo [Xəta] git push uğursuz oldu.
    pause
    exit /b 1
)
echo.

echo =================================
echo == Fly.io Deployment Basladilir ==
echo =================================

:: 4) PATH‑də flyctl varsa bu cür çağırmaq daha yaxşıdır
echo Fly.io-ya deploy edilir (flyctl deploy)...
flyctl deploy -a kingzone
if errorlevel 1 (
    echo [Xəta] flyctl deploy uğursuz oldu.
    pause
    exit /b 1
)
echo.

echo ===============================
echo == Fly.io Loglari Gosterilir ==
echo ===============================
echo Loglari dayandirmaq ucun Ctrl+C basin.

:: 5) Logları göstər
flyctl logs -a kingzone

echo.
echo Emeliyyatlar bitdi.
pause
exit /b 0
