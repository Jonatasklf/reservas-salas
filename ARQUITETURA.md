# Arquitetura

Documento para desenvolvedores: as decisões técnicas, por que foram tomadas e
como os módulos interagem.

## 1. Visão geral

Um único projeto **Next.js** contém a interface (React) e a API (Route
Handlers). O backend usa **PostgreSQL** via **Prisma**.

```
Navegador ──► Páginas (src/app) ──► Componentes (src/components)
                                          │ fetch JSON
                                          ▼
                  API (src/app/api/**/route.ts) ── valida com zod (src/lib/validation.ts)
                                          │
                                          ▼
                      Serviços (src/server/services/*) ── auditoria
                         │                 │
                         ▼                 ▼
     Regras puras (availability.ts,   Ocupação (occupancy.ts)
       recurrence.ts)                      │
                                           ▼
                                PostgreSQL (Prisma)
```

**Por que REST (Route Handlers) e não Server Actions?** A API fica explícita,
testável isoladamente e reutilizável por outros clientes no futuro (aplicativo,
integrações).

## 2. Camadas e responsabilidades

| Camada | Arquivos | Regra |
|---|---|---|
| Regras puras | `src/server/availability.ts`, `src/server/recurrence.ts` | Sem banco, sem efeitos. Fáceis de testar e usadas também no navegador. |
| Ocupação | `src/server/occupancy.ts` | Junta reservas confirmadas, ocorrências recorrentes e bloqueios em `BusySlot[]`. |
| Serviços | `src/server/services/*.ts` | Regras de negócio, transações, travas e auditoria. **Única** camada que grava no banco. |
| API | `src/app/api/**` | Fina: autentica, valida a entrada, chama o serviço e devolve JSON. |
| Interface | `src/components/**`, `src/app/**/page.tsx` | Valida para dar retorno imediato, mas o servidor sempre revalida. |

## 3. Disponibilidade (regra central)

`checkRoomAvailability()` em `availability.ts` devolve **todos** os problemas
de um pedido: intervalo inválido, duração mínima, passado, antecedência
(pedidos públicos), sala inativa, capacidade, dia/horário de funcionamento,
conflito e bloqueio.

O mesmo cálculo é usado no filtro público, no formulário, na criação da
solicitação, na aprovação, nas reservas administrativas, nas exceções de
recorrência e na pré-visualização de recorrências. `services/booking.ts` é o
ponto que carrega os dados do banco e chama a regra.

**Sobreposição:** `a.início < b.fim && b.início < a.fim` (intervalo semiaberto).
Horários consecutivos não conflitam.

**Solicitações pendentes não ocupam a sala.** Elas aparecem para o público
como “em análise”, sem dados pessoais, e entram na fila.

## 4. Concorrência

Três camadas de proteção:

1. **Advisory lock por sala** (`lockRooms` em `src/lib/db.ts`): toda operação
   que ocupa uma sala roda numa transação que trava a sala primeiro. Operações
   simultâneas na mesma sala passam a ocorrer em fila. A ordem é sempre
   *sala → registro*, e as salas são travadas em ordem alfabética, o que evita
   *deadlocks*.
2. **Revalidação dentro da transação:** depois de travar, a disponibilidade é
   calculada de novo.
3. **Restrição de exclusão no PostgreSQL** (migração inicial):
   `EXCLUDE USING gist (roomId WITH =, tsrange(startAt, endAt, '[)') WITH &&) WHERE status = 'CONFIRMED'`.
   Mesmo um bug na aplicação não consegue gravar duas reservas confirmadas
   sobrepostas.

O teste “duas aprovações simultâneas” prova que apenas uma é confirmada e que
a outra falha por regra de negócio (não por erro de banco).

## 5. Fila cronológica

- `receivedAt`: horário do **servidor** no recebimento.
- `sequence`: número crescente do banco (`nextval`), que desempata pedidos no
  mesmo milissegundo. A fila é ordenada por `sequence`.
- `protocol`: `AAAA-NNNNNN`, derivado de `sequence`.
- Código de acesso: 8 caracteres aleatórios (`crypto.randomBytes`). Só o
  **hash SHA-256** é gravado, e a comparação é em tempo constante.
- Concorrência entre pedidos: `findCompetingRequests()`. Aprovar um pedido com
  outro **anterior** concorrente em aberto exige `priorityJustification`
  (registrada como `REQUEST_APPROVED_OUT_OF_ORDER`).
