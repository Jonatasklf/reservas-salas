@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Reservas de Salas - em execucao

echo.
echo ============================================================
echo   Sistema de Reservas de Salas
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado. Instale em https://nodejs.org e execute instalar.bat.
  pause
  exit /b 1
)
if not exist node_modules (
  echo [AVISO] Dependencias nao instaladas. Executando instalar.bat primeiro...
  call instalar.bat
)
if not exist .env (
  echo [ERRO] Arquivo .env nao encontrado. Execute instalar.bat.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------
rem Banco de dados
rem ---------------------------------------------------------------
set MODO=local
if exist .modo-banco set /p MODO=<.modo-banco
if /i "!MODO!"=="docker" (
  echo [1/3] Iniciando o banco de dados no Docker...
  docker compose up -d banco
  if errorlevel 1 (
    echo [ERRO] Nao foi possivel iniciar o Docker. Abra o Docker Desktop e tente novamente.
    pause
    exit /b 1
  )
  timeout /t 3 /nobreak >nul
) else (
  echo [1/3] Iniciando o banco de dados local...
  call node scripts\banco-local.mjs start
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo [2/3] Aplicando atualizacoes do banco de dados (migracoes)...
call npx prisma migrate deploy >nul
if errorlevel 1 (
  echo [ERRO] Falha ao aplicar as migracoes. Veja o README.md.
  pause
  exit /b 1
)

rem ---------------------------------------------------------------
rem Servidor web
rem  - iniciar.bat            -> modo desenvolvimento (recarrega ao editar o codigo)
rem  - iniciar.bat producao   -> modo producao (mais rapido, sem recarga automatica)
rem ---------------------------------------------------------------
echo [3/3] Iniciando o sistema em http://localhost:3000
echo.
echo   O navegador sera aberto automaticamente em alguns segundos.
echo   Para encerrar: feche esta janela ou execute parar.bat
echo.
rem Defina NAO_ABRIR_NAVEGADOR=1 para nao abrir o navegador automaticamente.
if not defined NAO_ABRIR_NAVEGADOR start "" /min powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 12; Start-Process http://localhost:3000"

if /i "%~1"=="producao" (
  call npm run build
  if errorlevel 1 (
    pause
    exit /b 1
  )
  call npm run start
) else (
  call npm run dev
)
