import { ImageResponse } from 'next/og';

/** Ícone do sistema (aba do navegador e tela inicial do celular). Gerado no código, sem arquivo de imagem. */
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export function CalendarIcon({ scale }: { scale: number }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#033D60' }}>
      <div style={{ width: 300 * scale, height: 280 * scale, background: '#FFFFFF', borderRadius: 36 * scale, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 70 * scale, background: '#CDD4DC', display: 'flex' }} />
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', padding: 22 * scale, gap: 16 * scale }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ width: 66 * scale, height: 56 * scale, borderRadius: 10 * scale, background: i === 4 ? '#033D60' : '#E6EEF4' }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Icon() {
  return new ImageResponse(<CalendarIcon scale={1} />, size);
}