- Após aprovar, os pedidos conflitantes recebem `availabilityLostAt` e um
  registro na auditoria. A fila também recalcula a disponibilidade a cada
  consulta (`currentIssues`).

## 6. Recorrências

Uma `RecurringMeeting` guarda a **regra**, não as ocorrências:

- `frequency`: `DAILY`, `WEEKLY`, `BIWEEKLY`, `MONTHLY_DAY`, `MONTHLY_NTH_WEEKDAY`
  (ex.: 1ª segunda-feira) e `CUSTOM` (a cada N semanas).
- `startTime`/`endTime` em horário local; `startDate`/`endDate` como data.
- `rrule`: texto RFC 5545 equivalente, guardado para referência e integrações.

`expandOccurrences()` usa a biblioteca `rrule` sobre **datas de calendário**
(meia-noite UTC representando o dia) e só depois combina com o horário de
São Paulo. Assim, as ocorrências nunca mudam de dia por causa de fuso.

**Exceções** (`RecurrenceException`, única por série + data original):

- `CANCELLED`: a ocorrência não acontece e a sala fica livre;
- `MODIFIED`: outra sala e/ou outro horário (validados como uma nova reserva).

Outras operações:

| Operação | Comportamento |
|---|---|
| Suspender | Período em que as ocorrências não ocupam a sala |
| Retomar | Lista as datas reservadas durante a suspensão (precisam ser confirmadas para ficar de fora) |
| Encerrar | Define `endDate`; ocorrências anteriores permanecem |
| Editar ocorrências futuras | Se a data efetiva é após o início, a série é **dividida**: a antiga termina na véspera (`ENDED`) e uma nova começa com `previousSeriesId`. As exceções futuras migram para a nova série. O passado nunca é alterado. |
| Cadastrar / editar | Pré-visualização lista as datas em conflito (até 2 anos à frente, configurável). Uma recorrência **nunca** sobrescreve reservas: ou a regra é ajustada, ou as datas viram exceções `CANCELLED` com o motivo. |

## 7. Modelo de dados (resumo)

```
Admin ─┬─< AuditLog
Room ──┼─< RoomEquipment >── Equipment
       ├─< ReservationRequest ─< RequestEquipment
       │        └── (1:1) Reservation ─< ReservationEquipment
       ├─< Reservation
       ├─< RecurringMeeting ─< RecurrenceException
       │        └─< RecurringEquipment          └── newRoom → Room
       └─< AvailabilityBlock (roomId nulo = todas as salas)
Settings (registro único id = 1)
```

Principais restrições e índices:

- exclusão anticonflito em `Reservation`;
- `CHECK` de intervalos e de participantes;
- `Settings.id = 1`;
- índices por `(roomId, startAt, endAt)` e `(status, sequence)`;
- `@@unique([recurringMeetingId, originalDate])`.

Salas e equipamentos **nunca** são apagados (desativação), o que preserva o
histórico. Instantes ficam em UTC, e o banco é forçado a `timezone = UTC`
pela migração.

## 8. Autenticação e segurança

- Senhas: **bcrypt** custo 12. Login com limitação de tentativas (por IP e
  por e-mail) e tempo de resposta uniforme.
- Sessão: JWT HS256 (`jose`) em cookie `httpOnly`, `SameSite=Lax`, `Secure`
  em produção HTTPS. A expiração é configurável (`SESSION_HOURS`).
- `sessionVersion`: trocar a senha, desativar um administrador ou usar
  **“Encerrar sessões em outros aparelhos”** invalida as sessões existentes.
- **Segredo da sessão:** `AUTH_SECRET` precisa ter 32+ caracteres e o sistema
  **recusa os valores de exemplo** do repositório (senão qualquer pessoa que
  lesse o GitHub poderia forjar uma sessão de administrador).
- Defesa em profundidade, em três camadas:
  1. `middleware.ts` barra `/admin` e `/api/admin`;
  2. o layout das páginas administrativas confere a sessão no servidor (a
     página de impressão, que lê dados direto, confere de novo);
  3. cada rota administrativa usa `adminRoute()` → `requireAdmin()`, que
     consulta o banco (administrador ativo e versão da sessão).
  O teste `tests/security.integration.test.ts` percorre **todas** as rotas em
  `src/app/api/admin/**` e falha se alguma responder sem sessão.
- CSRF: requisições que alteram dados são recusadas se o `Origin` for de outro
  site ou se o navegador indicar `Sec-Fetch-Site: cross-site`.
