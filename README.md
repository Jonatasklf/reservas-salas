# Sistema de Reservas de Salas

[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-033D60.svg)](LICENSE)

Sistema web para organizar as salas de reuniões de uma unidade administrativa:
calendário público de ocupação, solicitações de reserva sem cadastro, fila de
aprovação em ordem de chegada, reuniões recorrentes e área administrativa
completa, sempre **sem conflitos de horário**.

> Sistema de uso interno, inspirado na identidade visual da Congregação Cristã
> no Brasil. **Não é um serviço oficial da instituição.**

| Documento | Conteúdo |
|---|---|
| **[INSTALACAO.md](INSTALACAO.md)** | Passo a passo para Windows, macOS e Linux |
| **[HOSPEDAGEM.md](HOSPEDAGEM.md)** | Publicar na internet com domínio e HTTPS |
| **[ARQUITETURA.md](ARQUITETURA.md)** | Decisões técnicas e como os módulos se conectam |
| **[CHANGELOG.md](CHANGELOG.md)** | O que mudou em cada versão e como atualizar |

---

## Sumário

1. [Como o sistema funciona](#1-como-o-sistema-funciona)
2. [Tecnologias utilizadas](#2-tecnologias-utilizadas)
3. [Estrutura das pastas e arquivos](#3-estrutura-das-pastas-e-arquivos)
4. [Como baixar ou clonar o projeto](#4-como-baixar-ou-clonar-o-projeto)
5. [Como instalar as dependências](#5-como-instalar-as-dependências)
6. [Como executar localmente](#6-como-executar-localmente)
7. [Como configurar o banco de dados](#7-como-configurar-o-banco-de-dados)
8. [Como cadastrar o primeiro administrador](#8-como-cadastrar-o-primeiro-administrador)
9. [Como modificar o layout e as cores](#9-como-modificar-o-layout-e-as-cores)
10. [Como cadastrar novas funcionalidades](#10-como-cadastrar-novas-funcionalidades)
11. [Como testar as alterações](#11-como-testar-as-alterações)
12. [Como enviar atualizações ao GitHub](#12-como-enviar-atualizações-ao-github)

---

## 1. Como o sistema funciona

### Área pública (sem login)

Fluxo: **abrir o site → escolher a data → ver as salas → solicitar → receber protocolo.**

- **Calendário** mensal ou semanal, com indicadores dos dias com reservas e bloqueios.
- **Cartões das salas** no dia escolhido: capacidade, equipamentos, horários
  ocupados, horários livres e situação no horário filtrado.
- **Filtros**: horário, número de participantes, projetor e outros equipamentos.
- **Formulário de solicitação** em janela modal, com validação imediata. Se
  a capacidade não comportar o grupo, sugere salas alternativas.
- Ao enviar, o solicitante recebe **protocolo + código de acesso** na tela e
  pelo **WhatsApp** e/ou **e-mail** (canal escolhido em Configurações, com o
  outro como reserva). O pedido fica *Aguardando aprovação* (enviar não
  significa aprovar).
- **Consulta do protocolo** (`/protocolo`): exige protocolo e código, sem
  expor dados de outras pessoas.

### Área administrativa (`/admin`, com login)

| Menu | O que faz |
|---|---|
| Painel geral | Totais, próximas reuniões (7 dias), pendências e conflitos que exigem atenção |
| Salas | Cadastro, edição, desativação, horários, equipamentos e tipos de equipamento |
| Reuniões recorrentes | Cadastro com verificação de conflitos; exceções por ocorrência; suspensão; encerramento |
| Reservas | Reservas diretas, edição, cancelamento, histórico, exportação CSV e impressão/PDF |
| Solicitações | Fila cronológica; aprovar, rejeitar, pedir informações, sugerir outra sala/horário |
| Calendário administrativo | Ocupação de todas as salas + bloqueios (feriados, manutenção) |
| Configurações | Nome da unidade, logotipo, horários, regras, canal (WhatsApp/e-mail), conexão do WhatsApp, administradores, senha |

### Regras centrais

1. **Disponibilidade:** a sala só está disponível se estiver ativa, comportar os
   participantes, estiver aberta no intervalo inteiro e não houver reserva
   confirmada, ocorrência recorrente ou bloqueio sobreposto.
2. **Sobreposição:** intervalos são semiabertos. Uma reunião das 14h às 16h
   **não** conflita com outra das 16h às 18h.
3. **Fila:** ordem de chegada pelo relógio do servidor (`receivedAt`) e por um
   número sequencial do banco (`sequence`). Para aprovar um pedido posterior a
   outro concorrente, é exigida justificativa, que fica no histórico.
4. **Concorrência:** aprovações simultâneas são serializadas por sala
   (*advisory lock*). Uma restrição do PostgreSQL impede, em último caso, duas
   reservas confirmadas sobrepostas.
5. **Recorrências:** calculadas sob demanda a partir da regra (padrão RRULE),
   sem gravar uma linha por semana. Nunca sobrescrevem reservas existentes.
6. **Privacidade (LGPD):** o público vê só sala, horários e títulos autorizados.
   Nomes, contatos e justificativas ficam restritos à administração.

Detalhes em [ARQUITETURA.md](ARQUITETURA.md).

---

## 2. Tecnologias utilizadas

| Camada | Tecnologia | Por quê |
|---|---|---|
| Aplicação | **Next.js 15** (React 19, TypeScript) | Frontend e API no mesmo projeto, fácil de hospedar |
| Estilo | **Tailwind CSS 4** | Cores centralizadas em um só arquivo |
| Componentes | Padrão **shadcn/ui** (Radix + Tailwind), em `src/components/ui` | Código próprio e editável, acessível |
| Calendário público | **react-day-picker** | Biblioteca madura e acessível (teclado/leitor de tela) |
| Banco de dados | **PostgreSQL** + **Prisma** (ORM e migrações) | Transações e restrições contra conflitos |
| Recorrência | **rrule** (RFC 5545) | Padrão consolidado de regras de repetição |
| Validação | **zod** | Mesmos esquemas no navegador e no servidor |
| Autenticação | Sessão JWT (**jose**) em cookie httpOnly + **bcrypt** | Simples, segura, sem serviço externo |
| Testes | **Vitest** | Testes unitários e de integração com banco real |
| Datas | **date-fns-tz** | Exibição sempre no fuso `America/Sao_Paulo` |

---

## 3. Estrutura das pastas e arquivos

```
├── prisma/
│   ├── schema.prisma          # Modelo de dados (tabelas e relacionamentos)
│   ├── migrations/            # Migrações SQL (inclui a trava anticonflito)
│   └── seed.ts                # Dados fictícios de demonstração
├── src/
│   ├── config/site.ts         # ⭐ Textos, rótulos e regras padrão (personalização)
│   ├── app/
│   │   ├── globals.css        # ⭐ Cores e identidade visual
│   │   ├── page.tsx           # Página inicial pública
│   │   ├── protocolo/         # Consulta de protocolo
│   │   ├── admin/login/       # Login
│   │   ├── admin/(painel)/    # Páginas administrativas (protegidas)
│   │   └── api/               # API: public/, auth/, admin/
│   ├── components/
│   │   ├── ui/                # Botões, campos, modais, alertas (base visual)
│   │   ├── public/            # Calendário, cartões de sala, formulário
│   │   └── admin/             # Telas administrativas
│   ├── server/
│   │   ├── availability.ts    # ⭐ Regras de disponibilidade (funções puras)
│   │   ├── recurrence.ts      # ⭐ Motor de recorrência
│   │   ├── occupancy.ts       # Junta reservas + recorrências + bloqueios
│   │   └── services/          # Regras de negócio por assunto (salas, solicitações…)
│   ├── lib/                   # Banco, autenticação, validação, datas, erros
│   └── middleware.ts          # Proteção das rotas /admin e /api/admin
├── tests/                     # Testes automáticos
├── servico-whatsapp/          # Serviço de WhatsApp (whatsapp-web.js), opcional
├── scripts/                   # Banco local, criação de admin, preparação do .env
├── instalar / iniciar / parar (.bat e .sh)
├── docker-compose.yml         # PostgreSQL para desenvolvimento
├── docker-compose.producao.yml, Dockerfile, Caddyfile  # Hospedagem
└── .env.example, .env.producao.example
```

---

## 4. Como baixar ou clonar o projeto

```bash
git clone https://github.com/SEU-USUARIO/reservas-salas.git
cd reservas-salas
```

No Windows, use uma pasta curta (ex.: `C:\Projetos`). Sem Git, use
**Code → Download ZIP** no GitHub.

## 5. Como instalar as dependências

Pré-requisito: **Node.js 20+**. Depois, execute `instalar.bat` (Windows) ou
`./instalar.sh` (macOS/Linux), ou manualmente `npm install`. Detalhes por
sistema em **[INSTALACAO.md](INSTALACAO.md)**.

## 6. Como executar localmente

| Windows | macOS / Linux |
|---|---|
| `iniciar.bat` | `./iniciar.sh` |
| `parar.bat` | `./parar.sh` |

Acesse <http://localhost:3000> (público) e <http://localhost:3000/admin> (administração).
Manualmente: `npm run db:start` (ou `docker compose up -d banco`) e depois `npm run dev`.

## 7. Como configurar o banco de dados

- As configurações ficam no arquivo `.env` (modelo em `.env.example`):
  `DATABASE_URL` (principal) e `DATABASE_URL_TEST` (testes).
- **Sem Docker:** `npm run db:start` cria e inicia um PostgreSQL local em `.banco-local/`.
- **Com Docker:** `docker compose up -d banco`.
- **Criar/atualizar tabelas:** `npm run db:migrate`.
- **Dados de demonstração:** `npm run db:seed`.
- **Alterar o modelo de dados:** edite `prisma/schema.prisma` e rode
  `npm run db:migrate:dev -- --name descricao-da-mudanca`. Isso gera uma nova
  migração em `prisma/migrations/`, que deve ser enviada ao GitHub.

## 8. Como cadastrar o primeiro administrador

```bash
npm run admin:criar
```

O comando pede nome, e-mail e senha. Os demais administradores podem ser
criados em **Configurações**. Em servidores sem interação:

```bash
npm run admin:criar -- --nome "Nome Completo" --email pessoa@exemplo.com --senha "SenhaForte123"
```

## 9. Como modificar o layout e as cores

| O que mudar | Onde |
|---|---|
| **Cores** (azul, cinzas, estados) | `src/app/globals.css`, bloco `@theme`. As classes (`bg-primary` etc.) se atualizam sozinhas. |
| Fonte | `--font-sans` no mesmo bloco |
| Nome da unidade, subtítulo, rodapé, logotipo, horários | Tela **Configurações** (sem código) |
| Textos e rótulos (situações, frequências, dias) | `src/config/site.ts` |
| Botões, campos, modais, cartões (todos de uma vez) | `src/components/ui/index.tsx` |
| Layout da página inicial | `src/components/public/public-home.tsx` |
| Cartão da sala | `src/components/public/room-card.tsx` |
| Cabeçalho/rodapé públicos | `src/components/public/site-header.tsx` |
| Menu administrativo | `src/components/admin/shell.tsx` (lista `NAV`) |

**Logotipo:** envie pela tela Configurações (PNG/JPG/WEBP até 512 KB). Use
apenas imagens autorizadas e sem modificações indevidas.

## 10. Como cadastrar novas funcionalidades

Siga o caminho que os dados percorrem:

1. **Banco:** se precisar de campo ou tabela nova, edite `prisma/schema.prisma`
   e gere a migração (`npm run db:migrate:dev -- --name ...`).
2. **Validação:** crie ou ajuste o esquema em `src/lib/validation.ts`.
3. **Regra de negócio:** escreva a função em `src/server/services/<assunto>.ts`.
   Para algo que ocupa uma sala, **sempre** use `transaction` + `lockRooms` +
   `evaluateBooking` (veja `reservations.ts` como modelo).
4. **API:** crie `src/app/api/admin/<recurso>/route.ts` usando `adminRoute(...)`
   (já exige login) ou `publicRoute(...)`.
5. **Tela:** crie o componente em `src/components/admin/` e a página em
   `src/app/admin/(painel)/<rota>/page.tsx`. Adicione o item ao menu em `shell.tsx`.
6. **Teste:** acrescente um teste em `tests/`.

### Exemplos rápidos

- **Novo tipo de equipamento:** não precisa de código. Use **Salas → Tipos de equipamento**.
- **Novo campo no formulário de solicitação** (ex.: “departamento”):
  1. `schema.prisma`: adicione `department String?` em `ReservationRequest` e gere a migração;
  2. `validation.ts`: adicione `department: optionalText(120)` em `publicRequestSchema`;
  3. `services/requests.ts`: inclua `department: input.department` no `create`;
  4. `components/public/request-dialog.tsx`: adicione o `Field` e o valor no estado `form`;
  5. `components/admin/requests-page.tsx`: exiba o campo no detalhe.
- **Textos dos e-mails:** `src/server/emails.ts` (confirmação com protocolo,
  atualizações e aviso à administração).
- **Textos do WhatsApp:** `src/server/whatsapp-mensagens.ts`.
- **Regra de canal (WhatsApp/e-mail e reserva):** `src/server/notifications.ts`.
- **Quando cada aviso é enviado:** `createPublicRequest` e `notifyRequester` em
  `src/server/services/requests.ts`. Transportes: `src/lib/email.ts` (SMTP) e
  `src/lib/whatsapp.ts` (fala com o serviço `servico-whatsapp/`). Configuração:
  [HOSPEDAGEM.md, seções 9 e 10](HOSPEDAGEM.md#10-whatsapp-envio-do-protocolo).
- **Regras de antecedência e horários padrão:** tela **Configurações**. Duração
  mínima, passo dos horários e horizonte de recorrência ficam em `src/config/site.ts`.

## 11. Como testar as alterações

```bash
npm test            # testes automáticos (precisa do banco rodando)
npm run lint        # padrão de código
npm run typecheck   # tipos
npm run build       # garante que a versão de produção compila
```

Os testes usam um banco separado (`reservas_teste`), apagado a cada execução.
Os cenários obrigatórios do projeto estão cobertos:

| # | Cenário | Arquivo |
|---|---|---|
| 1 | 25 participantes em sala de 20: rejeitar | `availability.test.ts`, `requests.integration.test.ts` |
| 2 | Duas reservas confirmadas simultâneas: impedir | `requests.integration.test.ts` |
| 3 | Recorrência semanal ocupa os horários futuros | `recurrence.test.ts`, `recurring.integration.test.ts` |
| 4 | Cancelar uma ocorrência libera só aquele horário | idem |
| 5 | Alterar recorrência preserva exceções e histórico | `recurring.integration.test.ts` |
| 6 | Solicitações concorrentes mantêm a ordem cronológica | `requests.integration.test.ts` |
| 7 | Aprovação atualiza a disponibilidade | `requests.integration.test.ts` |
| 8 | Sala desativada impede reservas | `availability.test.ts`, `requests.integration.test.ts` |
| 9 | Não autenticado não acessa a administração | `auth.integration.test.ts` |
| 10 | Duas aprovações simultâneas: só uma é confirmada | `requests.integration.test.ts` |
| 11 | Horários consecutivos são permitidos | `availability.test.ts`, `requests.integration.test.ts` |
| 12 | Horário no passado é impedido | `availability.test.ts`, `requests.integration.test.ts` |

Além desses:

- `security.integration.test.ts` testa **todas** as rotas administrativas sem
  login, tokens forjados, expirados ou sem assinatura, encerramento de
  sessões, CSRF, envios gigantes e privacidade da API pública.
- `notifications.integration.test.ts` confere o envio do protocolo e do código
  por WhatsApp e/ou e-mail conforme o canal, o uso do outro canal quando um
  falha, a normalização dos telefones e o escape do conteúdo digitado.

**Ao criar uma rota administrativa nova, o teste de segurança a encontra
sozinho** e falha se ela responder sem login.

## 12. Como enviar atualizações ao GitHub

```bash
git checkout -b minha-melhoria        # crie um ramo para a alteração
# ... edite, rode npm test ...
git add .
git commit -m "Descreva o que foi alterado"
git push -u origin minha-melhoria
```

No GitHub, abra um **Pull Request** para revisão e depois faça o *merge* na
`main`. Para publicar a atualização no servidor, veja
[HOSPEDAGEM.md → Atualizar](HOSPEDAGEM.md#4-atualizar-o-sistema-publicado).

**Nunca envie** `.env`, `.env.producao`, a pasta `.banco-local/` nem backups
do banco. O `.gitignore` já os exclui.

### Versões (releases)

Cada versão publicada recebe uma *tag* (`v1.0.0`, `v1.1.0`…) e uma **Release** no
GitHub, com o `.zip` do código daquela época. As versões antigas continuam
disponíveis em **Releases**. O que mudou está no [CHANGELOG.md](CHANGELOG.md).

Para usar uma versão específica:

```bash
git checkout v1.0.0
```

Para voltar à mais recente: `git checkout main`.

Para publicar uma versão nova: atualize `"version"` no `package.json` e o
`CHANGELOG.md`, faça o commit e depois:

```bash
git tag -a v1.2.0 -m "Versão 1.2.0"
git push origin main --tags
```

Por fim, crie a Release no GitHub a partir da tag (botão **Draft a new release**).

### Primeira publicação do repositório

```bash
git remote add origin https://github.com/SEU-USUARIO/reservas-salas.git
git push -u origin main
```

---

## Licença

Este projeto é distribuído sob a **Licença MIT**. Veja o arquivo [LICENSE](LICENSE).

Em resumo: qualquer pessoa pode usar, copiar, modificar, mesclar, publicar,
distribuir, sublicenciar e vender cópias do software, desde que o aviso de
copyright e o texto da licença sejam mantidos. O software é fornecido
“como está”, sem garantias.

A licença cobre o **código-fonte** deste repositório. Ela não concede direitos
sobre nomes, marcas ou logotipos de terceiros (por exemplo, o logotipo enviado
pela tela Configurações).
