# Tutorial de instalação — Windows, macOS e Linux

Este guia leva você do zero até o sistema funcionando no navegador, em
`http://localhost:3000`, no seu próprio computador. Não é preciso internet
depois da instalação, nem banco de dados hospedado.

> Para colocar o sistema na internet com um domínio, veja **[HOSPEDAGEM.md](HOSPEDAGEM.md)**.

---

## Sumário

1. [O que será instalado](#1-o-que-será-instalado)
2. [Windows](#2-windows)
3. [macOS](#3-macos)
4. [Linux](#4-linux)
5. [Primeiro acesso e primeiro administrador](#5-primeiro-acesso-e-primeiro-administrador)
6. [Uso diário: iniciar e parar](#6-uso-diário-iniciar-e-parar)
7. [Comandos manuais (qualquer sistema)](#7-comandos-manuais-qualquer-sistema)
8. [Problemas comuns](#8-problemas-comuns)

---

## 1. O que será instalado

| Item | Para quê | Obrigatório? |
|---|---|---|
| **Node.js 20 ou superior** (versão LTS) | Executa o sistema | Sim |
| **Git** | Baixar o projeto do GitHub e enviar alterações | Recomendado |
| **Docker Desktop** | Roda o PostgreSQL em um contêiner | **Não.** Sem Docker, o sistema usa um PostgreSQL local que já vem com o projeto. |

O banco de dados é **PostgreSQL**. Existem duas formas de rodá-lo, e os scripts
escolhem sozinhos:

- **Com Docker instalado e aberto:** usa o arquivo `docker-compose.yml`.
- **Sem Docker:** usa os binários oficiais do PostgreSQL baixados pelo `npm`.
  Os dados ficam na pasta `.banco-local/` do projeto.

Nos dois casos os dados **continuam salvos** depois de fechar o navegador ou
desligar o computador.

---

## 2. Windows

### 2.1. Instalar os pré-requisitos

1. **Node.js**: acesse <https://nodejs.org>, baixe a versão **LTS** e instale
   (aceite as opções padrão).
2. **Git**: acesse <https://git-scm.com/download/win> e instale (opções padrão).
3. *(Opcional)* **Docker Desktop**: <https://www.docker.com/products/docker-desktop/>.

Para conferir, abra o **Prompt de Comando** (tecla Windows → digite `cmd`) e rode:

```bat
node -v
git --version
```

### 2.2. Baixar o projeto

> **Importante:** use uma pasta com caminho **curto**, como `C:\Projetos`.
> O Windows limita caminhos a 260 caracteres, e pastas muito profundas
> impedem o PostgreSQL local de funcionar.

```bat
mkdir C:\Projetos
cd C:\Projetos
git clone https://github.com/SEU-USUARIO/reservas-salas.git
cd reservas-salas
```

*(Sem Git: no GitHub, clique em **Code → Download ZIP** e extraia em `C:\Projetos\reservas-salas`.)*

### 2.3. Instalar

Dê **dois cliques em `instalar.bat`** (ou rode `instalar.bat` no Prompt de Comando).

O script:

1. confere o Node.js;
2. instala as dependências;
3. cria o arquivo `.env` com um segredo aleatório;
4. cria o banco de dados e as tabelas;
5. pergunta se você quer carregar **dados fictícios** de demonstração (responda `S` para testar).

### 2.4. Iniciar

Dê **dois cliques em `iniciar.bat`**. O navegador abre sozinho em
`http://localhost:3000` (a primeira abertura leva alguns segundos).

- **Manter a janela preta aberta** enquanto usa o sistema.
- Para encerrar: feche a janela **ou** dê dois cliques em `parar.bat`.

---

## 3. macOS

### 3.1. Instalar os pré-requisitos

Abra o **Terminal** (Spotlight → “Terminal”).

**Opção A — instaladores oficiais**
1. Node.js LTS: <https://nodejs.org> (arquivo `.pkg`).
2. Git: ao rodar `git --version` pela primeira vez, o macOS oferece instalar as
   “Ferramentas de Linha de Comando”. Aceite.

**Opção B — Homebrew** (se você já usa)
```bash
brew install node git
```

*(Opcional)* Docker Desktop para Mac: <https://www.docker.com/products/docker-desktop/>.

### 3.2. Baixar, instalar e iniciar

```bash
mkdir -p ~/Projetos && cd ~/Projetos
git clone https://github.com/SEU-USUARIO/reservas-salas.git
cd reservas-salas
chmod +x instalar.sh iniciar.sh parar.sh
./instalar.sh
./iniciar.sh
```

- Funciona em Macs **Intel** e **Apple Silicon (M1/M2/M3/M4)**.
- Para encerrar: `Ctrl + C` no Terminal e depois `./parar.sh`.
- **Não use `sudo`.** O PostgreSQL não roda como administrador.

---

## 4. Linux

Testado em distribuições baseadas em Debian/Ubuntu. Funciona também em Fedora,
Arch e outras.

### 4.1. Instalar os pré-requisitos

**Ubuntu / Debian** (Node.js 22 LTS pelo repositório oficial NodeSource):

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

**Fedora**: `sudo dnf install -y nodejs git`  ·  **Arch**: `sudo pacman -S nodejs npm git`

*(Opcional)* Docker: <https://docs.docker.com/engine/install/>. Depois, adicione
seu usuário ao grupo docker (`sudo usermod -aG docker $USER`) e reinicie a sessão.

### 4.2. Baixar, instalar e iniciar

```bash
mkdir -p ~/projetos && cd ~/projetos
git clone https://github.com/SEU-USUARIO/reservas-salas.git
cd reservas-salas
chmod +x instalar.sh iniciar.sh parar.sh
./instalar.sh
./iniciar.sh
```

- **Não rode como root nem com `sudo`.** O PostgreSQL local se recusa a rodar como root.
- Para encerrar: `Ctrl + C` e depois `./parar.sh`.

---

## 5. Primeiro acesso e primeiro administrador

### Com dados de demonstração

Se você respondeu `S` na instalação, entre em <http://localhost:3000/admin> com:

- **E-mail:** `admin@exemplo.local`
- **Senha:** `Demo@12345`

Troque a senha em **Configurações → Alterar minha senha**. Antes de usar com
dados reais, crie um administrador de verdade e desative o de demonstração.

### Criar o seu administrador

No terminal, dentro da pasta do projeto:

```bash
npm run admin:criar
```

O comando pede nome, e-mail e senha (mínimo de 8 caracteres, com letras e
números). Depois disso, outros administradores podem ser criados pela tela
**Configurações**.

---

## 6. Uso diário: iniciar e parar

| Ação | Windows | macOS / Linux |
|---|---|---|
| Iniciar (modo desenvolvimento) | `iniciar.bat` | `./iniciar.sh` |
| Iniciar (modo produção, mais rápido) | `iniciar.bat producao` | `./iniciar.sh producao` |
| Parar tudo | `parar.bat` | `./parar.sh` |

O **modo desenvolvimento** recarrega a página automaticamente quando o código é
alterado. É o ideal para quem vai modificar o sistema.

### Testar no celular (mesma rede Wi-Fi)

Por segurança, o `iniciar` só aceita acessos do **próprio computador**. Para abrir
no celular durante os testes:

1. Encerre o sistema (`parar.bat` / `./parar.sh`).
2. Inicie o banco: `npm run db:start` (ou `docker compose up -d banco`, se usa Docker).
3. Rode `npm run dev:rede`.
4. Descubra o IP do computador:
   - Windows: `ipconfig` (linha “Endereço IPv4”, ex.: `192.168.0.15`);
   - macOS: `ipconfig getifaddr en0`;
   - Linux: `hostname -I`.
5. No celular, conectado ao **mesmo Wi-Fi**, abra `http://192.168.0.15:3000` (troque pelo seu IP).
6. No Windows, se não abrir, permita o Node.js quando o Firewall perguntar.

> Use `dev:rede` apenas em redes confiáveis (casa, escritório) e encerre depois
> (`Ctrl+C`): enquanto ele roda, qualquer aparelho da rede consegue acessar.

**Dica:** no celular, use **“Adicionar à tela inicial”** (iPhone/Safari: botão
Compartilhar; Android/Chrome: menu ⋮). O sistema abre em tela cheia, como um aplicativo.

### WhatsApp (opcional)

Para enviar o protocolo ao solicitante pelo WhatsApp:

1. Responda **S** quando o instalador perguntar sobre o WhatsApp.
2. O `iniciar` abre o serviço de WhatsApp junto (no Windows, numa janela separada).
3. Em **Configurações**, escaneie o QR Code com o celular do número que vai
   enviar as mensagens (**use um número dedicado ao sistema**).

Passo a passo completo, cuidados e solução de problemas:
[HOSPEDAGEM.md, seção 10](HOSPEDAGEM.md#10-whatsapp-envio-do-protocolo).

### Atualizar sua cópia depois de mudanças no GitHub

Windows:

```bat
cd C:\Projetos\reservas-salas
```
```bat
git pull
```
```bat
instalar.bat
```

macOS/Linux: `git pull` e depois `./instalar.sh`.

O instalador mantém seu `.env` e seus dados: ele só instala dependências novas e
aplica migrações do banco. Quando ele perguntar pelos dados fictícios, responda **N**.

---

## 7. Comandos manuais (qualquer sistema)

Os scripts apenas executam estes comandos na ordem. Você pode rodá-los à mão:

```bash
npm install                              # 1. dependências
node scripts/preparar-env.mjs            # 2. cria o .env (ou copie .env.example para .env)

# 3. banco de dados — escolha UMA opção:
docker compose up -d banco               #    a) com Docker
npm run db:start                         #    b) sem Docker (PostgreSQL local)

npm run db:migrate                       # 4. cria/atualiza as tabelas
npm run db:seed                          # 5. (opcional) dados fictícios
npm run admin:criar                      # 6. (opcional) seu administrador
npm run dev                              # 7. inicia em http://localhost:3000
```

Outros comandos úteis:

| Comando | O que faz |
|---|---|
| `npm test` | Executa os testes automáticos (usa o banco `reservas_teste`) |
| `npm run lint` | Verifica o padrão do código |
| `npm run typecheck` | Verifica os tipos do TypeScript |
| `npm run build` | Gera a versão de produção |
| `npm run db:studio` | Abre um visualizador do banco no navegador |
| `npm run db:stop` | Encerra o PostgreSQL local |
| `npm run dev:rede` | Inicia acessível pelo celular na mesma rede Wi-Fi |

---

## 8. Problemas comuns

| Sintoma | Causa provável e solução |
|---|---|
| `'node' não é reconhecido...` | Node.js não instalado ou terminal aberto antes da instalação. Instale e **abra um novo terminal**. |
| `initdb: error: file ... postgresql.conf.sample does not exist` (Windows) | Caminho da pasta longo demais. Mova o projeto para `C:\Projetos\reservas-salas`. |
| `O PostgreSQL não pode ser executado como root` | Rode os scripts sem `sudo`, com seu usuário normal. |
| `Port 3000 is already in use` | Já existe uma cópia rodando. Execute `parar.bat` / `./parar.sh`. |
| `Can't reach database server at localhost:5433` | O banco não está rodando. Execute `npm run db:start` (ou abra o Docker Desktop e rode `docker compose up -d banco`). |
| Porta `5433` ocupada | Outro PostgreSQL usa a porta. Altere a porta em `DATABASE_URL` e `DATABASE_URL_TEST` no `.env` (e em `docker-compose.yml`, se usar Docker). |
| Esqueci a senha do administrador | `npm run admin:criar` com o mesmo e-mail: a senha é redefinida. |
| Quero recomeçar do zero (apaga tudo!) | Pare o sistema e apague a pasta `.banco-local` (ou rode `docker compose down -v`). Depois rode o instalador de novo. |
| Mensagens de e-mail não chegam | É opcional. Configure `SMTP_*` no `.env` e ative em **Configurações**. Sem SMTP o sistema funciona normalmente. |