- Cabeçalhos: **Content-Security-Policy** (só recursos do próprio site, sem
  iframes de terceiros), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, `Cross-Origin-Opener-Policy`; páginas administrativas
  com `Cache-Control: no-store`; em produção, HSTS via Caddy.
- Corpo JSON limitado a 64 KB (protege contra envios gigantes).
- Logotipo: aceito só se a **assinatura real** do arquivo for PNG/JPG/WEBP.
- Auditoria de acesso: logins e tentativas erradas ficam no `AuditLog`; o
  painel alerta com 5+ falhas em 24 h e quando o administrador de
  demonstração (senha pública) está ativo.
- Desenvolvimento: `npm run dev` e o PostgreSQL do Docker escutam só em
  `127.0.0.1` (ninguém da rede acessa). `npm run dev:rede` é a opção
  explícita para testar no celular.
- Dependências: `npm audit` sem vulnerabilidades conhecidas. Pacotes
  internos de ferramentas foram fixados em versões corrigidas via `overrides`
  no `package.json`. Rode `npm audit` periodicamente.
- Exportação CSV protegida contra injeção de fórmulas; e-mails escapam todo
  conteúdo digitado por usuários.
- Limitador de tentativas em memória (`src/lib/rate-limit.ts`): por IP e por
  e-mail. O IP vem do cabeçalho `X-Forwarded-For`, confiável atrás do Caddy;
  sem proxy ele pode ser falsificado, mas o limite por e-mail continua valendo.
  Para várias instâncias, substitua por um armazenamento compartilhado.

**Sugestões futuras:** verificação em duas etapas (TOTP) para administradores
e perfis de acesso (ex.: somente leitura).

## 9. Privacidade (LGPD)

- **Minimização:** o público informa apenas nome, finalidade e um contato.
- A API pública **nunca** devolve nome, contato ou títulos internos. Exibe
  “Reservado” ou o título marcado como público (por reserva e pela opção
  global em Configurações).
- A consulta de protocolo exige código de acesso e devolve só a situação do
  próprio pedido.
- Justificativas internas e histórico ficam só na administração.
- Auditoria (`AuditLog`) de todas as decisões administrativas importantes.

## 10. Datas e fuso horário

Toda conversão passa por `src/lib/time.ts`:

| Função | Uso |
|---|---|
| `zonedToUtc(data, hora)` | Entrada do usuário (São Paulo) → instante UTC |
| `utcToDateString` / `utcToTimeString` | Instante → data/hora locais |
| `formatDateLong`, `formatRange` etc. | Exibição em pt-BR |

O fuso está em `src/config/site.ts` (`timeZone`).

## 11. Erros

Os serviços lançam `AppError(status, código, mensagem, detalhes)`. O wrapper
`handle()` (`src/lib/api.ts`) converte tudo para:

```json
{ "error": { "code": "...", "message": "...", "details": {} } }
```

Erros de validação viram `400` com `details.fields`. Conflitos viram `409` com
a lista de conflitos. A interface mostra esses detalhes (`ApiErrorAlert`).

Códigos usados:

| Código | Significado |
|---|---|
| `VALIDATION` | Campos inválidos |
| `UNAVAILABLE` | Sala indisponível (vem com `issues`/`alternatives`) |
| `EARLIER_REQUEST_PENDING` | Há pedido anterior concorrente; exige justificativa |
| `RECURRENCE_CONFLICTS` | Recorrência com datas em conflito (vem com `preview`) |
| `NEEDS_CONFIRMATION` | Ação precisa de confirmação explícita |
| `UNAUTHORIZED` | Sem sessão válida |
| `NOT_FOUND` | Registro inexistente |
| `CONFLICT` | Estado não permite a ação |
| `TOO_MANY_REQUESTS` | Limite de tentativas atingido |

## 12. Avisos ao solicitante (WhatsApp e e-mail)

```
requests.ts ──► notifications.ts (escolhe o canal e a reserva)
                   ├── lib/whatsapp.ts ──HTTP+token──► servico-whatsapp/ ──► WhatsApp Web
                   └── lib/email.ts ──SMTP──► servidor de e-mail
```

- **Canal** (`Settings.requesterChannel`): `WHATSAPP` (padrão), `EMAIL` ou
  `BOTH`. `deliverToRequester()` tenta o canal principal e, se não houver o
  contato ou o envio falhar, o outro. O resultado (`DeliveryReport`) aparece
  na tela de confirmação. Nunca lança erro.
