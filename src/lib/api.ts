/**
 * Utilitários para as rotas da API (src/app/api/**).
 * Toda rota usa `handle()`, que padroniza respostas de erro:
 *   { error: { code, message, details? } }
 */
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodTypeAny, type output } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, isOverlapViolation, badRequest } from './errors';

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response>;

export function handle<C = unknown>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function errorResponse(err: unknown): Response {
  if (err instanceof AppError) {
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Verifique os campos destacados.', details: { fields } } },
      { status: 400 },
    );
  }
  if (isOverlapViolation(err)) {
    return NextResponse.json(
      { error: { code: 'CONFLICT', message: 'Já existe uma reserva confirmada para esta sala neste horário.' } },
      { status: 409 },
    );
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return NextResponse.json(
      { error: { code: 'DUPLICATE', message: 'Já existe um registro com esses dados (nome ou identificador repetido).' } },
      { status: 409 },
    );
  }
  console.error('[api] Erro inesperado:', err);
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Ocorreu um erro inesperado. Tente novamente em instantes.' } },
    { status: 500 },
  );
}

/** Tamanho máximo aceito no corpo JSON (proteção contra envios gigantes). */
const MAX_JSON_BYTES = 64 * 1024;

export async function parseJson<S extends ZodTypeAny>(req: Request, schema: S): Promise<output<S>> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_JSON_BYTES) throw new AppError(413, 'TOO_LARGE', 'Os dados enviados são grandes demais.');
  const raw = await req.text();
  if (raw.length > MAX_JSON_BYTES) throw new AppError(413, 'TOO_LARGE', 'Os dados enviados são grandes demais.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw badRequest('Corpo da requisição inválido.');
  }
  return schema.parse(body);
}

export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): output<S> {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'local';
}
