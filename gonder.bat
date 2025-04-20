@echo off
setlocal
cls

echo ================================
echo ==  Git & Fly.io Deployment   ==
echo ================================
echo.

:: Başlanğıc diaqnostika
echo Skript başladıldı, davam etmək üçün bir düymə basın...
pause

:: 1) Git add
echo [1/5] git add . ...
git add .
if errorlevel 1 (
    echo [Xəta] git add mərhələsində problem yarandı.
    goto END
)

:: 2) Commit
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set D=%%a-%%b-%%c
for /f "tokens=1-2 delims=:." %%a in ('echo %time%') do set T=%%a%%b
set DT=%D%_%T%

echo.
echo [2/5] git commit -m "Deploy %DT%" ...
git commit -m "Deploy %DT%"
if errorlevel 1 (
    echo [Xəta] git commit mərhələsində problem.
    goto END
)

:: 3) Push
echo.
echo [3/5] git push origin main ...
git push origin main
if errorlevel 1 (
    echo [Xəta] git push mərhələsində problem.
    goto END
)

:: 4) Fly.io deploy
echo.
echo [4/5] flyctl deploy -a kingzone ...
flyctl deploy -a kingzone
if errorlevel 1 (
    echo [Xəta] flyctl deploy mərhələsində problem.
    goto END
)

:: 5) Fly.io logs
echo.
echo [5/5] flyctl logs -a kingzone (stop üçün Ctrl+C)...
flyctl logs -a kingzone

:END
echo.
echo Skript bitdi. Pəncərəni bağlamaq üçün bir düymə basın...
pause
