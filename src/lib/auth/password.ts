/**
 * Hash de senhas com bcrypt (custo 12). As senhas nunca são guardadas em texto.
 */
import bcrypt from 'bcryptjs';

export const PASSWORD_MIN_LENGTH = 8;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/** Regras mínimas: 8+ caracteres, com letras e números. */
export function passwordProblem(plain: string): string | null {
  if (plain.length < PASSWORD_MIN_LENGTH) return `A senha deve ter pelo menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[A-Za-z]/.test(plain) || !/\d/.test(plain)) return 'A senha deve conter letras e números.';
  return null;
}
