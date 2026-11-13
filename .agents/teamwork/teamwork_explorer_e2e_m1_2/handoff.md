# Handoff Report: Cloudflare Access RS256 JWT Mock & Auth Test Harness Specification

## 1. Observation

### 1.1 `src/lib/auth.ts` Implementation Analysis
Direct inspection of `src/lib/auth.ts` (lines 1–145) reveals the exact verification algorithm, crypto primitives, data structures, and role lookup queries:

1. **Header & Payload Interfaces** (lines 10–27):
   ```typescript
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
   ```

2. **In-Memory JWKS Key Cache** (line 29):
   ```typescript
   let cachedKeys: { issuer: string; keys: AccessJwk[]; expiresAt: number } | undefined;
   ```
   - Scoped at the module level in `src/lib/auth.ts`.
   - Caches JWKS responses for `Date.now() + 5 * 60_000` (5 minutes) keyed by `issuer`.
   - If `cachedKeys.issuer === issuer` and `cachedKeys.expiresAt > Date.now()`, subsequent calls skip `fetch`.

3. **JWKS Fetching Logic** (lines 45–62):
   ```typescript
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
   ```
   - Target endpoint: `${issuer}/cdn-cgi/access/certs` (e.g. `https://hsr.cloudflareaccess.com/cdn-cgi/access/certs`).
   - Requires `{ accept: 'application/json' }`.
   - Fails if `!response.ok` or if `body.keys` is not a non-empty array.

4. **JWT Verification Pipeline** (`verifyAccessJwt`, lines 64–118):
   - **Environment Validation** (lines 65–72):
     ```typescript
     const configuredDomain = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace('https://', '').replace('http://', '').replace(/\/+$/, '');
     const audience = env.ACCESS_AUDIENCE?.trim();
     const token = request.headers.get('cf-access-jwt-assertion');

     if (!configuredDomain || !audience || configuredDomain.includes('SETUP_REQUIRED') || audience === 'SETUP_REQUIRED' || !token) {
       return null;
     }
     if (!/^[a-zA-Z0-9.-]+$/.test(configuredDomain)) return null;
     ```
     *Critical constraint*: The sanitized `configuredDomain` must match `^[a-zA-Z0-9.-]+$`. Colon characters (`:`) are rejected, meaning test team domains cannot include port numbers (e.g., must be `hsr-test.cloudflareaccess.com` or `test-team.example.com`, not `localhost:8787`).
   - **Token Anatomy** (lines 75–80):
     - Must split into exactly 3 dot-delimited parts.
     - Header must satisfy: `header.alg === 'RS256'` and `Boolean(header.kid)`.
   - **Issuer & Audience** (lines 82–86):
     - Expected issuer: `https://${configuredDomain}` (strictly `https://`).
     - `payload.iss === issuer`.
     - `payload.aud` can be a string or array of strings; `audiences.includes(audience)` must be true.
   - **Timestamps** (lines 88–91):
     - Current Unix epoch: `now = Math.floor(Date.now() / 1000)`.
     - `typeof payload.exp !== 'number' || payload.exp <= now` -> rejects.
     - `typeof payload.nbf === 'number' && payload.nbf > now` -> rejects.
     - `typeof payload.iat === 'number' && payload.iat > now + 60` -> rejects (allows max 60s future drift).
   - **JWK Selection & Web Crypto RS256 Verification** (lines 93–112):
     ```typescript
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
     ```
     - Uses standard W3C Web Crypto API (`crypto.subtle.importKey` and `crypto.subtle.verify`).
     - Algorithm: `RSASSA-PKCS1-v1_5` with `SHA-256`.
     - Payload signed: raw ASCII string `${parts[0]}.${parts[1]}` UTF-8 encoded via `TextEncoder`.
     - Signature: Base64URL decoded into `ArrayBuffer`.
   - **Email Validation** (lines 112–114):
     - `valid` must be true.
     - `typeof payload.email === 'string'` and `payload.email.includes('@')`.
     - Returns normalized email: `payload.email.trim().toLowerCase()`.

