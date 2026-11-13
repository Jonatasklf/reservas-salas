/**
 * Cadastro do PRIMEIRO administrador (ou de qualquer outro) pelo terminal.
 *
 *   npm run admin:criar
 *
 * Também aceita argumentos (útil em servidores):
 *   npm run admin:criar -- --nome "Fulano de Tal" --email fulano@exemplo.com --senha "SenhaForte123"
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const rl = readline.createInterface({ input, output });
  console.log('\n=== Cadastro de administrador ===\n');
  const name = arg('nome') ?? (await rl.question('Nome completo: ')).trim();
  const email = (arg('email') ?? (await rl.question('E-mail: '))).trim().toLowerCase();
  const password = arg('senha') ?? (await rl.question('Senha (mín. 8 caracteres, letras e números): '));
  rl.close();

  if (name.length < 3) throw new Error('Informe o nome completo.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-mail inválido.');
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new Error('A senha deve ter pelo menos 8 caracteres, com letras e números.');
  }

  const exists = await prisma.admin.findUnique({ where: { email } });
  if (exists) {
    await prisma.admin.update({
      where: { email },
      data: { name, passwordHash: await bcrypt.hash(password, 12), active: true, sessionVersion: { increment: 1 } },
    });
    console.log(`\nAdministrador ${email} já existia: nome e senha foram atualizados.`);
  } else {
    await prisma.admin.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12) } });
    console.log(`\nAdministrador ${email} criado com sucesso.`);
  }
  console.log('Acesse http://localhost:3000/admin/login para entrar.\n');
}

main()
  .catch((e) => {
    console.error('\nErro:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
