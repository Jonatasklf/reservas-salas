@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title Instalacao - Reservas de Salas

echo.
echo ============================================================
echo   INSTALACAO - Sistema de Reservas de Salas
echo ============================================================
echo.

rem ---------------------------------------------------------------
rem 1) Node.js
rem ---------------------------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo [ERRO] Node.js nao foi encontrado.
  echo        Instale a versao LTS em https://nodejs.org ^(versao 20 ou superior^)
  echo        e execute este arquivo novamente.
  goto :falha
)
for /f "tokens=1 delims=v." %%v in ('node -v') do set NODE_MAJOR=%%v
if !NODE_MAJOR! LSS 20 (
  echo [ERRO] Sua versao do Node.js e muito antiga. Instale a versao 20 ou superior.
  goto :falha
)
for /f %%v in ('node -v') do echo [OK] Node.js %%v encontrado.

rem Aviso sobre caminhos longos (limite de 260 caracteres do Windows)
set "PASTA=%~dp0"
if not "!PASTA:~150!"=="" (
  echo [AVISO] A pasta do projeto tem um caminho muito longo.
  echo         Recomenda-se mover o projeto para algo como C:\Projetos\reservas-salas
)

rem ---------------------------------------------------------------
rem 2) Dependencias
rem ---------------------------------------------------------------
echo.
echo [1/4] Instalando dependencias (pode levar alguns minutos)...
if exist package-lock.json (
  call npm ci --no-audit --no-fund
) else (
  call npm install --no-audit --no-fund
)
if errorlevel 1 (
  echo [ERRO] Falha ao instalar as dependencias. Verifique sua conexao com a internet.
  goto :falha
)

rem ---------------------------------------------------------------
rem 3) Arquivo .env
rem ---------------------------------------------------------------
echo.
echo [2/4] Configurando variaveis de ambiente...
call node scripts\preparar-env.mjs
if errorlevel 1 goto :falha

rem ---------------------------------------------------------------
rem 4) Banco de dados: Docker (se disponivel) ou PostgreSQL local
rem ---------------------------------------------------------------
echo.
echo [3/4] Preparando o banco de dados...
set MODO=local
docker info >nul 2>&1
if not errorlevel 1 set MODO=docker
if exist .modo-banco set /p MODO=<.modo-banco

if /i "!MODO!"=="docker" (
  echo        Usando PostgreSQL no Docker.
  docker compose up -d banco
  if errorlevel 1 (
    echo [ERRO] Nao foi possivel iniciar o banco no Docker.
    goto :falha
  )
  echo        Aguardando o banco ficar pronto...
  timeout /t 8 /nobreak >nul
) else (
  echo        Docker nao encontrado: usando PostgreSQL local ^(pasta .banco-local^).
  call node scripts\banco-local.mjs start
  if errorlevel 1 goto :falha
)
> .modo-banco echo !MODO!

call npx prisma migrate deploy
if errorlevel 1 (
  echo [ERRO] Falha ao criar as tabelas do banco de dados.
  goto :falha
)
echo [OK] Banco de dados pronto.

rem ---------------------------------------------------------------
rem 5) Dados de demonstracao (opcional)
rem ---------------------------------------------------------------
echo.
echo [4/4] Dados de demonstracao
set /p DEMO="Deseja carregar salas e reservas FICTICIAS para teste? (S/N): "
if /i "!DEMO!"=="S" (
  call npm run db:seed
)

echo.
echo ============================================================
echo   Instalacao concluida.
echo.
echo   Para usar o sistema, execute:  iniciar.bat
echo   Endereco:                      http://localhost:3000
echo.
echo   Se carregou os dados de demonstracao, entre em
echo   http://localhost:3000/admin com:
echo      E-mail: admin@exemplo.local
echo      Senha:  Demo@12345   (troque em Configuracoes)
echo.
echo   Para criar o seu proprio administrador:  npm run admin:criar
echo ============================================================
echo.
pause
exit /b 0

:falha
echo.
echo A instalacao nao foi concluida. Leia a mensagem acima e consulte o README.md.
pause
exit /b 1
