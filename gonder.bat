@echo off
echo Butun deyisiklikler elave edilir...
git add .

echo Deyisiklikler commit edilir...
rem Qeyd: Her defe eyni commit mesajini istifade edecek.
rem Muhum deyisiklikler ucun manual commit etmek daha yaxsidir.
git commit -m "PostgreSQL DB ve DB Session inteqrasiyasi"

echo GitHub-a gonderilir...
git push origin main

echo.
echo Emeliyyat bitdi. Xetalari yoxlayin.
pause