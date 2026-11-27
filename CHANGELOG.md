# Histórico de versões

Todas as mudanças importantes do projeto ficam registradas aqui. As versões
seguem o padrão [SemVer](https://semver.org/lang/pt-BR/): `MAIOR.MENOR.CORREÇÃO`.
A versão mais recente fica no ramo `main`; cada versão anterior fica guardada numa *tag* (GitHub → **Tags**).

## [1.2.0] — 27/11/2026

### Novo

- **Relatórios** (menu *Relatórios*): escolha o período (este mês, mês
  anterior, últimos 30 dias, este ano ou personalizado) e, se quiser, uma sala.
  Mostra solicitações por situação, taxa de aprovação, tempo médio de
  resposta, horas ocupadas e taxa de ocupação por sala, uso por dia da semana
  e por horário, mensagens enviadas/com falha por canal e acessos ao painel.
  Cada gráfico pode ser visto como tabela. Exporta **CSV** (abre no Excel com
  acentos) e imprime/salva em **PDF**.
- **Registro de atividades** (menu *Registro de atividades*): tudo o que
  acontece no sistema — solicitações, decisões, reservas, recorrências, salas,
  bloqueios, configurações, acessos e mensagens enviadas — com filtros por
  período, categoria, quem fez e texto, paginação e exportação CSV.
- O envio do protocolo e das atualizações (WhatsApp e e-mail, com sucesso ou
  falha) passa a ficar registrado no histórico da solicitação.

### Alterado

- Novo índice no histórico (migração `indice_atividades`), aplicado
  automaticamente pelo `iniciar`.
- Segurança: os testes automáticos nunca enviam mensagens de verdade, mesmo
  com SMTP ou WhatsApp configurados no `.env`.

## [1.1.1] — 25/11/2026

### Alterado

- Mensagens de WhatsApp e e-mail (confirmação e atualizações) agora começam com
  **“A paz de Deus, Irmão(a) {nome}!”** e terminam com o aviso de mensagem
  automática e **“Deus que abençoe.”**
- Saudação, aviso e despedida ficam em um só lugar: `src/config/site.ts`
  (bloco `mensagens`).
- `.wwebjs_cache/` e `.wwebjs_auth/` adicionados ao `.gitignore`.

## [1.1.0] — 25/11/2026

### Novo

- **Protocolo por WhatsApp.** O solicitante recebe protocolo, código de acesso
  e atualizações (aprovação, rejeição, pedido de informações, sugestão,
  cancelamento) pelo WhatsApp, usando o serviço `servico-whatsapp/`
  (whatsapp-web.js).
- **Escolha do canal** em Configurações: WhatsApp, e-mail ou ambos. Se o canal
  escolhido falhar ou o contato não existir, o sistema usa o outro canal.
- Cartão **WhatsApp** em Configurações: QR Code para conectar o número,
  situação da conexão, mensagem de teste e desconexão.
- A tela de confirmação informa por onde o protocolo foi enviado.
- Em desenvolvimento, sem o serviço configurado, as mensagens são salvas em
  `.whatsapp-enviados/` para conferência.
- Docker: serviço `whatsapp` opcional (perfil `whatsapp`) com Chromium do sistema.
- Instalador e `iniciar` cuidam do serviço; `parar` o encerra (a sessão continua salva).

### Alterado

- O instalador e o `iniciar` acrescentam ao `.env` as variáveis novas
  (ex.: `WHATSAPP_TOKEN`) **sem alterar** as existentes.
- Formulário público: o campo de telefone virou “WhatsApp / telefone”.

### Banco de dados

- Migração `canal_de_notificacao`: novo campo `Settings.requesterChannel`
  (padrão: WhatsApp). É aplicada automaticamente pelo instalador/`iniciar`.

### Como atualizar a partir da 1.0.0

```bash
git pull
```

Depois rode o instalador (`instalar.bat` / `./instalar.sh`), responda **N** aos
dados fictícios e **S** ao WhatsApp, se for usar. Na VPS, veja `HOSPEDAGEM.md`,
seção 10.2.

## [1.0.0] — 13/11/2026

Primeira versão publicada.

- Calendário público (mensal/semanal), cartões das salas, filtros de
  disponibilidade e solicitação de reserva sem cadastro, com protocolo e
  código de acesso.
- Área administrativa: painel, salas e equipamentos, reuniões recorrentes
  (RRULE, exceções, suspensão, divisão da série), reservas, fila cronológica de
  solicitações com tratamento de concorrência, calendário administrativo,
  bloqueios, configurações, exportação CSV e impressão/PDF.
- Proteção contra reservas sobrepostas em três camadas (trava por sala,
  revalidação na transação e restrição de exclusão no PostgreSQL).
- Protocolo e atualizações por e-mail (SMTP opcional).
- Segurança: sessões assinadas, auditoria, CSP, CSRF, limite de tentativas,
  rejeição de segredos de exemplo e teste que percorre todas as rotas administrativas.
- Versão para celular, instaladores para Windows/macOS/Linux, Docker Compose com
  HTTPS automático (Caddy) e documentação completa.
- Licença MIT.

[1.2.0]: https://github.com/Jonatasklf/reservas-salas/tree/v1.2.0
[1.1.1]: https://github.com/Jonatasklf/reservas-salas/tree/v1.1.1
[1.1.0]: https://github.com/Jonatasklf/reservas-salas/tree/v1.1.0
[1.0.0]: https://github.com/Jonatasklf/reservas-salas/tree/v1.0.0
