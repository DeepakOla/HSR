import type { APIRoute } from 'astro';
import { CUSTOMER_SESSION_COOKIE_NAME } from '../../../lib/customer-auth';
import { SESSION_COOKIE_NAME } from '../../../lib/auth';

export const POST: APIRoute = async () => {
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    `${CUSTOMER_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  headers.set('Content-Type', 'application/json');

  return new Response(JSON.stringify({ success: true, message: 'Logged out successfully' }), {
    status: 200,
    headers,
  });
};

export const GET: APIRoute = async () => {
  const headers = new Headers();
  headers.append(
    'Set-Cookie',
    `${CUSTOMER_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  headers.append(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  );
  headers.set('Location', '/login');
  return new Response(null, { status: 302, headers });
};
