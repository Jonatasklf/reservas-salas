# Hospedagem — colocando o sistema na internet com um domínio

Este guia explica como publicar o sistema para ser acessado por um endereço
como `https://reservas.seudominio.com.br`.

## Sumário

1. [Qual opção escolher](#1-qual-opção-escolher)
2. [Opção recomendada: servidor VPS com Docker](#2-opção-recomendada-servidor-vps-com-docker)
3. [Configurando o domínio (DNS)](#3-configurando-o-domínio-dns)
   - [3.1. Publicar sem domínio (só com o IP da VPS)](#31-publicar-sem-domínio-só-com-o-ip-da-vps)
4. [Atualizar o sistema publicado](#4-atualizar-o-sistema-publicado)
5. [Backup e restauração](#5-backup-e-restauração)
6. [Alternativa: plataformas gerenciadas](#6-alternativa-plataformas-gerenciadas)
7. [Checklist de segurança antes de abrir ao público](#7-checklist-de-segurança-antes-de-abrir-ao-público)
8. [Problemas comuns na hospedagem](#8-problemas-comuns-na-hospedagem)
   - [8.1. Diagnóstico do Caddy (HTTPS e domínio)](#81-diagnóstico-do-caddy-https-e-domínio)
9. [E-mail (envio do protocolo)](#9-e-mail-envio-do-protocolo)
10. [WhatsApp (envio do protocolo)](#10-whatsapp-envio-do-protocolo)

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
domínio para o IP do servidor). **Ainda não tem domínio?** Veja a
[seção 3.1](#31-publicar-sem-domínio-só-com-o-ip-da-vps). O HTTPS só é emitido depois que o domínio
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

### 3.1. Publicar sem domínio (só com o IP da VPS)

Um endereço como `reservas.203.0.113.10` **não existe**: subdomínios só
funcionam com nomes de domínio, não com números de IP. Há duas alternativas
(nos exemplos, troque `203.0.113.10` pelo IP da sua VPS).

**Opção A — sslip.io (grátis, com HTTPS). Recomendada para começar.**

O serviço público **sslip.io** transforma qualquer IP em um nome. Troque os
pontos do IP por hífens e acrescente `.sslip.io`. Não há cadastro nem DNS a
configurar.

```env
DOMINIO="reservas.203-0-113-10.sslip.io"
APP_URL="https://reservas.203-0-113-10.sslip.io"
```

Acesse `https://reservas.203-0-113-10.sslip.io`. O Caddy emite o certificado
normalmente. Pontos fracos: o endereço é longo e depende de um serviço de
terceiros. Para uso definitivo, prefira um domínio próprio.

**Opção B — só o IP, sem HTTPS. Apenas para um teste rápido.**

```env
DOMINIO="http://203.0.113.10"
APP_URL="http://203.0.113.10"
```

Acesse `http://203.0.113.10`. **Atenção:** sem HTTPS, senhas, nomes e
telefones trafegam sem criptografia, e o navegador mostra “Não seguro”. Não use
assim com dados reais.

**Depois, ao registrar um domínio** (`.com.br` no Registro.br custa cerca de
R$ 40/ano): crie o registro DNS (seção 3), troque `DOMINIO` e `APP_URL` no
`.env.producao` e rode o comando de subir o sistema (seção 2.5) de novo. Os
dados não são afetados.

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
   Comando de início: `npm run start:servidor` (usa a porta da variável `PORT` que a plataforma define).
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
- [ ] Nenhum administrador de demonstração (`admin@exemplo.local`) existe em produção (o painel avisa se existir).
- [ ] E-mail configurado e testado em **Configurações → Enviar e-mail de teste**.
- [ ] Se usar WhatsApp: número **dedicado** ao sistema, conectado e testado em **Configurações → WhatsApp**.
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
| Erro de configuração do Caddy | Veja a seção 8.1 logo abaixo. |

### 8.1. Diagnóstico do Caddy (HTTPS e domínio)

O Caddy é o programa que recebe os acessos pelo domínio e cuida do HTTPS
(veja a seção 2). Quando ele falha, o site não abre ou o contêiner `caddy`
fica reiniciando.

**Passo 1 — colete as informações.** Na VPS, dentro da pasta do projeto:

```bash
cd ~/reservas-salas
```
```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao logs caddy --tail 40
```
```bash
grep -E "^(DOMINIO|APP_URL)=" .env.producao
```
```bash
ls -la Caddyfile
```
```bash
sudo ss -tlnp | grep -E ":(80|443) "
```

Esses comandos mostram só o domínio e o endereço, sem senhas. Se for pedir
ajuda, **nunca** envie o `.env.producao` inteiro: ele contém a senha do banco e
o segredo das sessões.

**Passo 2 — encontre o erro na tabela.**

| Mensagem ou sintoma | Causa | Solução |
|---|---|---|
| `required variable DOMINIO is missing` ou `Defina DOMINIO no .env.producao` | O comando foi rodado sem `--env-file .env.producao`, ou `DOMINIO` está vazio. | Use sempre o comando completo (seção 2.5) e confira o `DOMINIO` com o `grep` acima. |
| `adapting config using caddyfile`… `unrecognized`, `invalid` ou `parsing` | `DOMINIO` em formato errado: com `https://`, barra no final, caminho (`/admin`) ou espaços. | `DOMINIO` deve ser **só o nome**: `reservas.seudominio.com.br`. Quem leva `https://` é o `APP_URL`. Exceção: a opção só com IP (seção 3.1, opção B) usa `http://IP`. |
| `ls -la Caddyfile` mostra `drwx…` (uma **pasta**), ou o log diz `is a directory` / `not a directory` | O comando foi rodado fora da pasta do projeto e o Docker criou uma pasta vazia chamada `Caddyfile`. | Pare tudo (`docker compose -f docker-compose.producao.yml --env-file .env.producao down`), apague a pasta (`rmdir Caddyfile`), recupere o arquivo (`git checkout -- Caddyfile`) e suba de novo **de dentro** de `~/reservas-salas`. |
| `bind: address already in use` (portas 80 ou 443) | Outro programa já usa as portas; muitas VPS vêm com Apache ou Nginx. O comando `ss` mostra qual. | `sudo systemctl stop apache2 nginx` e `sudo systemctl disable apache2 nginx`. Depois suba o sistema de novo. |
| `challenge failed`, `timeout during connect`, `no valid A records`, `NXDOMAIN` | O Let's Encrypt não conseguiu confirmar o domínio: o DNS ainda não aponta para o IP da VPS, ou as portas 80/443 estão bloqueadas. | Confira `nslookup SEU-DOMINIO` (deve mostrar o IP da VPS). Libere 80 e 443 no `ufw` **e** no firewall do painel do provedor. Aguarde a propagação do DNS e reinicie: `docker compose -f docker-compose.producao.yml --env-file .env.producao restart caddy`. |
| `too many certificates` / `rateLimited` | Muitas tentativas de certificado para o mesmo domínio em pouco tempo. | Corrija o problema de DNS/portas primeiro e aguarde algumas horas antes de tentar de novo. |
| Domínio usa `reservas.IP` (ex.: `reservas.203.0.113.10`) | Não é um nome válido (veja a seção 3.1). | Use `reservas.203-0-113-10.sslip.io` ou um domínio próprio. |
| Cloudflare: “too many redirects” ou erro 525/526 | Proxy laranja ativo com SSL “Flexible”. | No Cloudflare, use SSL **Full (strict)**, ou deixe a nuvem cinza (“DNS only”). |
| O site abre, mas mostra “502 Bad Gateway” | O Caddy está bem; a aplicação (`app`) não está rodando. | Veja `logs app --tail 60` no mesmo formato de comando. Geralmente é a senha do banco (P1000) ou o `AUTH_SECRET`. |

**Passo 3 — depois de corrigir**, aplique as mudanças:

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao up -d
```
```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao logs caddy --tail 20
```

No log, a linha `certificate obtained successfully` indica que o HTTPS foi emitido.

---

## 9. E-mail (envio do protocolo)

Quando o solicitante informa um e-mail, o sistema envia automaticamente:

- a **confirmação do pedido** com o **protocolo** e o **código de acesso**, e um botão para consultar a situação;
- as **atualizações**: aprovação, rejeição, pedido de informações, sugestão de outra sala e cancelamento.

Opcionalmente, a administração também recebe um aviso a cada nova solicitação
(**Configurações → E-mails**).

Para isso, configure um servidor de envio (SMTP) no `.env.producao` (ou no
`.env`, no computador local) e reinicie o sistema. Depois, use
**Configurações → Enviar e-mail de teste** para confirmar.

### Opção A — Gmail (simples, até ~500 e-mails/dia)

1. Use uma conta Google **criada só para o sistema** (ex.: `reservas.suaunidade@gmail.com`).
2. Ative a **verificação em duas etapas**: <https://myaccount.google.com/security>.
3. Crie uma **senha de app**: <https://myaccount.google.com/apppasswords> (nome: “Reservas”).
   O Google mostra 16 letras. Essa é a senha do SMTP (não use a senha normal da conta).
4. No arquivo de configuração:

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT="587"
SMTP_USER="reservas.suaunidade@gmail.com"
SMTP_PASSWORD="abcdefghijklmnop"
SMTP_FROM="Reservas de Salas <reservas.suaunidade@gmail.com>"
```

### Opção B — serviço de envio transacional (recomendado para uso contínuo)

Serviços como **Brevo** (plano gratuito com cerca de 300 e-mails/dia),
**Resend**, **Mailgun** ou **Amazon SES** entregam melhor e caem menos no spam,
principalmente se você usar o **seu domínio** como remetente. Todos fornecem
dados SMTP: copie `host`, `porta`, `usuário` e `senha` para as variáveis
acima. No painel do serviço, siga as instruções para **verificar o domínio**
(registros DNS SPF e DKIM).

### Outlook / Hotmail

Contas pessoais do Outlook.com costumam bloquear o envio por SMTP de
aplicativos. Se quiser tentar: `SMTP_HOST="smtp-mail.outlook.com"`,
`SMTP_PORT="587"`. Se o e-mail de teste falhar com erro de autenticação, use a
opção A ou B.

### Testando sem servidor de e-mail

No computador local, **sem** SMTP configurado, cada e-mail é salvo como
arquivo na pasta `.emails-enviados/` do projeto. Dê dois cliques no arquivo
`.eml` para abri-lo no Outlook, Thunderbird ou Correio do Windows e ver
exatamente o que o solicitante receberia.

### Dicas

- Peça ao solicitante para verificar a caixa de **spam** nas primeiras mensagens.
- Se o e-mail falhar, o pedido é registrado normalmente e a tela de confirmação
  avisa para anotar o protocolo. Nada se perde.

---

## 10. WhatsApp (envio do protocolo)

A partir da versão 1.1.0, o solicitante pode receber o **protocolo, o código de
acesso e as atualizações** (aprovação, rejeição etc.) pelo **WhatsApp**.

Em **Configurações → Como o solicitante recebe o protocolo**, escolha:

| Opção | Comportamento |
|---|---|
| **WhatsApp** (padrão) | Envia pelo WhatsApp. Se a pessoa não informou telefone, o número não tem WhatsApp ou o envio falhar, usa o **e-mail**. |
| **E-mail** | Envia por e-mail. Se não houver e-mail ou falhar, usa o **WhatsApp**. |
| **WhatsApp e e-mail** | Envia pelos dois. |

Em todos os casos, a tela de confirmação mostra por onde a mensagem foi
enviada; se nada funcionar, ela pede para a pessoa anotar o protocolo.

### Como funciona

O envio usa o **whatsapp-web.js**: um programa separado (pasta
`servico-whatsapp/`) mantém o **WhatsApp Web** aberto num Chrome invisível,
conectado ao número da unidade, e envia as mensagens que o site pede.

```
Site (reservas) ──token──► Serviço de WhatsApp ──► WhatsApp Web ──► celular do solicitante
```

> **⚠️ Importante — leia antes de usar**
>
> - O whatsapp-web.js **não é oficial**. Automatizar o WhatsApp Web vai contra os
>   termos de uso do WhatsApp, e o **número pode ser bloqueado**, principalmente
>   se enviar muitas mensagens ou para quem não tem o número salvo.
> - **Use um número dedicado ao sistema** (um chip só para isso), nunca o número
>   principal da unidade ou um número pessoal.
> - O sistema já reduz o risco: só envia para quem fez a solicitação, uma
>   mensagem por vez, com intervalo entre elas.
> - Quando o WhatsApp muda o WhatsApp Web, a biblioteca pode parar de funcionar
>   até ser atualizada (veja “Manutenção” abaixo). Nesse meio-tempo, o sistema
>   **usa o e-mail automaticamente**.
> - Para uso em grande escala e sem risco de bloqueio, a alternativa é a API
>   oficial (WhatsApp Cloud API, da Meta), que exige cadastro e é paga por mensagem.

### 10.1. No seu computador (Windows, macOS, Linux)

1. Rode o instalador (`instalar.bat` / `./instalar.sh`) e responda **S** à pergunta
   do WhatsApp. Ele baixa um Chrome próprio (cerca de 150 MB) e gera o token
   de segurança no `.env` (`WHATSAPP_URL` e `WHATSAPP_TOKEN`).
2. Rode `iniciar.bat` / `./iniciar.sh`. O serviço de WhatsApp abre junto
   (no Windows, numa janela separada chamada “WhatsApp - Reservas de Salas”).
3. Entre no sistema como administrador e abra **Configurações**. O cartão
   **WhatsApp** mostra um **QR Code**.
4. No celular do número que vai **enviar** as mensagens: WhatsApp →
   **Aparelhos conectados → Conectar um aparelho** → aponte para o QR Code.
5. O cartão passa a mostrar **Conectado** com o número. Use **Enviar teste** com o
   seu próprio número para conferir.
6. Escolha o canal em **Configurações → Como o solicitante recebe o protocolo** e
   clique em **Salvar configurações**.

A conexão fica salva (pasta `servico-whatsapp/.sessao`): nas próximas vezes não
é preciso escanear de novo. Para trocar de número, use **Desconectar** no cartão.

Comandos manuais equivalentes:

```bash
npm run whatsapp:instalar
```
```bash
npm run whatsapp
```

> **Windows — pasta curta:** o Chrome grava a sessão em pastas muito
> profundas. Se o projeto estiver num caminho longo, o QR Code não aparece
> (fica em “Iniciando…” e o log mostra `Waiting failed`). Use uma pasta como
> `C:\Projetos\reservas-salas` ou defina no `.env` uma pasta curta para a
> sessão: `WHATSAPP_SESSAO_DIR="C:\whatsapp-reservas"`.

### 10.2. Na VPS (Docker)

O serviço já está no `docker-compose.producao.yml` (contêiner `whatsapp`, que
usa o Chromium do sistema). Ele só sobe se estiver ativado:

1. No `.env.producao`, confira/acrescente:

   ```env
   COMPOSE_PROFILES="whatsapp"
   WHATSAPP_URL="http://whatsapp:3200"
   WHATSAPP_TOKEN="cole-aqui-um-token-aleatorio"
   ```

   Gere o token com: `openssl rand -base64 32`.

2. Atualize e suba:

   ```bash
   cd ~/reservas-salas
   ```
   ```bash
   git pull
   ```
   ```bash
   docker compose -f docker-compose.producao.yml --env-file .env.producao up -d --build
   ```

3. Abra `https://SEU-DOMINIO/admin` → **Configurações** e escaneie o QR Code
   (passos 3 a 6 da seção 10.1).

Memória: o Chromium usa de 300 a 500 MB. Com WhatsApp ativo, use uma VPS com
**pelo menos 2 GB de RAM**. A sessão fica no volume `whatsapp_sessao` (não se
perde ao atualizar). Para ver o que o serviço está fazendo:

```bash
docker compose -f docker-compose.producao.yml --env-file .env.producao logs whatsapp --tail 40
```

### 10.3. Segurança

- O serviço **só aceita pedidos com o token** (`WHATSAPP_TOKEN`). No computador
  ele escuta apenas em `127.0.0.1`; no Docker, não tem porta aberta para a
  internet (só o site fala com ele).
- A pasta `.sessao` (ou o volume `whatsapp_sessao`) **equivale a estar logado** no
  WhatsApp do número: não a copie para outros lugares nem a envie ao GitHub
  (o `.gitignore` já a exclui).
- Se o celular for perdido ou alguém tiver acesso indevido: no celular, em
  **Aparelhos conectados**, desconecte o aparelho “Chrome”, ou use **Desconectar**
  no sistema.

### 10.4. Manutenção (quando o WhatsApp muda)

O WhatsApp atualiza o WhatsApp Web com frequência e, de vez em quando, a
biblioteca precisa de uma correção. Sinais: o QR Code não aparece mais ou o
cartão fica em “Iniciando…”; os pedidos continuam chegando e o sistema usa o
e-mail. O que fazer:

1. Veja se há versão nova em <https://github.com/wwebjs/whatsapp-web.js/releases>.
2. Atualize a dependência em `servico-whatsapp/package.json` e rode
   `npm run whatsapp:instalar` (ou o `instalar` de novo). No Docker, `up -d --build`.

> Nesta versão, a biblioteca está fixada num commit do GitHub (`38eb45b`, de
> 24/11/2026) que corrige a última mudança do WhatsApp Web e ainda não saiu no
> npm. Quando a versão **1.34.9** (ou superior) for publicada, troque a linha
> `"whatsapp-web.js"` em `servico-whatsapp/package.json` pela versão do npm.

### 10.5. Problemas comuns

| Sintoma | Solução |
|---|---|
| Cartão mostra “Serviço de WhatsApp fora do ar” | O serviço não está rodando. Use `iniciar.bat` (ou `npm run whatsapp`). Na VPS, confira `COMPOSE_PROFILES="whatsapp"` e os logs. |
| “Serviço de WhatsApp não configurado” | Faltam `WHATSAPP_URL` e `WHATSAPP_TOKEN` no `.env`. Rode o instalador de novo (ele acrescenta). |
| Fica em “Iniciando…” e o log mostra `Waiting failed` | No Windows, caminho longo (veja 10.1). Em geral, mudança do WhatsApp Web (veja 10.4). |
| `WHATSAPP_TOKEN ausente, curto ou ainda com o valor de exemplo` | Gere um token (instalador ou `openssl rand -base64 32`). |
| Teste diz “Este número não tem WhatsApp” | Confira DDD e número. Telefones fixos geralmente não têm WhatsApp. |
| Mensagens pararam e o celular mostra aviso de conta | O número pode ter sido restringido pelo WhatsApp. Troque para outro número dedicado e reduza o volume. Enquanto isso, mude o canal para **E-mail**. |

