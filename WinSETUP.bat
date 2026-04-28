@echo off
setlocal enabledelayedexpansion
title Casinoo - Setup Windows

pushd "%~dp0"

echo.
echo ===================================================
echo   Casinoo  -  Setup Windows
echo ===================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] Node.js introuvable dans le PATH.
    echo.
    echo   Installe Node.js 20+ depuis https://nodejs.org
    echo   puis relance ce script.
    echo.
    popd
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERREUR] npm introuvable dans le PATH.
    echo Reinstalle Node.js et coche bien l'option "Add to PATH".
    popd
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] Node.js !NODE_VER! detecte.
echo.

echo ---------------------------------------------------
echo  1/3  Installation des dependances
echo ---------------------------------------------------

if not exist "server\node_modules" (
    echo  ^> server: npm install ...
    pushd server
    call npm install
    if errorlevel 1 (
        echo [ERREUR] npm install a echoue cote serveur.
        popd
        popd
        pause
        exit /b 1
    )
    popd
) else (
    echo  ^> server: node_modules deja present, skip.
)

if not exist "client\node_modules" (
    echo  ^> client: npm install ...
    pushd client
    call npm install
    if errorlevel 1 (
        echo [ERREUR] npm install a echoue cote client.
        popd
        popd
        pause
        exit /b 1
    )
    popd
) else (
    echo  ^> client: node_modules deja present, skip.
)
echo.

echo ---------------------------------------------------
echo  2/3  Fichiers d'environnement (.env)
echo ---------------------------------------------------

if not exist "server\.env" (
    copy /Y "server\.env.example" "server\.env" >nul
    echo  ^> server\.env cree depuis .env.example
) else (
    echo  ^> server\.env existe deja, skip.
)

if not exist "client\.env" (
    copy /Y "client\.env.example" "client\.env" >nul
    echo  ^> client\.env cree depuis .env.example
) else (
    echo  ^> client\.env existe deja, skip.
)
echo.

echo ---------------------------------------------------
echo  3/3  Mode de demarrage
echo ---------------------------------------------------
echo.
echo   [1] Local             - serveur + client (1 PC, 2 onglets)
echo   [2] Host + tunnel     - server + client + Cloudflare Tunnel public
echo   [3] Guest             - rejoindre l'hote d'un ami (client seul)
echo   [4] Stop all          - tuer ce qui tourne sur :3001 / :5173 + tunnel
echo   [5] Quitter sans rien demarrer
echo.

set "mode="
set /p mode="Choix [1-5] : "

if "!mode!"=="1" goto MODE_LOCAL
if "!mode!"=="2" goto MODE_HOST
if "!mode!"=="3" goto MODE_GUEST
if "!mode!"=="4" goto MODE_STOP
if "!mode!"=="5" goto END_OK

echo Choix invalide.
goto END_OK


:MODE_LOCAL
echo.
echo Lancement du serveur sur http://localhost:3001 ...
start "Casinoo - Server" /D "%~dp0server" cmd /k "npm run dev"

timeout /t 2 /nobreak >nul

echo Lancement du client  sur http://localhost:5173 ...
start "Casinoo - Client" /D "%~dp0client" cmd /k "npm run dev"

echo.
echo [OK] Serveur et client lances dans des fenetres separees.
echo      Ouvre http://localhost:5173 dans ton navigateur.
goto END_OK


:MODE_HOST
echo.
echo Verification de cloudflared ...
where cloudflared >nul 2>nul
if errorlevel 1 (
    echo  ^> cloudflared introuvable. Installation via winget ...
    where winget >nul 2>nul
    if errorlevel 1 (
        echo [ERREUR] winget n'est pas disponible.
        echo Installe cloudflared manuellement :
        echo   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        echo Puis relance ce script et choisis 2.
        pause
        goto END_OK
    )

    winget install --id Cloudflare.cloudflared -e --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ERREUR] L'installation de cloudflared a echoue.
        pause
        goto END_OK
    )

    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH','Machine') + ';' + [Environment]::GetEnvironmentVariable('PATH','User')"`) do set "PATH=%%i"

    where cloudflared >nul 2>nul
    if errorlevel 1 (
        echo [WARN] cloudflared installe mais pas encore dans le PATH de cette session.
        echo Ferme et reouvre PowerShell, puis relance ce script.
        pause
        goto END_OK
    )
)
echo  ^> cloudflared OK.
echo.

