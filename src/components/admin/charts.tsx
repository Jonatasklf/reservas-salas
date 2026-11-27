'use client';
/**
 * Gráficos simples (HTML + CSS, sem biblioteca), no padrão visual do sistema:
 *  - uma cor só (azul da identidade) — cada gráfico mostra uma única série,
 *    então não há legenda (o título diz o que é);
 *  - colunas com no máximo 24 px, ponta arredondada e base reta;
 *  - valor escrito só no maior; os demais aparecem ao passar o mouse ou ao
 *    focar pelo teclado, e em "Ver como tabela".
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';

export interface Datum {
  label: string;
  /** Rótulo completo para dica/tabela (ex.: "Segunda-feira"). */
  fullLabel?: string;
  value: number;
}

const fmt = (n: number, unit: string) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}${unit}`;

/** Arredonda o topo do eixo para um número "redondo" (1, 2, 5 × 10ⁿ). */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const n = max / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

function TableToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="no-print text-xs font-medium text-primary hover:underline" aria-expanded={open}>
      {open ? 'Ver como gráfico' : 'Ver como tabela'}
    </button>
  );
}

function DataTable({ data, unit, valueHeader }: { data: Datum[]; unit: string; valueHeader: string }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-mist text-left text-xs text-ink-soft">
          <th className="py-1.5 font-medium">Item</th>
          <th className="py-1.5 text-right font-medium">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {data.map((d) => (
          <tr key={d.label} className="border-b border-mist/50">
            <td className="py-1.5">{d.fullLabel ?? d.label}</td>
            <td className="py-1.5 text-right tabular-nums">{fmt(d.value, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Gráfico de colunas de uma série (ex.: horas por dia da semana). */
export function ColumnChart({
  title,
  subtitle,
  data,
  unit = '',
  valueHeader = 'Valor',
  height = 160,
  labelEvery = 1,
}: {
  title: string;
  subtitle?: string;
  data: Datum[];
  unit?: string;
  valueHeader?: string;
  height?: number;
  /** Mostra o rótulo do eixo X a cada N itens (evita rótulos espremidos). */
  labelEvery?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(0, ...data.map((d) => d.value));
  const top = niceMax(max);
  const peak = data.findIndex((d) => d.value === max && max > 0);
  const ticks = [top, top / 2, 0];
  const empty = max === 0;

  return (
    <figure className="space-y-3">
      <figcaption className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {subtitle && <span className="block text-xs text-ink-soft">{subtitle}</span>}
        </span>
        {!empty && <TableToggle open={asTable} onToggle={() => setAsTable((v) => !v)} />}
      </figcaption>

      {empty ? (
        <p className="rounded-lg bg-mist-soft px-3 py-6 text-center text-sm text-ink-soft">Sem dados no período.</p>
      ) : asTable ? (
        <DataTable data={data} unit={unit} valueHeader={valueHeader} />
      ) : (
        <div className="flex gap-2">
          {/* Eixo Y: poucos valores redondos, texto discreto */}
          <div className="flex flex-col justify-between pb-5 text-right text-[11px] tabular-nums text-ink-soft" style={{ height }}>
            {ticks.map((t) => <span key={t} className="-translate-y-1.5 leading-none">{fmt(t, '')}</span>)}
          </div>
          <div className="relative min-w-0 flex-1">
            {/* Linhas de grade finas e discretas */}
            <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: height - 20 }} aria-hidden>
              {ticks.map((t) => <span key={t} className="block h-px bg-mist/70" />)}
            </div>
            <div className="relative flex items-end" style={{ height: height - 20 }} role="list" aria-label={title}>
              {data.map((d, i) => {
                const h = (d.value / top) * (height - 20);
                const tip = `${d.fullLabel ?? d.label}: ${fmt(d.value, unit)}`;
                return (
                  <div
                    key={d.label}
                    role="listitem"
                    tabIndex={0}
                    aria-label={tip}
                    className="group relative flex h-full flex-1 items-end justify-center outline-none"
                  >
                    {/* Área de toque maior que a barra */}
                    <span
                      className="block w-full max-w-6 rounded-t bg-primary transition-opacity group-hover:opacity-85 group-focus-visible:ring-2 group-focus-visible:ring-primary/40"
                      style={{ height: Math.max(d.value > 0 ? 2 : 0, h) }}
                    />
                    {i === peak && (
                      <span className="absolute left-1/2 -translate-x-1/2 text-[11px] font-medium text-ink" style={{ bottom: h + 4 }}>
                        {fmt(d.value, unit)}
                      </span>
                    )}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs text-white shadow group-hover:block group-focus-visible:block"
                      style={{ bottom: h + 22 }}
                    >
                      {tip}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Rótulos do eixo X */}
            <div className="mt-1 flex">
              {data.map((d, i) => (
                <span key={d.label} className="flex-1 truncate text-center text-[11px] text-ink-soft">{i % labelEvery === 0 ? d.label : ''}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </figure>
  );
}

/**
 * Lista de medidores (ex.: taxa de ocupação por sala): o preenchimento em azul
 * sobre um trilho do mesmo azul mais claro, com o percentual escrito ao lado.
 */
export function MeterList({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: { id: string; label: string; rate: number; detail: string; muted?: boolean }[];
}) {
  const [asTable, setAsTable] = useState(false);
  const pct = (r: number) => `${Math.round(r * 100)}%`;
  return (
    <figure className="space-y-3">
      <figcaption className="flex items-start justify-between gap-2">
        <span>
          <span className="block text-sm font-semibold text-ink">{title}</span>
          {subtitle && <span className="block text-xs text-ink-soft">{subtitle}</span>}
        </span>
        {items.length > 0 && <TableToggle open={asTable} onToggle={() => setAsTable((v) => !v)} />}
      </figcaption>
      {items.length === 0 ? (
        <p className="rounded-lg bg-mist-soft px-3 py-6 text-center text-sm text-ink-soft">Nenhuma sala.</p>
      ) : asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mist text-left text-xs text-ink-soft">
              <th className="py-1.5 font-medium">Sala</th>
              <th className="py-1.5 font-medium">Detalhe</th>
              <th className="py-1.5 text-right font-medium">Ocupação</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-mist/50">
                <td className="py-1.5">{it.label}</td>
                <td className="py-1.5 text-ink-soft">{it.detail}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(it.rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="space-y-3">
          {items.map((it) => (
            <li key={it.id} className={cn(it.muted && 'opacity-60')}>
              <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium text-ink">{it.label}</span>
                <span className="shrink-0 tabular-nums text-ink">{pct(it.rate)}</span>
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full bg-primary-soft"
                role="meter"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(it.rate * 100)}
                aria-label={`${it.label}: ${pct(it.rate)} de ocupação`}
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, it.rate * 100)}%` }} />
              </div>
              <p className="mt-0.5 text-xs text-ink-soft">{it.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
