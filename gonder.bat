@echo off
cls
echo =================================
echo == Git ve Fly.io Deployment ==
echo =================================
echo.

echo Butun deyisiklikler elave edilir (git add .)...
git add .
echo.

echo Deyisiklikler commit edilir...
rem === XEBARDARLIQ: Commit mesaji statikdir! ===
rem === Muhum deyisikliklerde manual commit edin! ===
git commit -m "Update project code"
echo.

echo GitHub-a gonderilir (git push origin main)...
git push origin main
echo.

echo =================================
echo == Fly.io Deployment Basladilir ==
echo =================================
echo Fly.io-ya deploy edilir (flyctl deploy)...
rem Asagidaki setrde flyctl.exe-nin tam yolunu ve app adini yoxlayin
"C:\Users\nesib\.fly\bin\flyctl.exe" deploy -a server-delicate-mountain-4709
echo.

echo ===============================
echo == Fly.io Loglari Gosterilir ==
echo ===============================
echo Loglari dayandirmaq ucun Ctrl+C basin.
rem Asagidaki setrde flyctl.exe-nin tam yolunu ve app adini yoxlayin
"C:\Users\nesib\.fly\bin\flyctl.exe" logs -a server-delicate-mountain-4709

echo.
echo Emeliyyatlar bitdi (Loglardan sonra gorunecek).
pause