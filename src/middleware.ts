import type { MiddlewareHandler } from 'astro';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname } = context.url;

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

  return next();
};