echo Lancement du serveur sur http://localhost:3001 ...
start "Casinoo - Server" /D "%~dp0server" cmd /k "npm run dev"
timeout /t 2 /nobreak >nul

echo Lancement du client  sur http://localhost:5173 ...
start "Casinoo - Client" /D "%~dp0client" cmd /k "npm run dev"
timeout /t 1 /nobreak >nul

echo Lancement du tunnel Cloudflare (URL publique dans la fenetre Tunnel) ...
start "Casinoo - Cloudflare Tunnel" cmd /k "cloudflared tunnel --url http://localhost:3001 --no-autoupdate"

echo.
echo [OK] 3 fenetres lancees : Server, Client, Tunnel.
echo.
echo  -- A FAIRE --
echo  Dans la fenetre "Casinoo - Cloudflare Tunnel", recupere l'URL :
echo      https://xxxx-xxxx-xxxx.trycloudflare.com
echo  Envoie-la a ton ami : il doit la mettre dans son client\.env :
echo      VITE_SERVER_URL=https://xxxx-xxxx-xxxx.trycloudflare.com
echo  (ou utiliser le mode 3 "Guest" de ce script).
goto END_OK


:MODE_GUEST
echo.
echo Mode invite : tu vas rejoindre le serveur d'un autre joueur.
echo Demande-lui son URL Cloudflare (ex: https://abc-def-123.trycloudflare.com).
echo.
set "remote_url="
set /p remote_url="URL du serveur distant : "

if "!remote_url!"=="" (
    echo URL vide, abandon.
    goto END_OK
)

> "client\.env" echo VITE_SERVER_URL=!remote_url!
echo  ^> client\.env mis a jour : VITE_SERVER_URL=!remote_url!
echo.

echo Lancement du client uniquement sur http://localhost:5173 ...
start "Casinoo - Client (guest)" /D "%~dp0client" cmd /k "npm run dev"

echo.
echo [OK] Client lance. Ouvre http://localhost:5173 et utilise "Rejoindre"
echo      avec le code de room que ton ami t'a donne.
goto END_OK


REM ====================================================
REM MODE 4 : Stop all (tue :3001, :5173 et le tunnel)
REM ====================================================
:MODE_STOP
echo.
echo Recherche des processus a tuer ...

set "killed_any=0"

REM --- Port 3001 -----------------------------------------------------
set "pid3001="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":3001 "') do (
    if not defined pid3001 set "pid3001=%%P"
)
if defined pid3001 (
    taskkill /F /PID !pid3001! >nul 2>nul
    if errorlevel 1 (
        echo  ^> Port :3001 - impossible de tuer le PID !pid3001! ^(droits admin ?^).
    ) else (
        echo  ^> Port :3001 libere ^(PID !pid3001!^).
        set "killed_any=1"
    )
) else (
    echo  ^> Port :3001 - rien a tuer.
)

REM --- Port 5173 -----------------------------------------------------
set "pid5173="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:"LISTENING" ^| findstr ":5173 "') do (
    if not defined pid5173 set "pid5173=%%P"
)
if defined pid5173 (
    taskkill /F /PID !pid5173! >nul 2>nul
    if errorlevel 1 (
        echo  ^> Port :5173 - impossible de tuer le PID !pid5173! ^(droits admin ?^).
    ) else (
        echo  ^> Port :5173 libere ^(PID !pid5173!^).
        set "killed_any=1"
    )
) else (
    echo  ^> Port :5173 - rien a tuer.
)

REM --- cloudflared ---------------------------------------------------
tasklist /FI "IMAGENAME eq cloudflared.exe" 2>nul | findstr /I "cloudflared.exe" >nul
if not errorlevel 1 (
    taskkill /F /IM cloudflared.exe >nul 2>nul
    if errorlevel 1 (
        echo  ^> cloudflared.exe trouve mais impossible a tuer.
    ) else (
        echo  ^> cloudflared.exe arrete.
        set "killed_any=1"
    )
) else (
    echo  ^> cloudflared.exe - pas en cours d'execution.
)

echo.
if "!killed_any!"=="1" (
    echo [OK] Tout est nettoye.
) else (
    echo Rien ne tournait. Tu peux relancer un mode.
)
goto END_OK


:END_OK
echo.
echo ---------------------------------------------------
echo  Termine. Tu peux fermer cette fenetre.
echo ---------------------------------------------------
popd
pause
endlocal
exit /b 0
