import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname, hostname } = context.url;

  if (pathname === '/') {
    const saved = context.cookies.get('hsr_lang')?.value;
    const accept = context.request.headers.get('accept-language')?.toLowerCase() ?? '';
    const selected = saved === 'hi' || accept.startsWith('hi') ? 'hi' : 'en';
    return context.redirect(`/${selected}/`, 302);
  }

  if (pathname.startsWith('/en/')) {
    context.cookies.set('hsr_lang', 'en', { path: '/', maxAge: 60 * 60 * 24 * 365 });
  }
  if (pathname.startsWith('/hi/')) {
    context.cookies.set('hsr_lang', 'hi', { path: '/', maxAge: 60 * 60 * 24 * 365 });
  }

  const response = await next();

  // Create response with security headers
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  // Preview environment isolation: block search engine indexing
  const isPreview =
    hostname.includes('workers.dev') ||
    hostname.includes('preview') ||
    hostname.includes('localhost') ||
    hostname === '127.0.0.1' ||
    (context.locals?.runtime?.env?.APP_BASE_URL &&
      context.locals.runtime.env.APP_BASE_URL.includes('example'));

  if (isPreview) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
