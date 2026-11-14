import type { StaffRole } from '../../src/lib/auth';

export interface MockJwtClaims {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

export interface MockJwtOptions {
  email?: string;
  issuer?: string;
  audience?: string | string[];
  kid?: string;
  algorithm?: string;
  expiresInSeconds?: number;
  nbfOffsetSeconds?: number;
  iatOffsetSeconds?: number;
  claims?: Partial<MockJwtClaims>;
}

export interface MockKeyPair {
  keyPair: CryptoKeyPair;
  kid: string;
  publicJwk: JsonWebKey & { kid: string; use: string; alg: string };
}

export interface MockJwksServer {
  domain: string;
  issuer: string;
  audience: string;
  keyPair: MockKeyPair;
  jwks: { keys: Array<JsonWebKey & { kid: string; use: string; alg: string }> };
  createToken: (options?: MockJwtOptions) => Promise<string>;
  createAuthHeaders: (options?: MockJwtOptions) => Promise<Headers>;
  createAuthRequest: (url: string, init?: RequestInit, options?: MockJwtOptions) => Promise<Request>;
  uninstall: () => void;
}

/**
 * Base64URL string/buffer encoder.
 */
export function toBase64Url(data: string | Uint8Array | ArrayBuffer): string {
  const buf =
    typeof data === 'string'
      ? Buffer.from(data, 'utf-8')
      : data instanceof Uint8Array
      ? Buffer.from(data.buffer, data.byteOffset, data.byteLength)
      : Buffer.from(data);
  return buf.toString('base64url');
}

/**
 * Base64URL to UTF-8 string decoder.
 */
export function fromBase64Url(base64url: string): string {
  return Buffer.from(base64url, 'base64url').toString('utf-8');
}

/**
 * Generates an RSA-2048 keypair for RS256 signing and verification using Web Crypto.
 */
export async function generateMockKeyPair(kid: string = 'hsr-mock-key-1'): Promise<MockKeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify']
  );

  const rawJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const publicJwk: JsonWebKey & { kid: string; use: string; alg: string } = {
    ...rawJwk,
    kid,
    use: 'sig',
    alg: 'RS256',
  };

  return { keyPair, kid, publicJwk };
}

// Memoized default keypair for fast test execution across test suites
let defaultKeyPairPromise: Promise<MockKeyPair> | null = null;
export function getDefaultMockKeyPair(): Promise<MockKeyPair> {
  if (!defaultKeyPairPromise) {
    defaultKeyPairPromise = generateMockKeyPair('hsr-default-test-key');
  }
  return defaultKeyPairPromise;
}

/**
 * Creates and signs an RS256 JWT assertion formatted for Cloudflare Access verification.
 */
export async function createMockSignedJwt(
  options: MockJwtOptions = {},
  keyPairContext?: MockKeyPair
): Promise<string> {
  const kp = keyPairContext ?? (await getDefaultMockKeyPair());
  const now = Math.floor(Date.now() / 1000);

  const exp = options.claims?.exp ?? now + (options.expiresInSeconds ?? 3600);
  const iat = options.claims?.iat ?? now + (options.iatOffsetSeconds ?? 0);
  const nbf = options.claims?.nbf ?? now + (options.nbfOffsetSeconds ?? -10);

  const header = {
    alg: options.algorithm ?? 'RS256',
    kid: options.kid ?? kp.kid,
    typ: 'JWT',
  };

  const payload: MockJwtClaims = {
    iss: options.issuer ?? 'https://hsr-test.cloudflareaccess.com',
    aud: options.audience ?? 'hsr-test-audience-tag',
    email: options.email ?? 'owner@hsr-test.internal',
    iat,
    nbf,
    exp,
    ...options.claims,
  };

  const headerPart = toBase64Url(JSON.stringify(header));
  const payloadPart = toBase64Url(JSON.stringify(payload));
  const signingInput = `${headerPart}.${payloadPart}`;

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    kp.keyPair.privateKey,
    new TextEncoder().encode(signingInput)
  );

  const signaturePart = toBase64Url(signatureBuffer);
  return `${signingInput}.${signaturePart}`;
}

/**
 * Sets up an in-memory mock JWKS server intercepting globalThis.fetch for Cloudflare Access certs.
 */
export async function setupMockJwksServer(
  options: {
    domain?: string;
    audience?: string;
    keyPair?: MockKeyPair;
    customJwksResponse?: unknown;
    status?: number;
  } = {}
): Promise<MockJwksServer> {
  const domain = options.domain ?? 'hsr-test.cloudflareaccess.com';
  const issuer = `https://${domain}`;
  const audience = options.audience ?? 'hsr-test-audience-tag';
  const keyPair = options.keyPair ?? (await getDefaultMockKeyPair());

  const jwks = {
    keys: [keyPair.publicJwk],
  };

  const originalFetch = globalThis.fetch;
  const certsUrl = `${issuer}/cdn-cgi/access/certs`;

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === certsUrl) {
      if (options.status && options.status !== 200) {
        return new Response(JSON.stringify({ error: 'Failed to load certs' }), {
          status: options.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify(options.customJwksResponse ?? jwks), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }

    return originalFetch(input, init);
  };

  const server: MockJwksServer = {
    domain,
    issuer,
    audience,
    keyPair,
    jwks,
    createToken: (opts) =>
      createMockSignedJwt(
        {
          issuer,
          audience,
          ...opts,
        },
        keyPair
      ),
    createAuthHeaders: async (opts) => {
      const token = await server.createToken(opts);
      const headers = new Headers();
      headers.set('cf-access-jwt-assertion', token);
      return headers;
    },
    createAuthRequest: async (url, init = {}, opts) => {
      const headers = new Headers(init.headers);
      const token = await server.createToken(opts);
      headers.set('cf-access-jwt-assertion', token);
      return new Request(url, { ...init, headers });
    },
    uninstall: () => {
      globalThis.fetch = originalFetch;
    },
  };

  return server;
}

/**
 * Seeds a staff user in the mock D1 database and generates a matching signed assertion.
 */
export async function seedStaffAndCreateAuth(
  db: D1Database,
  role: StaffRole,
  email: string = `${role.toLowerCase()}@hsrgreenenergy.com`,
  server?: MockJwksServer
): Promise<{ email: string; role: StaffRole; token: string; headers: Headers }> {
  await db
    .prepare(
      'INSERT INTO staff_users (email, role, is_active) VALUES (?, ?, 1) ON CONFLICT(email) DO UPDATE SET role = excluded.role, is_active = 1'
    )
    .bind(email.toLowerCase(), role)
    .run();

  const token = server
    ? await server.createToken({ email })
    : await createMockSignedJwt({ email });

  const headers = new Headers();
  headers.set('cf-access-jwt-assertion', token);

  return { email: email.toLowerCase(), role, token, headers };
}
