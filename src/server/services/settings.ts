/**
 * Configurações gerais (registro único id = 1). Criado automaticamente na
 * primeira leitura com os valores padrão do schema.
 */
import type { Settings } from '@prisma/client';
import { prisma, type Db } from '@/lib/db';

export async function getSettings(db: Db = prisma): Promise<Settings> {
  return db.settings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

/** Dados públicos (sem campos internos como e-mail de notificação). */
export function publicSettings(s: Settings) {
  return {
    unitName: s.unitName,
    headerSubtitle: s.headerSubtitle,
    footerText: s.footerText,
    hasLogo: Boolean(s.logoData),
    logoVersion: s.logoUpdatedAt?.getTime() ?? 0,
    defaultOpenTime: s.defaultOpenTime,
    defaultCloseTime: s.defaultCloseTime,
    minAdvanceMinutes: s.minAdvanceMinutes,
    maxAdvanceDays: s.maxAdvanceDays,
  };
}
export type PublicSettings = ReturnType<typeof publicSettings>;
