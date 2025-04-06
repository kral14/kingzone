@echo off
echo Butun deyisiklikler elave edilir...
git add .

echo Deyisiklikler commit edilir...
rem Qeyd: Her defe eyni commit mesajini istifade edecek.
rem Muhum deyisiklikler ucun manual commit etmek daha yaxsidir.
git commit -m "Avtomatik commit (.bat fayli ile)"

echo GitHub-a gonderilir...
git push origin main

echo.
echo Emeliyyat bitdi. Xetalari yoxlayin.
pause