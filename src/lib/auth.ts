import { errorResponse } from './utils';

export type StaffRole = 'OWNER' | 'RECEPTIONIST';

export interface StaffContext {
  email: string;
  role: StaffRole;
}

interface AccessJwtHeader {
  alg?: string;
  kid?: string;
}

interface AccessJwtPayload {
  iss?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  email?: string;
}

interface AccessJwk extends JsonWebKey {
  kid?: string;
  use?: string;
}

let cachedKeys: { issuer: string; keys: AccessJwk[]; expiresAt: number } | undefined;

export const SESSION_COOKIE_NAME = 'hsr_staff_session';

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function decodeJsonPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function loadAccessKeys(issuer: string): Promise<AccessJwk[]> {
  if (cachedKeys && cachedKeys.issuer === issuer && cachedKeys.expiresAt > Date.now()) {
    return cachedKeys.keys;
  }

  const response = await fetch(`${issuer}/cdn-cgi/access/certs`, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Could not load Cloudflare Access signing keys');

  const body = (await response.json()) as { keys?: AccessJwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) {
    throw new Error('Cloudflare Access returned no signing keys');
  }

  cachedKeys = { issuer, keys: body.keys, expiresAt: Date.now() + 5 * 60_000 };
  return body.keys;
}

async function verifyAccessJwt(request: Request, env: Env): Promise<string | null> {
  const configuredDomain = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace('https://', '').replace('http://', '').replace(/\/+$/, '');
  const audience = env.ACCESS_AUDIENCE?.trim();
  const token = request.headers.get('cf-access-jwt-assertion');

  if (!configuredDomain || !audience || configuredDomain.includes('SETUP_REQUIRED') || audience === 'SETUP_REQUIRED' || !token) {
    return null;
  }
  if (!/^[a-zA-Z0-9.-]+$/.test(configuredDomain)) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const header = decodeJsonPart<AccessJwtHeader>(parts[0]);
    const payload = decodeJsonPart<AccessJwtPayload>(parts[1]);
    if (header.alg !== 'RS256' || !header.kid) return null;

    const issuer = `https://${configuredDomain}`;
    if (payload.iss !== issuer) return null;

    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(audience)) return null;

    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
    if (typeof payload.nbf === 'number' && payload.nbf > now) return null;
    if (typeof payload.iat === 'number' && payload.iat > now + 60) return null;

    const jwk = (await loadAccessKeys(issuer)).find(
      (key) => key.kid === header.kid && key.kty === 'RSA' && (!key.use || key.use === 'sig')
    );
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const valid = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5',
      publicKey,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    if (!valid || typeof payload.email !== 'string' || !payload.email.includes('@')) return null;

    return payload.email.trim().toLowerCase();
  } catch {
    return null;
  }
}

function getSessionSecret(env: Env): string {
  return (env.ACCESS_AUDIENCE || '').trim() || 'hsr_green_energy_internal_session_secret_2026';
}

export async function createStaffSessionToken(email: string, role: StaffRole, env: Env): Promise<string> {
  const secret = getSessionSecret(env);
  const exp = Math.floor(Date.now() / 1000) + 7 * 24 * 3600; // 7 days
  const payloadObj = { email: email.trim().toLowerCase(), role, exp };
  const payloadStr = JSON.stringify(payloadObj);
  const encoder = new TextEncoder();
  const payloadB64 = btoa(payloadStr).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadB64));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${payloadB64}.${sigB64}`;
}

export async function verifyStaffSessionToken(token: string, env: Env): Promise<{ email: string; role: StaffRole } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const secret = getSessionSecret(env);
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = decodeBase64Url(sigB64);
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(payloadB64));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(payloadB64))) as { email?: string; role?: StaffRole; exp?: number };
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now || !payload.email || !payload.role) return null;
    return { email: payload.email.trim().toLowerCase(), role: payload.role };
  } catch {
    return null;
  }
}

export async function getStaffSessionFromCookie(request: Request, env: Env): Promise<{ email: string; role: StaffRole } | null> {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = match[1].trim();
  return verifyStaffSessionToken(token, env);
}

export async function getStaffContext(request: Request, env: Env): Promise<StaffContext | null> {
  const hasAccessHeader = request.headers.has('cf-access-jwt-assertion');
  let email: string | null = null;
  let sessionRole: StaffRole | null = null;

  if (hasAccessHeader) {
    email = await verifyAccessJwt(request, env);
    if (!email) return null;
  } else {
    const session = await getStaffSessionFromCookie(request, env);
    if (session) {
      email = session.email;
      sessionRole = session.role;
    }
  }

  if (!email) return null;

  try {
    const staff = await env.DB.prepare(
      'SELECT role FROM staff_users WHERE lower(email) = ? AND is_active = 1'
    ).bind(email).first<{ role: StaffRole }>();

    if (!staff || (staff.role !== 'OWNER' && staff.role !== 'RECEPTIONIST')) return null;
    if (sessionRole && staff.role !== sessionRole) return null;
    return { email, role: staff.role };
  } catch {
    return null;
  }
}

export async function requireRole(request: Request, env: Env, allowedRoles: StaffRole[]) {
  const staff = await getStaffContext(request, env);
  if (!staff) {
    const accept = request.headers.get('accept') || '';
    if (accept.includes('text/html') && request.method === 'GET') {
      const url = new URL(request.url);
      const redirectUrl = `/admin/login/?redirect=${encodeURIComponent(url.pathname + url.search)}`;
      return {
        ok: false as const,
        response: new Response(null, {
          status: 302,
          headers: { Location: redirectUrl, 'Cache-Control': 'no-store' },
        }),
      };
    }
    return { ok: false as const, response: errorResponse('Authentication required', 401, 'UNAUTHORIZED') };
  }
  if (!allowedRoles.includes(staff.role)) {
    return { ok: false as const, response: errorResponse('Forbidden', 403, 'FORBIDDEN') };
  }
  return { ok: true as const, staff };
}
