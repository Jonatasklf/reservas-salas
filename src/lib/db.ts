/**
 * Cliente Prisma único (evita abrir várias conexões durante o hot reload).
 */
import { PrismaClient, Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'] });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/** Cliente normal ou cliente de transação — os serviços aceitam ambos. */
export type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Executa `fn` dentro de uma transação. Serviços que alteram a ocupação das
 * salas usam esta função junto com `lockRooms` para serializar operações
 * concorrentes na mesma sala.
 */
export function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { timeout: 20000, maxWait: 10000 });
}

/**
 * Trava (até o fim da transação) as salas informadas usando advisory locks do
 * PostgreSQL. Duas aprovações simultâneas da mesma sala passam a acontecer uma
 * após a outra: a segunda já enxerga a reserva criada pela primeira.
 */
export async function lockRooms(tx: Prisma.TransactionClient, roomIds: string[]): Promise<void> {
  const unique = [...new Set(roomIds)].sort(); // ordem fixa evita deadlocks
  for (const id of unique) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'room:' + id}, 0))`;
  }
}
