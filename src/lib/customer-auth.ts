export const CUSTOMER_SESSION_COOKIE_NAME = 'hsr_customer_session';

export interface CustomerSessionPayload {
  partyId: string;
  fullName: string;
  phoneE164: string;
  email?: string | null;
  exp: number;
}

function getSessionSecret(env: Env): string {
  return (env.ACCESS_AUDIENCE || '').trim() || 'hsr_green_energy_internal_session_secret_2026';
}

function decodeBase64Url(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export async function createCustomerSessionToken(
  payload: Omit<CustomerSessionPayload, 'exp'>,
  env: Env
): Promise<string> {
  const secret = getSessionSecret(env);
  const exp = Math.floor(Date.now() / 1000) + 30 * 24 * 3600; // 30 days
  const sessionData: CustomerSessionPayload = { ...payload, exp };
  const payloadStr = JSON.stringify(sessionData);
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
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${payloadB64}.${sigB64}`;
}

export async function verifyCustomerSessionToken(
  token: string,
  env: Env
): Promise<CustomerSessionPayload | null> {
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

    const payload = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(payloadB64))
    ) as CustomerSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now || !payload.partyId || !payload.phoneE164) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function getCustomerSessionFromCookie(
  request: Request,
  env: Env
): Promise<CustomerSessionPayload | null> {
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${CUSTOMER_SESSION_COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const token = match[1].trim();
  return verifyCustomerSessionToken(token, env);
}

export async function hashSha256(raw: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
