/**
 * Executado antes de cada arquivo de teste: aponta o Prisma para o banco de
 * TESTES (DATABASE_URL_TEST), nunca para o banco principal.
 */
import { loadEnv } from './load-env';

loadEnv();
if (!process.env.DATABASE_URL_TEST) throw new Error('Defina DATABASE_URL_TEST no .env para executar os testes.');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
process.env.DISABLE_RATE_LIMIT = '1';
process.env.AUTH_SECRET ??= 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';

// SEGURANÇA: os testes NUNCA enviam mensagens de verdade, mesmo que o .env
// tenha SMTP configurado ou o serviço de WhatsApp esteja conectado. (Os
// testes de envio usam "espiões" no lugar do envio real.)
process.env.SMTP_HOST = '';
process.env.WHATSAPP_URL = '';
process.env.WHATSAPP_TOKEN = '';
