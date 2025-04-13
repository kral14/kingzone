@echo off
cls
echo =================================
echo == Git ve Fly.io Deployment v2 ==
echo =================================
echo.

echo Butun deyisiklikler elave edilir (git add .)...
git add . > nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo XETA: 'git add .' zamani problem yarandi!
    pause
    goto :eof
)
echo Deyisiklikler Git-e elave edildi.
echo.

echo Commit mesaji daxil edin (etdiyiniz deyisikliyi qisaca yazin):
set /p commit_message="Commit Mesaji: "
echo.

REM Eger mesaj bosdursa, cix
IF "%commit_message%"=="" (
    echo XETA: Commit mesaji bos ola bilmez! Emeliyyat dayandirildi.
    pause
    goto :eof
)

echo Deyisiklikler commit edilir (Mesaj: "%commit_message%")...
git commit -m "%commit_message%"
IF %ERRORLEVEL% NEQ 0 (
    echo XETA: 'git commit' zamani problem yarandi (Belke de hec bir deyisiklik yoxdur?).
    pause
    goto :eof
)
echo Commit ugurlu oldu.
echo.

echo GitHub-a gonderilir (git push origin main)...
git push origin main
IF %ERRORLEVEL% NEQ 0 (
    echo XETA: 'git push origin main' zamani problem yarandi! Interneti ve GitHub elaqesini yoxlayin.
    pause
    goto :eof
)
echo GitHub-a gonderildi.
echo.

echo =================================
echo == Fly.io Deployment Basladilir ==
echo =================================
echo Fly.io-ya deploy edilir (flyctl deploy)...

REM Flyctl yolunu ve app adini yoxlayin
"C:\flyctl\flyctl.exe" deploy -a kingzone
IF %ERRORLEVEL% NEQ 0 (
    echo XETA: 'flyctl deploy' zamani problem yarandi! Fly.io loglarina baxin.
    pause
    goto :eof
)
echo Deploy emeliyyati basladi (prosesi gozleyin)...
echo.

echo =======================================
echo == Deploy Bitdi. Loglar Gosterilir ==
echo =======================================
echo Loglari dayandirmaq ucun Ctrl+C basin.

REM Flyctl yolunu ve app adini yoxlayin
"C:\flyctl\flyctl.exe" logs -a kingzone

echo.
echo Skriptin isi bitdi.
pause