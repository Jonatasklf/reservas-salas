/**
 * CONFIGURAÇÃO CENTRAL DO SISTEMA
 * -----------------------------------------------------------------------------
 * Altere aqui textos institucionais, rótulos e regras padrão sem precisar
 * procurar em vários arquivos. Itens editáveis pela tela de Configurações
 * (nome da unidade, logotipo, horários) ficam no banco e sobrepõem estes
 * valores padrão.
 *
 * As CORES ficam em src/app/globals.css (bloco @theme), para que o Tailwind
 * gere as classes automaticamente (bg-primary, text-ink etc.).
 */
export const siteConfig = {
  /** Nome exibido quando ainda não há configuração salva no banco. */
  defaultUnitName: 'Reservas de Salas',
  defaultSubtitle: 'Agenda de salas de reuniões',
  /** Aviso exibido no rodapé: o sistema não é um serviço oficial. */
  disclaimer:
    'Sistema de uso interno para organização das salas. Não é um serviço oficial da instituição.',
  timeZone: 'America/Sao_Paulo',
  locale: 'pt-BR',

  /** Regras padrão de negócio */
  rules: {
    /** Horizonte (dias) usado para checar conflitos de recorrências sem data final. */
    recurrenceConflictHorizonDays: 730,
    /** Duração mínima de uma reserva, em minutos. */
    minDurationMinutes: 15,
    /** Granularidade dos horários oferecidos nos seletores, em minutos. */
    timeStepMinutes: 30,
    /** Tamanho máximo do logotipo enviado, em bytes. */
    maxLogoBytes: 512 * 1024,
  },

  /** Rótulos das situações exibidos na interface. */
  requestStatusLabels: {
    PENDING: 'Aguardando aprovação',
    AWAITING_INFO: 'Aguardando informações',
    APPROVED: 'Aprovada',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada',
  },
  frequencyLabels: {
    DAILY: 'Diariamente',
    WEEKLY: 'Semanalmente',
    BIWEEKLY: 'Quinzenalmente',
    MONTHLY_DAY: 'Mensalmente (dia do mês)',
    MONTHLY_NTH_WEEKDAY: 'Mensalmente (ex.: 1ª segunda-feira)',
    CUSTOM: 'Personalizada (a cada N semanas)',
  },
  blockTypeLabels: {
    HOLIDAY: 'Feriado',
    MAINTENANCE: 'Manutenção',
    OTHER: 'Indisponibilidade',
  },
  weekdayLabels: ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'],
  weekdayShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  nthWeekLabels: { 1: 'Primeira', 2: 'Segunda', 3: 'Terceira', 4: 'Quarta', [-1]: 'Última' } as Record<number, string>,

  /**
   * Campos do formulário público de solicitação.
   * Para adicionar um campo novo, veja a seção "Como alterar o formulário"
   * no README.
   */
  requestForm: {
    purposeMaxLength: 500,
    nameMaxLength: 120,
  },

  /**
   * Saudação e despedida das mensagens enviadas ao solicitante (WhatsApp e
   * e-mail, na confirmação e nas atualizações). {nome} é trocado pelo
   * primeiro nome da pessoa.
   */
  mensagens: {
    saudacao: 'A paz de Deus, Irmão(a) {nome}!',
    avisoAutomaticoWhatsApp: 'Não responder essa conversa, trata-se de mensagem automática.',
    avisoAutomaticoEmail: 'Não responder este e-mail, trata-se de mensagem automática.',
    despedida: 'Deus que abençoe.',
  },
} as const;

/** Primeiro nome, para a saudação ("Larissa Souza" → "Larissa"). */
export function primeiroNome(nomeCompleto: string): string {
  const nome = nomeCompleto.trim();
  return nome.split(/\s+/)[0] || nome;
}

/** Saudação pronta para o nome informado. */
export function saudacao(nomeCompleto: string): string {
  return siteConfig.mensagens.saudacao.replace('{nome}', primeiroNome(nomeCompleto));
}

export type RequestStatusKey = keyof typeof siteConfig.requestStatusLabels;
