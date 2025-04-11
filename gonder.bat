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
rem === BU SETR DEYISDIRILDI: flyctl yolu ve app adi ===
"C:\flyctl\flyctl.exe" deploy -a kingzone
echo.

echo ===============================
echo == Fly.io Loglari Gosterilir ==
echo ===============================
echo Loglari dayandirmaq ucun Ctrl+C basin.
rem === BU SETR DE DEYISDIRILDI: flyctl yolu ve app adi ===
"C:\flyctl\flyctl.exe" logs -a kingzone

echo.
echo Emeliyyatlar bitdi (Loglardan sonra gorunecek).
pause