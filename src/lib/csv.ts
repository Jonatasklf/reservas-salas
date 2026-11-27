/**
 * Geração de CSV compatível com o Excel em português (separador ";",
 * BOM UTF-8 para acentos) e protegido contra injeção de fórmulas.
 */
export function csvCell(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita fórmulas maliciosas no Excel
  return '"' + s.replace(/"/g, '""') + '"';
}

/** Linhas → texto CSV. Use [] para uma linha em branco entre seções. */
export function toCsv(rows: unknown[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}
