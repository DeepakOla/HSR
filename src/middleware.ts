import type { MiddlewareHandler } from 'astro';
import { getCustomerSessionFromCookie } from './lib/customer-auth';
import { getStaffSessionFromCookie } from './lib/auth';
import { getRuntimeEnv } from './lib/runtime-env';

export const onRequest: MiddlewareHandler = async (context, next) => {
  const { pathname, hostname } = context.url;

  // Language redirection for root /
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

  // 301 Permanent Redirects for consolidated routes
  if (pathname === '/app' || pathname.startsWith('/app/')) {
    const target = pathname.replace(/^\/app\/?/, '/user/') || '/user/';
    return context.redirect(target + context.url.search, 301);
  }

  if (pathname === '/directory' || pathname.startsWith('/directory/')) {
    return context.redirect('/cng/cylinder-test/#nearby-stations', 301);
  }

  if (pathname === '/tools/cng-expiry-checker' || pathname.startsWith('/tools/cng-expiry-checker/')) {
    return context.redirect('/cng/cylinder-test/?action=check-due-date#retest-checker', 301);
  }

  if (pathname === '/website-guide' || pathname.startsWith('/website-guide/')) {
    return context.redirect('/cng/cylinder-test/#guide-steps', 301);
  }

  // Authentication guards for workspace routes
  const env = getRuntimeEnv(context.locals);

  // 1. Customer Workspace Guard (/user/*)
  if (pathname.startsWith('/user') && env) {
    const customerSession = await getCustomerSessionFromCookie(context.request, env);
    if (!customerSession) {
      const redirectUrl = `/login/?tab=customer&redirect=${encodeURIComponent(pathname + context.url.search)}`;
      return context.redirect(redirectUrl, 302);
    }
  }

  // 2. Staff Workspace Guard (/staff/*)
  if (pathname.startsWith('/staff') && env) {
    const staffSession = await getStaffSessionFromCookie(context.request, env);
    if (!staffSession) {
      const redirectUrl = `/login/?tab=staff&redirect=${encodeURIComponent(pathname + context.url.search)}`;
      return context.redirect(redirectUrl, 302);
    }
  }

  // 3. Admin Workspace Guard (/admin/*, excluding /admin/login)
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login') && env) {
    const staffSession = await getStaffSessionFromCookie(context.request, env);
    if (!staffSession) {
      const redirectUrl = `/admin/login/?redirect=${encodeURIComponent(pathname + context.url.search)}`;
      return context.redirect(redirectUrl, 302);
    }
  }

  const response = await next();

  // Create response with security headers
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  // Preview environment isolation: block search engine indexing
  const isPreview =
    hostname.includes('workers.dev') ||
    hostname.includes('preview') ||
    hostname.includes('localhost') ||
    hostname === '127.0.0.1' ||
    (env?.APP_BASE_URL && env.APP_BASE_URL.includes('example'));

  if (isPreview) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
