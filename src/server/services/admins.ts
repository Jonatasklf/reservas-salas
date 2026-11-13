/**
 * Administradores: login, cadastro e troca de senha.
 */
import { prisma } from '@/lib/db';
import { AppError, badRequest, conflict, notFound } from '@/lib/errors';
import { hashPassword, passwordProblem, verifyPassword } from '@/lib/auth/password';
import { rateLimit, resetRateLimit } from '@/lib/rate-limit';
import { audit } from './audit';

// Hash fixo usado quando o e-mail não existe, para o tempo de resposta não
// revelar quais e-mails estão cadastrados.
const DUMMY_HASH = '$2b$12$zO83RU50PpSfEpBrzt5ZM.u.TQOP4z/xHEsRwrmnadiaO63xRE/nG';

export async function login(email: string, password: string, ip: string) {
  rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  rateLimit(`login:${email}`, 5, 15 * 60 * 1000);
  const admin = await prisma.admin.findUnique({ where: { email } });
  const ok = await verifyPassword(password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok || !admin.active) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  }
  resetRateLimit(`login:${email}`);
  await prisma.admin.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
  return admin;
}

export function listAdmins() {
  return prisma.admin.findMany({
    select: { id: true, name: true, email: true, active: true, lastLoginAt: true, createdAt: true },
    orderBy: { name: 'asc' },
  });
}

export async function createAdmin(input: { name: string; email: string; password: string }, byAdminId: string | null) {
  const problem = passwordProblem(input.password);
  if (problem) throw badRequest(problem);
  const exists = await prisma.admin.findUnique({ where: { email: input.email } });
  if (exists) throw conflict('Já existe um administrador com este e-mail.');
  const admin = await prisma.admin.create({
    data: { name: input.name, email: input.email, passwordHash: await hashPassword(input.password) },
  });
  await audit(prisma, { adminId: byAdminId, action: 'ADMIN_CREATED', entityType: 'Admin', entityId: admin.id, summary: `Administrador ${admin.name} cadastrado.` });
  return { id: admin.id, name: admin.name, email: admin.email };
}

export async function setAdminActive(id: string, active: boolean, byAdminId: string) {
  if (id === byAdminId && !active) throw badRequest('Você não pode desativar o seu próprio acesso.');
  if (!active) {
    const others = await prisma.admin.count({ where: { active: true, id: { not: id } } });
    if (others === 0) throw badRequest('É necessário manter pelo menos um administrador ativo.');
  }
  const admin = await prisma.admin.update({
    where: { id },
    // Incrementar sessionVersion encerra as sessões abertas desse administrador.
    data: { active, sessionVersion: { increment: 1 } },
  });
  await audit(prisma, {
    adminId: byAdminId, action: active ? 'ADMIN_ACTIVATED' : 'ADMIN_DEACTIVATED', entityType: 'Admin', entityId: id,
    summary: `Administrador ${admin.name} ${active ? 'reativado' : 'desativado'}.`,
  });
}

export async function changePassword(id: string, current: string, next: string) {
  const admin = await prisma.admin.findUnique({ where: { id } });
  if (!admin) throw notFound('Administrador');
  if (!(await verifyPassword(current, admin.passwordHash))) throw badRequest('A senha atual está incorreta.');
  const problem = passwordProblem(next);
  if (problem) throw badRequest(problem);
  const updated = await prisma.admin.update({
    where: { id },
    data: { passwordHash: await hashPassword(next), sessionVersion: { increment: 1 } },
  });
  await audit(prisma, { adminId: id, action: 'ADMIN_PASSWORD_CHANGED', entityType: 'Admin', entityId: id, summary: 'Senha alterada.' });
  return updated;
}
