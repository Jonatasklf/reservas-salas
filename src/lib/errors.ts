/**
 * Erro de negócio com código HTTP e mensagem amigável (em português).
 * Lançado pelos serviços e convertido em resposta JSON pelo wrapper da API.
 */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what = 'Registro') => new AppError(404, 'NOT_FOUND', `${what} não encontrado(a).`);
export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'CONFLICT', message, details);
export const unauthorized = () => new AppError(401, 'UNAUTHORIZED', 'Acesso restrito. Faça login como administrador.');
export const tooManyRequests = () =>
  new AppError(429, 'TOO_MANY_REQUESTS', 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.');

/** Detecta a violação da restrição de exclusão (reservas sobrepostas) do PostgreSQL. */
export function isOverlapViolation(err: unknown): boolean {
  const text = String((err as { message?: string })?.message ?? err);
  return text.includes('Reservation_no_overlap') || text.includes('23P01');
}
