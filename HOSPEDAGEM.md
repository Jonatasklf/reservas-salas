# Hospedagem — colocando o sistema na internet com um domínio

Este guia explica como publicar o sistema para ser acessado por um endereço
como `https://reservas.seudominio.com.br`.

## Sumário

1. [Qual opção escolher](#1-qual-opção-escolher)
2. [Opção recomendada: servidor VPS com Docker](#2-opção-recomendada-servidor-vps-com-docker)
3. [Configurando o domínio (DNS)](#3-configurando-o-domínio-dns)
4. [Atualizar o sistema publicado](#4-atualizar-o-sistema-publicado)
5. [Backup e restauração](#5-backup-e-restauração)
6. [Alternativa: plataformas gerenciadas](#6-alternativa-plataformas-gerenciadas)
7. [Checklist de segurança antes de abrir ao público](#7-checklist-de-segurança-antes-de-abrir-ao-público)
8. [Problemas comuns na hospedagem](#8-problemas-comuns-na-hospedagem)

---

## 1. Qual opção escolher

| | **VPS + Docker** (recomendado) | **Plataforma gerenciada** (Railway, Render, Vercel…) |
|---|---|---|
| Custo típico | Baixo e fixo (servidor pequeno, 1–2 GB RAM) | Plano gratuito limitado; depois cobra por uso |
| Domínio + HTTPS | Automático (Caddy + Let's Encrypt, já configurado) | Automático pela plataforma |
| Banco de dados | Incluído, no mesmo servidor | Contratado à parte (Neon, Supabase, Railway…) |
| Controle e backup | Total, com você | Depende da plataforma |
| Conhecimento necessário | Comandos básicos de terminal | Painel web |

O projeto já traz tudo pronto para a **opção VPS**: `Dockerfile`,
`docker-compose.producao.yml`, `Caddyfile` e `.env.producao.example`.

Provedores de VPS comuns: Hostinger, Contabo, DigitalOcean, Vultr, Hetzner,
Locaweb, Magalu Cloud, AWS Lightsail. Escolha um servidor com **Ubuntu 24.04 LTS**
e pelo menos **1 GB de RAM** (2 GB deixam a atualização mais rápida).

---

## 2. Opção recomendada: servidor VPS com Docker

A arquitetura publicada fica assim:

```
Internet ──► Caddy (portas 80/443, HTTPS automático)
                │
                ▼
             app (Next.js, porta 3000 interna)
                │
                ▼
             banco (PostgreSQL, sem acesso externo)
```

### 2.1. Contratar o servidor e acessar

Contrate a VPS com Ubuntu. O provedor informa o **IP** e a senha (ou chave SSH)
do usuário `root`. Do seu computador:

```bash
ssh root@IP_DO_SERVIDOR
```

*(No Windows 10/11 o comando `ssh` já funciona no Prompt de Comando/PowerShell.)*

### 2.2. Preparar o servidor (uma única vez)

```bash
# Atualizações e firewall
apt update && apt upgrade -y
apt install -y git ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw --force enable

# Docker (script oficial)
curl -fsSL https://get.docker.com | sh

# Usuário próprio para a aplicação (evita trabalhar como root)
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
su - deploy
```

### 2.3. Configurar o domínio

Faça agora o passo da **[seção 3](#3-configurando-o-domínio-dns)** (apontar o
domínio para o IP do servidor). O HTTPS só é emitido depois que o domínio
aponta corretamente.

### 2.4. Baixar o projeto e configurar

```bash
git clone https://github.com/SEU-USUARIO/reservas-salas.git
cd reservas-salas
cp .env.producao.example .env.producao
nano .env.producao
```

Preencha no `.env.producao`:

| Variável | O que colocar |
|---|---|
| `DOMINIO` | Seu domínio, **sem** `https://` (ex.: `reservas.seudominio.com.br`) |
| `APP_URL` | O mesmo domínio **com** `https://` |
| `POSTGRES_PASSWORD` | Uma senha longa e aleatória |
| `DATABASE_URL` | Troque `troque-esta-senha-do-banco` pela **mesma** senha acima |
| `AUTH_SECRET` | Um segredo aleatório (comando abaixo) |
| `SMTP_*` | Opcional: dados do provedor de e-mail |

Para gerar senhas/segredos aleatórios no servidor:

```bash
openssl rand -base64 36
```

> Use apenas letras e números na senha do banco (ou remova `+ / =` do valor
> gerado), porque ela também vai dentro da `DATABASE_URL`.

Salve (`Ctrl+O`, `Enter`) e saia (`Ctrl+X`).

### 2.5. Subir o sistema

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao up -d --build
```

A primeira execução leva alguns minutos (compila o sistema). Quando terminar:

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao ps     # todos "running"/"healthy"
docker compose -f docker-compose.producao.yml --env-file .env.producao logs -f app   # Ctrl+C para sair
```

As tabelas do banco são criadas automaticamente na inicialização (migrações).

### 2.6. Criar o primeiro administrador

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao exec app npm run admin:criar
```

Acesse `https://SEU-DOMINIO/admin` e entre. Em **Configurações**, ajuste o
nome da unidade, o logotipo e os horários; depois cadastre as salas.

> **Não** rode `npm run db:seed` em produção: ele cria dados fictícios.

### 2.7. Dica: atalho para os comandos

Para não digitar o comando longo toda vez:

```bash
echo "alias reservas='docker compose -f ~/reservas-salas/docker-compose.producao.yml --env-file ~/reservas-salas/.env.producao'" >> ~/.bashrc
source ~/.bashrc
reservas ps
reservas logs -f app
```

---

## 3. Configurando o domínio (DNS)

No painel onde o domínio foi registrado (Registro.br, Hostinger, GoDaddy,
Cloudflare…), crie um registro:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| `A` | `reservas` (ou `@` para o domínio principal) | IP do servidor | padrão |

- `reservas` + domínio `seudominio.com.br` resulta em `reservas.seudominio.com.br`.
- A propagação costuma levar de minutos a algumas horas. Para conferir:
  `nslookup reservas.seudominio.com.br` deve mostrar o IP do servidor.
- **Cloudflare:** deixe a nuvem **cinza** (“DNS only”) até o certificado ser
  emitido. Depois, se quiser o proxy laranja, use o modo SSL **Full (strict)**.

O **Caddy** emite e renova sozinho o certificado HTTPS (Let's Encrypt). Não há
nada a fazer, desde que as portas 80 e 443 estejam liberadas e o DNS correto.

---

## 4. Atualizar o sistema publicado

Depois de enviar alterações ao GitHub:

```bash
cd ~/reservas-salas
git pull
docker compose -f docker-compose.producao.yml --env-file .env.producao up -d --build
```

Migrações novas do banco são aplicadas automaticamente quando o contêiner
`app` reinicia. **Faça um backup antes** de atualizações grandes (seção 5).

---

## 5. Backup e restauração

### Backup manual

```bash
mkdir -p ~/backups
docker compose -f ~/reservas-salas/docker-compose.producao.yml --env-file ~/reservas-salas/.env.producao \
  exec -T banco pg_dump -U reservas -d reservas -Fc > ~/backups/reservas-$(date +%F).dump
```

### Backup automático diário (03h00, guarda 30 dias)

```bash
crontab -e
```

Adicione a linha:

```
0 3 * * * docker compose -f /home/deploy/reservas-salas/docker-compose.producao.yml --env-file /home/deploy/reservas-salas/.env.producao exec -T banco pg_dump -U reservas -d reservas -Fc > /home/deploy/backups/reservas-$(date +\%F).dump && find /home/deploy/backups -name '*.dump' -mtime +30 -delete
```

> Copie os backups periodicamente para **fora** do servidor (seu computador,
> Google Drive etc.). Um backup que só existe no próprio servidor se perde com ele.

### Restaurar um backup

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao exec -T banco \
  pg_restore -U reservas -d reservas --clean --if-exists < ~/backups/reservas-AAAA-MM-DD.dump
```

---

## 6. Alternativa: plataformas gerenciadas

O sistema é um aplicativo Next.js comum com PostgreSQL. Em qualquer plataforma
o roteiro é:

1. Crie um banco **PostgreSQL** gerenciado (Neon, Supabase, Railway, Render…)
   e copie a *connection string*.
2. Conecte o repositório do GitHub à plataforma.
3. Configure as variáveis de ambiente: `DATABASE_URL`, `AUTH_SECRET`,
   `APP_URL` (com `https://`), `SESSION_HOURS` e, opcionalmente, `SMTP_*`.
4. Comando de build: `npx prisma migrate deploy && npm run build`.
   Comando de início: `npm start`.
5. No painel da plataforma, adicione seu **domínio personalizado** e crie no DNS
   o registro indicado por ela (geralmente `CNAME`).
6. Crie o primeiro administrador rodando, uma vez, do seu computador:
   `DATABASE_URL="string-do-banco-de-produção" npm run admin:criar`
   (no PowerShell: `$env:DATABASE_URL="..."; npm run admin:criar`).

Observações:

- **Vercel / Netlify** (serverless): funcionam, mas use a *connection string
  com pooling* do provedor de banco (ex.: Neon “pooled”). O limitador de
  tentativas de login fica em memória por instância. Para tráfego alto,
  troque-o por um armazenamento compartilhado (veja `src/lib/rate-limit.ts`).
- **Railway / Render** com `Dockerfile`: a plataforma detecta o `Dockerfile` do
  projeto. Nesse caso não precisa do comando de build acima, porque as
  migrações já rodam na inicialização.

---

## 7. Checklist de segurança antes de abrir ao público

- [ ] `AUTH_SECRET` e `POSTGRES_PASSWORD` gerados aleatoriamente (nunca os valores de exemplo).
- [ ] `.env.producao` **não** está no GitHub (o `.gitignore` já o exclui).
- [ ] Nenhum administrador de demonstração (`admin@exemplo.local`) existe em produção.
- [ ] Senhas de administradores fortes e individuais (cada pessoa com seu login).
- [ ] Firewall com apenas as portas 22, 80 e 443 abertas.
- [ ] Backup automático configurado e testado (faça uma restauração de teste).
- [ ] `APP_URL` começando com `https://` (ativa cookies seguros).
- [ ] Atualizações do servidor em dia (`apt update && apt upgrade`).
- [ ] Texto de rodapé em **Configurações** informando o responsável pelo
      tratamento dos dados (LGPD) e um contato.

---

## 8. Problemas comuns na hospedagem

| Sintoma | Solução |
|---|---|
| Site não abre / certificado inválido | Confira o DNS (`nslookup`), as portas 80/443 no firewall do servidor **e** no painel do provedor, e `logs caddy`. |
| `Defina POSTGRES_PASSWORD no .env.producao` | Faltou o `--env-file .env.producao` no comando ou a variável está vazia. |
| `P1000: Authentication failed` | A senha em `DATABASE_URL` não é a mesma de `POSTGRES_PASSWORD`. Se trocou a senha **depois** de criar o banco, o volume antigo mantém a senha anterior. |
| Login funciona e logo desloga | `APP_URL` com `https://` mas acessando por `http://`. Acesse sempre pelo domínio com HTTPS. |
| Build falha por falta de memória | Servidor com 1 GB: crie um swap de 2 GB (`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`). |
| Horários exibidos errados | O sistema sempre exibe no fuso `America/Sao_Paulo`, independentemente do fuso do servidor. Se algo divergir, verifique o relógio do servidor (`timedatectl`). |
