#!/usr/bin/env bash
# =============================================================================
# Instalação — Sistema de Reservas de Salas (macOS e Linux)
# Uso:  ./instalar.sh        (se der "permissão negada": chmod +x *.sh)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

echo
echo "============================================================"
echo "  INSTALAÇÃO - Sistema de Reservas de Salas"
echo "============================================================"
echo

# 1) Node.js -------------------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js não encontrado. Instale a versão LTS (20 ou superior):"
  echo "       macOS: https://nodejs.org  ou  brew install node"
  echo "       Linux: https://nodejs.org/pt/download (ou o gerenciador da sua distribuição)"
  exit 1
fi
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "[ERRO] Node.js $(node -v) é muito antigo. Instale a versão 20 ou superior."
  exit 1
fi
echo "[OK] Node.js $(node -v) encontrado."

# 2) Dependências --------------------------------------------------------------
echo
echo "[1/4] Instalando dependências (pode levar alguns minutos)..."
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

# 3) .env ----------------------------------------------------------------------
echo
echo "[2/4] Configurando variáveis de ambiente..."
node scripts/preparar-env.mjs

# 4) Banco de dados ------------------------------------------------------------
echo
echo "[3/4] Preparando o banco de dados..."
MODO=local
if docker info >/dev/null 2>&1; then MODO=docker; fi
if [ -f .modo-banco ]; then MODO=$(tr -d '[:space:]' < .modo-banco); fi

if [ "$MODO" = "docker" ]; then
  echo "       Usando PostgreSQL no Docker."
  docker compose up -d banco
  echo "       Aguardando o banco ficar pronto..."
  sleep 8
else
  echo "       Docker não encontrado: usando PostgreSQL local (pasta .banco-local)."
  node scripts/banco-local.mjs start
fi
echo "$MODO" > .modo-banco
npx prisma migrate deploy
echo "[OK] Banco de dados pronto."

# 5) Dados de demonstração -----------------------------------------------------
echo
echo "[4/4] Dados de demonstração"
read -r -p "Deseja carregar salas e reservas FICTÍCIAS para teste? (S/N): " DEMO || DEMO=N
if [ "${DEMO:-N}" = "S" ] || [ "${DEMO:-N}" = "s" ]; then npm run db:seed; fi

# 6) Serviço de WhatsApp (opcional) --------------------------------------------
echo
echo "[Opcional] WhatsApp: envia o protocolo ao solicitante pelo WhatsApp."
echo "           Baixa um navegador Chrome próprio (cerca de 150 MB)."
if [ -d servico-whatsapp/node_modules ]; then
  WPP=S
  echo "           Já instalado: atualizando..."
else
  read -r -p "Deseja instalar o serviço de WhatsApp? (S/N): " WPP || WPP=N
fi
if [ "${WPP:-N}" = "S" ] || [ "${WPP:-N}" = "s" ]; then
  if npm run whatsapp:instalar; then
    echo "[OK] Serviço de WhatsApp instalado. O ./iniciar.sh inicia ele junto."
  else
    echo "[AVISO] O serviço de WhatsApp não foi instalado. O sistema funciona normalmente, usando e-mail."
  fi
fi

cat <<'FIM'

============================================================
  Instalação concluída.

  Para usar o sistema:  ./iniciar.sh
  Endereço:             http://localhost:3000

  Se carregou os dados de demonstração, entre em
  http://localhost:3000/admin com:
     E-mail: admin@exemplo.local
     Senha:  Demo@12345   (troque em Configurações)

  Para criar o seu próprio administrador:  npm run admin:criar
============================================================
FIM
