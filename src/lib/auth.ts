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

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
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

export async function getStaffContext(request: Request, env: Env): Promise<StaffContext | null> {
  const email = await verifyAccessJwt(request, env);
  if (!email) return null;

  try {
    const staff = await env.DB.prepare(
      'SELECT role FROM staff_users WHERE lower(email) = ? AND is_active = 1'
    ).bind(email).first<{ role: StaffRole }>();

    if (!staff || (staff.role !== 'OWNER' && staff.role !== 'RECEPTIONIST')) return null;
    return { email, role: staff.role };
  } catch {
    return null;
  }
}

export async function requireRole(request: Request, env: Env, allowedRoles: StaffRole[]) {
  const staff = await getStaffContext(request, env);
  if (!staff) {
    return { ok: false as const, response: errorResponse('Authentication required', 401, 'UNAUTHORIZED') };
  }
  if (!allowedRoles.includes(staff.role)) {
    return { ok: false as const, response: errorResponse('Forbidden', 403, 'FORBIDDEN') };
  }
  return { ok: true as const, staff };
}