5. **Role Resolution in D1 Database** (`getStaffContext`, lines 120–134):
   ```typescript
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
   ```
   - Queries `staff_users` table where `lower(email) = ?` AND `is_active = 1`.
   - Role must be `'OWNER'` or `'RECEPTIONIST'`.

6. **Role Enforcement Guard** (`requireRole`, lines 136–145):
   - Unauthenticated: returns `{ ok: false, response: errorResponse('Authentication required', 401, 'UNAUTHORIZED') }`.
   - Forbidden (role not in `allowedRoles`): returns `{ ok: false, response: errorResponse('Forbidden', 403, 'FORBIDDEN') }`.
   - Authorized: returns `{ ok: true, staff: { email, role } }`.

### 1.2 D1 Database Schema Inspection
Direct inspection of `migrations/0001_init.sql` (lines 33–39):
```sql
CREATE TABLE IF NOT EXISTS staff_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'RECEPTIONIST')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```
- No seed staff users exist in migrations.
- Tests must explicitly insert staff rows into `staff_users` to test authorized scenarios.

### 1.3 Execution Environment & Runtime Capabilities
- Node.js runtime version: `v24.22.3` (verified via `node -v`).
- `vitest.config.ts`: runs with `environment: 'node'`.
- In Node v24, `globalThis.crypto.subtle`, `TextEncoder`, `TextDecoder`, `fetch`, and `Buffer` (`base64url`) are all available out of the box with zero external dependencies needed.

---

## 2. Logic Chain

1. **Verification Mechanism**: `auth.ts` verifies assertions using Web Crypto `RSASSA-PKCS1-v1_5` with `SHA-256`. A testing mock must produce cryptographically compliant RS256 signatures over `${header_b64url}.${payload_b64url}` that successfully pass `crypto.subtle.verify`.
2. **JWKS Key Exchange**: Before verifying, `auth.ts` performs a network fetch to `${issuer}/cdn-cgi/access/certs` and expects a JSON payload containing `{ keys: [ jwk ] }`. In unit and integration tests (Vitest), external network requests fail or hang. Therefore, the test harness must provide an interceptor for `globalThis.fetch` that responds to `${issuer}/cdn-cgi/access/certs` with the matching public JWK.
3. **Module Cache Interaction**: `auth.ts` caches keys in `cachedKeys` for 5 minutes per `issuer`.
   - For isolated test cases needing distinct keys or simulating key rotation/failure, generating unique issuers (e.g. `https://test-${Date.now()}-${rand}.cloudflareaccess.com`) guarantees cache bypass without modifying production code.
   - For high-volume tests, reusing the same issuer allows `auth.ts` to benefit from the cache, minimizing mock fetch invocations.
4. **Token Claim Structure**:
   - `alg`: Must be `'RS256'`.
   - `kid`: Must match a key in the mock JWKS.
   - `iss`: Must equal `https://${configuredDomain}`.
   - `aud`: Must match or include `env.ACCESS_AUDIENCE`.
   - `exp`: Must be in the future (> current epoch).
   - `nbf`: If present, must be <= current epoch.
   - `iat`: If present, must be <= current epoch + 60.
   - `email`: Must contain `'@'` and match an active entry in `staff_users`.
5. **Database Correlation**: The email returned from JWT verification must match `lower(email)` of an active user (`is_active = 1`) in `staff_users` with role `OWNER` or `RECEPTIONIST`. Thus, helper functions should provide one-step setup that provisions both the D1 record and the matching signed JWT.

---

## 3. Caveats

1. **No Port in ACCESS_TEAM_DOMAIN**: `auth.ts` validates `configuredDomain` with `/^[a-zA-Z0-9.-]+$/`. Local dev domains with ports (like `localhost:8787`) fail regex. Test configurations must use domain-like hostnames such as `hsr-test.cloudflareaccess.com`.
2. **Global Fetch Interception Scope**: When mocking `globalThis.fetch` in Node/Vitest, the interceptor must selectively handle only `${issuer}/cdn-cgi/access/certs` and allow any other legitimate calls to pass through. An `uninstall()` cleanup function is mandatory to prevent test pollution.
3. **Key Generation Performance**: Generating 2048-bit RSA keys using Web Crypto takes ~10–30ms per generation. While acceptable for a few tests, generating fresh RSA keys in 100+ tests would add seconds to test runs. The mock utility should provide a pre-generated/memoized default keypair for fast test execution, alongside on-demand generation for specialized boundary/adversarial tests.