- **Mensagens:** `src/server/emails.ts` (texto + HTML) e
  `src/server/whatsapp-mensagens.ts` (texto com a formatação do WhatsApp).
  O conteúdo digitado é escapado (HTML) ou limpo de marcações (WhatsApp).
- **Envios:**
  - confirmação com protocolo + código, logo após o pedido (o pedido já está
    gravado; o envio tem limite de tempo para não travar a tela);
  - atualizações (aprovação, rejeição, informações, sugestão, cancelamento),
    em segundo plano;
  - aviso de nova solicitação à administração (e-mail), se ativado.
- Os links levam o **protocolo** na URL, **nunca** o código de acesso.
- **Testes de configuração:** botões “Enviar e-mail de teste” e “Enviar teste”
  (WhatsApp) em Configurações mostram o erro real.

### E-mail

`src/lib/email.ts`: com `SMTP_HOST` envia de verdade. Sem SMTP em
desenvolvimento, salva `.eml` em `.emails-enviados/`. Em produção sem SMTP,
só registra no log.

### WhatsApp

- **Serviço separado** (`servico-whatsapp/servidor.mjs`, com dependências
  próprias): o whatsapp-web.js mantém um Chrome com o WhatsApp Web, o que exige
  um processo que roda o tempo todo, independente do Next.js (que pode reiniciar
  ou rodar em várias instâncias). Isso também evita baixar o Chrome em quem não
  usa WhatsApp.
- **Comunicação:** HTTP interno (`WHATSAPP_URL`) com `Authorization: Bearer
  WHATSAPP_TOKEN` (comparação em tempo constante). Endpoints: `GET /status`
  (estado + QR em data URL), `POST /enviar`, `POST /sair`. Escuta em `127.0.0.1`
  no computador; no Docker fica sem porta publicada.
- **Envio:** fila de uma mensagem por vez, com intervalo aleatório de 2 a 3,5 s
  (`WHATSAPP_INTERVALO_MS`). `getNumberId()` resolve o número real no WhatsApp
  (inclusive a questão do 9º dígito); número sem WhatsApp devolve
  `SEM_WHATSAPP` e o sistema usa o e-mail.
- **Sessão:** `LocalAuth` em `servico-whatsapp/.sessao` (ou
  `WHATSAPP_SESSAO_DIR`). Cada tentativa de conexão cria um cliente/Chrome novo
  e fecha o anterior. Em queda, reconecta sozinho.
- **Telefones:** `normalizePhoneBR()` aceita os formatos usuais e devolve
  `55DDNNNNNNNNN`.
- **Sem serviço configurado** (desenvolvimento): mensagens salvas em
  `.whatsapp-enviados/`.
- **Riscos conhecidos:** biblioteca não oficial (pode quebrar com mudanças do
  WhatsApp Web; o número pode ser restringido). Mitigações: fallback para
  e-mail, número dedicado, fila com intervalo. Nesta versão a biblioteca está
  fixada no commit `38eb45b` do GitHub (correção ainda não publicada no npm).
- **Dependências do Puppeteer:** o `extract-zip` (usado só para descompactar o
  Chrome oficial na instalação) tem alerta sem versão corrigida. Na imagem
  Docker o download é desativado e usa-se o Chromium do sistema.
- **Alternativa oficial:** para trocar pela WhatsApp Cloud API (Meta),
  basta reimplementar `sendWhatsApp()`/`getWhatsAppStatus()` em
  `src/lib/whatsapp.ts`; o resto do sistema não muda.

## 13. Banco local sem Docker

`scripts/banco-local.mjs` usa os binários oficiais do PostgreSQL distribuídos
pelo pacote npm `embedded-postgres` e os controla com `initdb`/`pg_ctl` (o
servidor roda em segundo plano, com log em `.banco-local/postgres.log`). Os
bancos `reservas` e `reservas_teste` são criados pelo Prisma ao migrar. Na
imagem Docker de produção esses binários são removidos.

## 14. Pontos de extensão sugeridos

- Calendário iCal (`.ics`) por sala, gerado a partir das ocorrências (o campo `rrule` já existe).
- Notificações por WhatsApp/SMS: novo transporte ao lado de `src/lib/email.ts`.
- Perfis de administrador (somente leitura, aprovador): campo `role` em `Admin` + verificação em `adminRoute`.
- Limitador de tentativas compartilhado (Redis) para hospedagem com várias instâncias.
