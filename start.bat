@echo off
title Lightning Bot
color c
cls

echo Streamer Modu ile baslatmak istiyor musunuz? (E/H)
echo Bu mod aktif edildiginde IDler ve isimler gizlenecektir.
set /p streamer_mode="Secim (E/H): "

if /i "%streamer_mode%"=="E" (
    echo Streamer Modu aktif edildi! IDler ve isimler gizlenecek...
    set NODE_ENV=streamer
) else (
    echo Normal mod baslatiliyor...
    set NODE_ENV=production
)

:loop
cls
node main.js
goto loop
pause