---

## 4. Conclusion & Recommended Architecture for `tests/helpers/jwt-mock.ts`

### 4.1 Interface Specification

```typescript
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
  jwks: { keys: Array<JsonWebKey & { kid: string; use: string }> };
  createToken: (options?: MockJwtOptions) => Promise<string>;
  createAuthHeaders: (options?: MockJwtOptions) => Promise<Headers>;
  createAuthRequest: (url: string, init?: RequestInit, options?: MockJwtOptions) => Promise<Request>;
  uninstall: () => void;
}
```

### 4.2 Core Cryptographic Functions

#### 1. Base64URL Encoding & Decoding
```typescript
export function toBase64Url(data: string | Uint8Array | ArrayBuffer): string {
  const buf = typeof data === 'string'
    ? Buffer.from(data, 'utf-8')
    : data instanceof Uint8Array
    ? Buffer.from(data)
    : Buffer.from(new Uint8Array(data));
  return buf.toString('base64url');
}

export function fromBase64Url(base64url: string): string {
  return Buffer.from(base64url, 'base64url').toString('utf-8');
}
```

#### 2. Synthetic RS256 Keypair Generation (`generateMockKeyPair`)
```typescript
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
  const publicJwk = {
    ...rawJwk,
    kid,
    use: 'sig',
    alg: 'RS256',
  };

  return { keyPair, kid, publicJwk };
}

// Memoized default keypair for fast test execution
let defaultKeyPairPromise: Promise<MockKeyPair> | null = null;
export function getDefaultMockKeyPair(): Promise<MockKeyPair> {
  if (!defaultKeyPairPromise) {
    defaultKeyPairPromise = generateMockKeyPair('hsr-default-test-key');
  }
  return defaultKeyPairPromise;
}
```

#### 3. Signed JWT Assertion Generator (`createMockSignedJwt`)
```typescript
export async function createMockSignedJwt(
  options: MockJwtOptions = {},
  keyPairContext?: MockKeyPair
): Promise<string> {
  const kp = keyPairContext ?? (await getDefaultMockKeyPair());
  const now = Math.floor(Date.now() / 1000);

  const exp = options.claims?.exp ?? (now + (options.expiresInSeconds ?? 3600));
  const iat = options.claims?.iat ?? (now + (options.iatOffsetSeconds ?? 0));
  const nbf = options.claims?.nbf ?? (now + (options.nbfOffsetSeconds ?? -10));

  const header = {
    alg: options.algorithm ?? 'RS256',
    kid: options.kid ?? kp.kid,
    typ: 'JWT',
  };

  const payload: MockJwtClaims = {
    iss: options.issuer ?? 'https://hsr-test.cloudflareaccess.com',
    aud: options.audience ?? 'hsr-test-audience-tag',
    email: options.email ?? 'owner@example.com',
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
```

#### 4. JWKS Cert Endpoint Mock (`setupMockJwksServer`)
```typescript
export async function setupMockJwksServer(options: {
  domain?: string;
  audience?: string;
  keyPair?: MockKeyPair;
  customJwksResponse?: unknown;
  status?: number;
} = {}): Promise<MockJwksServer> {
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
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

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
```

#### 5. Full Staff Authentication Helper (`seedStaffAndCreateAuth`)
```typescript
export async function seedStaffAndCreateAuth(
  db: D1Database,
  role: StaffRole,
  email: string = `${role.toLowerCase()}@hsrgreenenergy.com`,
  server?: MockJwksServer
): Promise<{ email: string; role: StaffRole; token: string; headers: Headers }> {
  // Ensure staff exists and is active in D1
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
```

### 4.3 Test Matrix Enabled by this Utility

The utility directly enables comprehensive testing of the following scenarios across Tiers 1–4:

| Category | Test Case | Simulation Technique | Expected Result |
|----------|-----------|----------------------|-----------------|
| **Success** | Valid OWNER Access | Valid RS256 token, matching active OWNER email in D1 | Role verified, `requireRole` succeeds (`ok: true`) |
| **Success** | Valid RECEPTIONIST Access | Valid RS256 token, matching active RECEPTIONIST email in D1 | Role verified, `requireRole` succeeds (`ok: true`) |
| **Success** | Audience Array | `aud: ['other-app', 'hsr-test-audience-tag']` | Succeeds (`audiences.includes(aud)`) |
| **Success** | Case-Insensitive Email | Token email `Owner@HSRGreenEnergy.com`, D1 email `owner@hsrgreenenergy.com` | Verified; normalized lowercased |
| **Negative** | Missing Header | No `cf-access-jwt-assertion` header | HTTP 401 `UNAUTHORIZED` |
| **Negative** | Malformed Token | Token is `"abc.xyz"` (2 parts) or `"not.a.valid.jwt"` | HTTP 401 `UNAUTHORIZED` |
| **Negative** | Wrong Algorithm | `alg: 'none'` or `alg: 'HS256'` | Rejected; HTTP 401 |
| **Negative** | Unknown `kid` | `kid: 'unknown-key-id'` not in JWKS | Rejected; HTTP 401 |
| **Negative** | Mismatched Issuer | `iss: 'https://other-team.cloudflareaccess.com'` | Rejected; HTTP 401 |
| **Negative** | Mismatched Audience | `aud: 'wrong-audience-tag'` | Rejected; HTTP 401 |
| **Negative** | Expired Token | `exp: now - 60` | Rejected; HTTP 401 |
| **Negative** | Token Not Yet Valid | `nbf: now + 300` | Rejected; HTTP 401 |
| **Negative** | Excessive Future Drift | `iat: now + 120` (> 60s future drift) | Rejected; HTTP 401 |
| **Negative** | Tampered Signature | Payload bytes altered after signing | Crypto verification fails; HTTP 401 |
| **Negative** | Foreign Keypair | Token signed by private key A, JWKS contains public key B | Signature fails; HTTP 401 |
| **Negative** | Corrupt JWKS / 500 error | Mock fetch returns HTTP 500 or `{ keys: [] }` | Rejection handled gracefully; HTTP 401 |
| **Negative** | Unregistered Staff | Valid JWT with email not in `staff_users` table | Returns `null`; HTTP 401 |
| **Negative** | Inactive Staff | Matching user in `staff_users` has `is_active = 0` | Returns `null`; HTTP 401 |
| **Negative** | Role Insufficient | RECEPTIONIST accesses OWNER-only API (e.g. `/api/admin/schedule`) | HTTP 403 `FORBIDDEN` |
| **Negative** | Config `SETUP_REQUIRED` | `env.ACCESS_TEAM_DOMAIN = 'SETUP_REQUIRED'` | Returns `null`; HTTP 401 |

---

## 5. Verification Method

1. **Independent Verification of Web Crypto Primitives**:
   Run an inline node script verifying `RSASSA-PKCS1-v1_5` signing, exporting to JWK, importing, and verifying:
   ```bash
   node -e "
     crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'}, true, ['sign','verify'])
     .then(async kp => {
       const jwk = await crypto.subtle.exportKey('jwk', kp.publicKey);
       const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode('test.msg'));
       const pub = await crypto.subtle.importKey('jwk', jwk, {name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'}, false, ['verify']);
       const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', pub, sig, new TextEncoder().encode('test.msg'));
       console.log('Verification success:', ok);
     });
   "
   ```
2. **File Inspection**:
   - Inspect `src/lib/auth.ts` lines 64–118 to verify each claim check aligns with `createMockSignedJwt`.
   - Inspect `migrations/0001_init.sql` lines 33–39 to verify table schema and constraints for `staff_users`.
3. **Integration Verification Command**:
   Once implemented in Milestone E2E-M1, run:
   ```bash
   npm run test
   npm run typecheck
   ```
4. **Invalidation Conditions**:
   - Changes in `src/lib/auth.ts` adopting a different verification library or asymmetric algorithm (e.g., Ed25519 or ES256 instead of RS256).
   - Changes to the Cloudflare Access cert endpoint path (currently `/cdn-cgi/access/certs`).
   - Alterations to `staff_users` column names or role enum values.
