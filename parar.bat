@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo Encerrando o Sistema de Reservas de Salas...
echo.

rem 1) Servidor web (porta 3000)
set ENCONTRADO=0
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":3000 .*LISTENING"') do (
  if not "%%p"=="0" (
    taskkill /PID %%p /T /F >nul 2>&1
    set ENCONTRADO=1
  )
)
if "!ENCONTRADO!"=="1" (
  echo [OK] Servidor web encerrado.
) else (
  echo [--] O servidor web nao estava em execucao.
)

rem 2) Banco de dados
set MODO=local
if exist .modo-banco set /p MODO=<.modo-banco
if /i "!MODO!"=="docker" (
  docker compose stop banco >nul 2>&1
  echo [OK] Banco de dados ^(Docker^) encerrado. Os dados continuam salvos.
) else (
  call node scripts\banco-local.mjs stop
  echo      Os dados continuam salvos na pasta .banco-local
)

echo.
pause
