/**
 * Middleware: barra o acesso às páginas e APIs administrativas sem sessão
 * válida e bloqueia requisições de outros sites (proteção CSRF básica).
 */
import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth/session';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF: requisições que alteram dados devem vir do próprio site.
  if (pathname.startsWith('/api/') && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get('origin');
    let foreignOrigin = false;
    try {
      foreignOrigin = Boolean(origin) && new URL(origin!).host !== req.headers.get('host');
    } catch {
      foreignOrigin = true; // Origin malformado
    }
    // Sec-Fetch-Site é enviado pelos navegadores modernos e não pode ser forjado por páginas.
    const crossSite = req.headers.get('sec-fetch-site') === 'cross-site';
    if (foreignOrigin || crossSite) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Origem não permitida.' } }, { status: 403 });
    }
  }

  const isAdminPage = pathname.startsWith('/admin') && !pathname.startsWith('/admin/login');
  const isAdminApi = pathname.startsWith('/api/admin');
  if (!isAdminPage && !isAdminApi) return NextResponse.next();

  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();

  if (isAdminApi) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Acesso restrito. Faça login como administrador.' } },
      { status: 401 },
    );
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  url.search = `?voltar=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/api/:path*'],
};
