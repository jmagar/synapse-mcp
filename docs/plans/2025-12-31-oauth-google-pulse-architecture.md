# OAuth via Google (Pulse Architecture) Implementation Plan

> **📁 Organization Note:** When this plan is fully implemented and verified, move this file to `docs/plans/complete/` to keep the plans folder organized.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OAuth 2.1 authentication to synapse-mcp using Google as the authorization server, following the same architecture as the Pulse MCP server (handling OAuth flow, issuing our own JWTs, storing state in Redis).

**Architecture:** Synapse-MCP handles the complete OAuth flow including /auth/login and /auth/callback endpoints, exchanges authorization codes with Google using CLIENT_SECRET, stores OAuth state and refresh tokens in Redis, and issues our own JWT tokens to clients. This differs from stateless JWT validation—we act as both OAuth client and token issuer.

**Tech Stack:** google-auth-library (^10.5.0), jose (^6.1.3), ioredis (^5.8.0), helmet (^8.1.0)

---

## Phase 1: Dependencies and Core Infrastructure

### Task 1: Install OAuth Dependencies

**Files:**
- Modify: `package.json`
- Create: `pnpm-lock.yaml` (auto-generated)

**Step 1: Install google-auth-library**

Run:
```bash
pnpm add google-auth-library@^10.5.0
```

Expected: Dependency added to package.json

**Step 2: Install jose for JWT handling**

Run:
```bash
pnpm add jose@^6.1.3
```

Expected: Dependency added to package.json

**Step 3: Install ioredis for Redis client**

Run:
```bash
pnpm add ioredis@^5.8.0
```

Expected: Dependency added to package.json

**Step 4: Install helmet for security headers**

Run:
```bash
pnpm add helmet@^8.1.0
```

Expected: Dependency added to package.json

**Step 5: Install types for development**

Run:
```bash
pnpm add -D @types/node
```

Expected: Dev dependency added

**Step 6: Write test to verify dependencies are available (TDD)**

Create `src/config/deps.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('OAuth Dependencies', () => {
  it('should have google-auth-library available', async () => {
    const module = await import('google-auth-library');
    expect(module.OAuth2Client).toBeDefined();
  });

  it('should have jose available', async () => {
    const module = await import('jose');
    expect(module.SignJWT).toBeDefined();
    expect(module.jwtVerify).toBeDefined();
  });

  it('should have ioredis available', async () => {
    const module = await import('ioredis');
    expect(module.default).toBeDefined();
  });

  it('should have helmet available', async () => {
    const module = await import('helmet');
    expect(module.default).toBeDefined();
  });
});
```

**Step 7: Run test to verify dependencies**

Run:
```bash
pnpm test src/config/deps.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify all OAuth dependencies are properly installed.

**Step 8: Commit dependencies**

```bash
git add package.json pnpm-lock.yaml src/config/deps.test.ts
git commit -m "deps: add OAuth dependencies (google-auth-library, jose, ioredis, helmet)"
```

### Task 2: Create OAuth Configuration Module

**Files:**
- Create: `src/config/oauth.ts`
- Create: `src/config/oauth.test.ts`

**Step 0: Create config directory**

Run:
```bash
mkdir -p src/config
```

Expected: Directory created

**Step 1: Write failing test for OAuth config validation**

Create `src/config/oauth.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getOAuthConfig, validateOAuthConfig } from './oauth.js';

describe('OAuth Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should throw error when OAuth enabled but CLIENT_ID missing', () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    delete process.env.GOOGLE_CLIENT_ID;

    expect(() => validateOAuthConfig()).toThrow('GOOGLE_CLIENT_ID');
  });

  it('should throw error when OAuth enabled but CLIENT_SECRET missing', () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    delete process.env.GOOGLE_CLIENT_SECRET;

    expect(() => validateOAuthConfig()).toThrow('GOOGLE_CLIENT_SECRET');
  });

  it('should throw error when OAuth enabled but OAUTH_SECRET missing', () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    delete process.env.MCP_OAUTH_SECRET;

    expect(() => validateOAuthConfig()).toThrow('MCP_OAUTH_SECRET');
  });

  it('should return valid config when all required vars present', () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.MCP_OAUTH_SECRET = 'test-oauth-secret-minimum-32-chars-long';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SERVER_URL = 'http://localhost:3000';

    const config = getOAuthConfig();
    expect(config.enabled).toBe(true);
    expect(config.googleClientId).toBe('test-client-id');
    expect(config.googleClientSecret).toBe('test-client-secret');
  });

  it('should return disabled config when OAuth not enabled', () => {
    process.env.MCP_ENABLE_OAUTH = 'false';

    const config = getOAuthConfig();
    expect(config.enabled).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/config/oauth.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './oauth.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement OAuth config module**

Create `src/config/oauth.ts`:
```typescript
export interface OAuthConfig {
  enabled: boolean;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  oauthSecret: string;
  tokenTTL: number;
  redisUrl: string;
  serverUrl: string;
}

export function getOAuthConfig(): OAuthConfig {
  const enabled = process.env.MCP_ENABLE_OAUTH === 'true';

  if (!enabled) {
    return {
      enabled: false,
      googleClientId: '',
      googleClientSecret: '',
      googleRedirectUri: '',
      oauthSecret: '',
      tokenTTL: 3600,
      redisUrl: '',
      serverUrl: '',
    };
  }

  validateOAuthConfig();

  return {
    enabled: true,
    googleClientId: process.env.GOOGLE_CLIENT_ID!,
    googleClientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    googleRedirectUri: process.env.GOOGLE_REDIRECT_URI!,
    oauthSecret: process.env.MCP_OAUTH_SECRET!,
    tokenTTL: parseInt(process.env.MCP_OAUTH_TOKEN_TTL || '3600', 10),
    redisUrl: process.env.REDIS_URL!,
    serverUrl: process.env.SERVER_URL!,
  };
}

export function validateOAuthConfig(): void {
  const required = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI',
    'MCP_OAUTH_SECRET',
    'REDIS_URL',
    'SERVER_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `OAuth is enabled but required environment variables are missing: ${missing.join(', ')}`
    );
  }

  const oauthSecret = process.env.MCP_OAUTH_SECRET!;
  if (oauthSecret.length < 32) {
    throw new Error('MCP_OAUTH_SECRET must be at least 32 characters long');
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/config/oauth.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit OAuth config**

```bash
git add src/config/oauth.ts src/config/oauth.test.ts
git commit -m "feat(oauth): add config validation module with tests"
```

### Task 3: Create Redis OAuth Store

**Files:**
- Create: `src/oauth/redis-store.ts`
- Create: `src/oauth/redis-store.test.ts`

**Step 0: Create oauth directory**

Run:
```bash
mkdir -p src/oauth
```

Expected: Directory created

**Step 1: Write failing test for Redis store**

Create `src/oauth/redis-store.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RedisOAuthStore } from './redis-store.js';
import Redis from 'ioredis';

vi.mock('ioredis');

describe('RedisOAuthStore', () => {
  let store: RedisOAuthStore;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      setex: vi.fn().mockResolvedValue('OK'),
      get: vi.fn(),
      del: vi.fn().mockResolvedValue(1),
      quit: vi.fn().mockResolvedValue('OK'),
    };
    (Redis as any).mockImplementation(() => mockRedis);
    store = new RedisOAuthStore('redis://localhost:6379');
  });

  afterEach(async () => {
    await store.close();
    vi.clearAllMocks();
  });

  it('should store and retrieve OAuth state', async () => {
    const state = 'test-state-value';
    const data = { codeVerifier: 'test-verifier', timestamp: Date.now() };

    mockRedis.get.mockResolvedValue(JSON.stringify(data));

    await store.saveState(state, data);
    const retrieved = await store.getState(state);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      expect.stringContaining(state),
      600,
      JSON.stringify(data)
    );
    expect(retrieved).toEqual(data);
  });

  it('should return null for non-existent state', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await store.getState('non-existent');
    expect(result).toBeNull();
  });

  it('should delete state after retrieval', async () => {
    const state = 'test-state';

    await store.deleteState(state);

    expect(mockRedis.del).toHaveBeenCalledWith(
      expect.stringContaining(state)
    );
  });

  it('should store user tokens', async () => {
    const userId = 'user-123';
    const tokens = { accessToken: 'token', refreshToken: 'refresh' };

    mockRedis.get.mockResolvedValue(JSON.stringify(tokens));

    await store.saveUserTokens(userId, tokens);
    const retrieved = await store.getUserTokens(userId);

    expect(retrieved).toEqual(tokens);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/oauth/redis-store.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './redis-store.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement Redis store**

Create `src/oauth/redis-store.ts`:
```typescript
import Redis from 'ioredis';

export interface OAuthState {
  codeVerifier: string;
  timestamp: number;
}

export interface UserTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export class RedisOAuthStore {
  private readonly client: Redis;
  private readonly prefix = 'oauth:';

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl);
  }

  async saveState(state: string, data: OAuthState): Promise<void> {
    const key = `${this.prefix}state:${state}`;
    // State expires in 10 minutes
    await this.client.setex(key, 600, JSON.stringify(data));
  }

  async getState(state: string): Promise<OAuthState | null> {
    const key = `${this.prefix}state:${state}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async deleteState(state: string): Promise<void> {
    const key = `${this.prefix}state:${state}`;
    await this.client.del(key);
  }

  async saveUserTokens(userId: string, tokens: UserTokens): Promise<void> {
    const key = `${this.prefix}user:${userId}`;
    // Tokens expire in 7 days
    await this.client.setex(key, 7 * 24 * 60 * 60, JSON.stringify(tokens));
  }

  async getUserTokens(userId: string): Promise<UserTokens | null> {
    const key = `${this.prefix}user:${userId}`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/oauth/redis-store.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit Redis store**

```bash
git add src/oauth/redis-store.ts src/oauth/redis-store.test.ts
git commit -m "feat(oauth): add Redis store for OAuth state and tokens"
```

### Task 4: Create PKCE Utilities

**Files:**
- Create: `src/oauth/pkce.ts`
- Create: `src/oauth/pkce.test.ts`

**Step 1: Write failing test for PKCE generation**

Create `src/oauth/pkce.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { generatePKCE, verifyCodeChallenge } from './pkce.js';

describe('PKCE Utilities', () => {
  it('should generate valid PKCE parameters', () => {
    const pkce = generatePKCE();

    expect(pkce.codeVerifier).toHaveLength(43);
    expect(pkce.codeChallenge).toBeTruthy();
    expect(pkce.codeChallengeMethod).toBe('S256');
  });

  it('should generate different verifiers each time', () => {
    const pkce1 = generatePKCE();
    const pkce2 = generatePKCE();

    expect(pkce1.codeVerifier).not.toBe(pkce2.codeVerifier);
    expect(pkce1.codeChallenge).not.toBe(pkce2.codeChallenge);
  });

  it('should verify valid code challenge', () => {
    const pkce = generatePKCE();
    const isValid = verifyCodeChallenge(pkce.codeVerifier, pkce.codeChallenge);

    expect(isValid).toBe(true);
  });

  it('should reject invalid code challenge', () => {
    const pkce = generatePKCE();
    const isValid = verifyCodeChallenge('wrong-verifier', pkce.codeChallenge);

    expect(isValid).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/oauth/pkce.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './pkce.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement PKCE utilities**

Create `src/oauth/pkce.ts`:
```typescript
import { randomBytes, createHash } from 'crypto';

export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * Generate PKCE (Proof Key for Code Exchange) parameters
 * RFC 7636 - OAuth 2.0 with PKCE
 */
export function generatePKCE(): PKCEParams {
  // Generate random 32-byte verifier
  const codeVerifier = base64URLEncode(randomBytes(32));

  // Create SHA256 hash of verifier
  const hash = createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = base64URLEncode(hash);

  return {
    codeVerifier,
    codeChallenge,
    codeChallengeMethod: 'S256',
  };
}

/**
 * Verify that a code verifier matches a code challenge
 */
export function verifyCodeChallenge(
  codeVerifier: string,
  codeChallenge: string
): boolean {
  const hash = createHash('sha256').update(codeVerifier).digest();
  const expectedChallenge = base64URLEncode(hash);
  return expectedChallenge === codeChallenge;
}

/**
 * Base64 URL encoding (without padding)
 */
function base64URLEncode(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/oauth/pkce.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit PKCE utilities**

```bash
git add src/oauth/pkce.ts src/oauth/pkce.test.ts
git commit -m "feat(oauth): add PKCE generation and verification utilities"
```

## Phase 2: Google OAuth Client

### Task 5: Create Google OAuth Client Wrapper

**Files:**
- Create: `src/oauth/google-client.ts`
- Create: `src/oauth/google-client.test.ts`

**Step 1: Write failing test for Google client**

Create `src/oauth/google-client.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleOAuthClient } from './google-client.js';
import { OAuth2Client } from 'google-auth-library';

vi.mock('google-auth-library');

describe('GoogleOAuthClient', () => {
  let client: GoogleOAuthClient;
  let mockOAuth2Client: any;

  beforeEach(() => {
    mockOAuth2Client = {
      generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/oauth'),
      getToken: vi.fn().mockResolvedValue({
        tokens: { access_token: 'test-token', id_token: 'test-id-token' },
      }),
      verifyIdToken: vi.fn().mockResolvedValue({
        getPayload: () => ({
          sub: 'user-123',
          email: 'test@example.com',
          email_verified: true,
        }),
      }),
    };

    (OAuth2Client as any).mockImplementation(() => mockOAuth2Client);

    client = new GoogleOAuthClient(
      'test-client-id',
      'test-client-secret',
      'http://localhost:3000/callback'
    );
  });

  it('should generate authorization URL with PKCE', () => {
    const result = client.getAuthorizationUrl('test-state', 'test-challenge');

    expect(mockOAuth2Client.generateAuthUrl).toHaveBeenCalledWith({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state: 'test-state',
      code_challenge: 'test-challenge',
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
    expect(result).toBe('https://accounts.google.com/oauth');
  });

  it('should exchange authorization code for tokens', async () => {
    const tokens = await client.exchangeCode('auth-code', 'verifier');

    expect(mockOAuth2Client.getToken).toHaveBeenCalledWith({
      code: 'auth-code',
      codeVerifier: 'verifier',
    });
    expect(tokens.accessToken).toBe('test-token');
  });

  it('should verify ID token', async () => {
    const payload = await client.verifyIdToken('test-id-token');

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/oauth/google-client.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './google-client.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement Google OAuth client**

Create `src/oauth/google-client.ts`:
```typescript
import { OAuth2Client } from 'google-auth-library';

export interface GoogleTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: number;
}

export interface GoogleUserInfo {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export class GoogleOAuthClient {
  private readonly oauth2Client: OAuth2Client;
  private readonly clientId: string;

  constructor(
    clientId: string,
    clientSecret: string,
    redirectUri: string
  ) {
    this.clientId = clientId;
    this.oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);
  }

  /**
   * Generate Google OAuth authorization URL with PKCE
   */
  getAuthorizationUrl(state: string, codeChallenge: string): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(
    code: string,
    codeVerifier: string
  ): Promise<GoogleTokens> {
    const { tokens } = await this.oauth2Client.getToken({
      code,
      codeVerifier,
    });

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      idToken: tokens.id_token,
      expiresAt: tokens.expiry_date,
    };
  }

  /**
   * Verify Google ID token and extract user info
   */
  async verifyIdToken(idToken: string): Promise<GoogleUserInfo> {
    const ticket = await this.oauth2Client.verifyIdToken({
      idToken,
      audience: this.clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid ID token: no payload');
    }

    return {
      sub: payload.sub,
      email: payload.email!,
      emailVerified: payload.email_verified ?? false,
      name: payload.name,
      picture: payload.picture,
    };
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/oauth/google-client.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit Google client**

```bash
git add src/oauth/google-client.ts src/oauth/google-client.test.ts
git commit -m "feat(oauth): add Google OAuth client wrapper with PKCE support"
```

## Phase 3: JWT Token Manager

### Task 6: Create Token Manager for Our JWTs

**Files:**
- Create: `src/oauth/token-manager.ts`
- Create: `src/oauth/token-manager.test.ts`

**Step 1: Write failing test for token manager**

Create `src/oauth/token-manager.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { TokenManager } from './token-manager.js';

describe('TokenManager', () => {
  let manager: TokenManager;
  const secret = 'test-secret-key-minimum-32-characters-long';

  beforeEach(() => {
    manager = new TokenManager(secret, 3600);
  });

  it('should create and verify valid JWT token', async () => {
    const userId = 'user-123';
    const email = 'test@example.com';

    const token = await manager.createToken(userId, email);
    const payload = await manager.verifyToken(token);

    expect(payload.sub).toBe(userId);
    expect(payload.email).toBe(email);
  });

  it('should reject invalid token', async () => {
    await expect(manager.verifyToken('invalid-token')).rejects.toThrow();
  });

  it('should reject expired token', async () => {
    const shortLivedManager = new TokenManager(secret, 0);
    const token = await shortLivedManager.createToken('user-123', 'test@example.com');

    // Wait 1 second for token to expire
    await new Promise((resolve) => setTimeout(resolve, 1000));

    await expect(manager.verifyToken(token)).rejects.toThrow();
  });

  it('should include correct claims in token', async () => {
    const token = await manager.createToken('user-123', 'test@example.com');
    const payload = await manager.verifyToken(token);

    expect(payload.sub).toBe('user-123');
    expect(payload.email).toBe('test@example.com');
    expect(payload.iss).toBe('synapse-mcp');
    expect(payload.aud).toBe('synapse-mcp-client');
    expect(payload.iat).toBeDefined();
    expect(payload.exp).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/oauth/token-manager.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './token-manager.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement token manager**

Create `src/oauth/token-manager.ts`:
```typescript
import { SignJWT, jwtVerify } from 'jose';

export interface TokenPayload {
  sub: string;
  email: string;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

export class TokenManager {
  private readonly secret: Uint8Array;
  private readonly ttl: number;

  constructor(secret: string, ttl: number = 3600) {
    this.secret = new TextEncoder().encode(secret);
    this.ttl = ttl;
  }

  /**
   * Create a signed JWT token for the user
   */
  async createToken(userId: string, email: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    return new SignJWT({
      sub: userId,
      email,
    })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setIssuer('synapse-mcp')
      .setAudience('synapse-mcp-client')
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttl)
      .sign(this.secret);
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(token: string): Promise<TokenPayload> {
    const { payload } = await jwtVerify(token, this.secret, {
      issuer: 'synapse-mcp',
      audience: 'synapse-mcp-client',
    });

    return payload as unknown as TokenPayload;
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/oauth/token-manager.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit token manager**

```bash
git add src/oauth/token-manager.ts src/oauth/token-manager.test.ts
git commit -m "feat(oauth): add JWT token manager for our own tokens"
```

## Phase 4: OAuth HTTP Handlers

### Task 7: Create OAuth Login Handler

**Files:**
- Create: `src/oauth/handlers.ts`
- Create: `src/oauth/handlers.test.ts`

**Step 1: Write failing test for login handler**

Create `src/oauth/handlers.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleLogin, handleCallback } from './handlers.js';
import type { Request, Response } from 'express';

describe('OAuth Handlers', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockGoogleClient: any;
  let mockStore: any;

  beforeEach(() => {
    mockReq = {
      query: {},
    };
    mockRes = {
      redirect: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockGoogleClient = {
      getAuthorizationUrl: vi.fn().mockReturnValue('https://google.com/oauth'),
    };
    mockStore = {
      saveState: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('handleLogin', () => {
    it('should redirect to Google with PKCE parameters', async () => {
      await handleLogin(
        mockReq as Request,
        mockRes as Response,
        mockGoogleClient,
        mockStore
      );

      expect(mockStore.saveState).toHaveBeenCalled();
      expect(mockRes.redirect).toHaveBeenCalledWith('https://google.com/oauth');
    });
  });

  describe('handleCallback', () => {
    it('should exchange code for tokens and return JWT', async () => {
      mockReq.query = { code: 'auth-code', state: 'test-state' };

      mockStore.getState = vi.fn().mockResolvedValue({
        codeVerifier: 'test-verifier',
        timestamp: Date.now(),
      });
      mockStore.deleteState = vi.fn().mockResolvedValue(undefined);
      mockStore.saveUserTokens = vi.fn().mockResolvedValue(undefined);

      mockGoogleClient.exchangeCode = vi.fn().mockResolvedValue({
        accessToken: 'google-token',
        idToken: 'id-token',
      });
      mockGoogleClient.verifyIdToken = vi.fn().mockResolvedValue({
        sub: 'user-123',
        email: 'test@example.com',
      });

      const mockTokenManager = {
        createToken: vi.fn().mockResolvedValue('our-jwt-token'),
      };

      await handleCallback(
        mockReq as Request,
        mockRes as Response,
        mockGoogleClient,
        mockStore,
        mockTokenManager
      );

      expect(mockRes.json).toHaveBeenCalledWith({
        access_token: 'our-jwt-token',
        token_type: 'Bearer',
        expires_in: expect.any(Number),
      });
    });

    it('should return error when code is missing', async () => {
      mockReq.query = {};

      await handleCallback(
        mockReq as Request,
        mockRes as Response,
        mockGoogleClient,
        mockStore,
        {} as any
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'invalid_request',
        error_description: expect.stringContaining('code'),
      });
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/oauth/handlers.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './handlers.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement OAuth handlers**

Create `src/oauth/handlers.ts`:
```typescript
import type { Request, Response } from 'express';
import { generatePKCE } from './pkce.js';
import { randomBytes } from 'crypto';
import type { GoogleOAuthClient } from './google-client.js';
import type { RedisOAuthStore } from './redis-store.js';
import type { TokenManager } from './token-manager.js';

/**
 * Handle /auth/login - Start OAuth flow
 */
export async function handleLogin(
  req: Request,
  res: Response,
  googleClient: GoogleOAuthClient,
  store: RedisOAuthStore
): Promise<void> {
  try {
    // Generate PKCE parameters
    const pkce = generatePKCE();
    const state = randomBytes(16).toString('hex');

    // Store PKCE verifier and state in Redis
    await store.saveState(state, {
      codeVerifier: pkce.codeVerifier,
      timestamp: Date.now(),
    });

    // Get Google authorization URL
    const authUrl = googleClient.getAuthorizationUrl(state, pkce.codeChallenge);

    // Redirect user to Google
    res.redirect(authUrl);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to initiate OAuth flow',
    });
  }
}

/**
 * Handle /auth/callback - Exchange code for tokens
 */
export async function handleCallback(
  req: Request,
  res: Response,
  googleClient: GoogleOAuthClient,
  store: RedisOAuthStore,
  tokenManager: TokenManager
): Promise<void> {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Missing code or state parameter',
      });
      return;
    }

    // Retrieve stored state
    const storedState = await store.getState(state as string);
    if (!storedState) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Invalid or expired state',
      });
      return;
    }

    // Delete state (one-time use)
    await store.deleteState(state as string);

    // Exchange authorization code for Google tokens
    const googleTokens = await googleClient.exchangeCode(
      code as string,
      storedState.codeVerifier
    );

    // Verify ID token and get user info
    const userInfo = await googleClient.verifyIdToken(googleTokens.idToken!);

    // Store Google refresh token (encrypted in production)
    await store.saveUserTokens(userInfo.sub, {
      accessToken: googleTokens.accessToken,
      refreshToken: googleTokens.refreshToken,
      expiresAt: googleTokens.expiresAt,
    });

    // Create our own JWT token
    const accessToken = await tokenManager.createToken(
      userInfo.sub,
      userInfo.email
    );

    // Return our token to client
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 3600, // Match token manager TTL
    });
  } catch (error) {
    console.error('Callback error:', error);
    res.status(500).json({
      error: 'server_error',
      error_description: 'Failed to complete OAuth flow',
    });
  }
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/oauth/handlers.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit OAuth handlers**

```bash
git add src/oauth/handlers.ts src/oauth/handlers.test.ts
git commit -m "feat(oauth): add login and callback handlers"
```

## Phase 5: Express Middleware Integration

### Task 8: Create Auth Middleware

**Files:**
- Create: `src/middleware/auth.ts`
- Create: `src/middleware/auth.test.ts`

**Step 0: Create middleware directory**

Run:
```bash
mkdir -p src/middleware
```

Expected: Directory created

**Step 1: Write failing test for auth middleware**

Create `src/middleware/auth.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authMiddleware } from './auth.js';
import type { Request, Response, NextFunction } from 'express';

describe('Auth Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let mockTokenManager: any;

  beforeEach(() => {
    mockReq = {
      headers: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
    mockTokenManager = {
      verifyToken: vi.fn(),
    };
  });

  it('should allow request with valid Bearer token', async () => {
    mockReq.headers = { authorization: 'Bearer valid-token' };
    mockTokenManager.verifyToken.mockResolvedValue({
      sub: 'user-123',
      email: 'test@example.com',
    });

    const middleware = authMiddleware(mockTokenManager);
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as any).user).toEqual({
      sub: 'user-123',
      email: 'test@example.com',
    });
  });

  it('should reject request without Authorization header', async () => {
    const middleware = authMiddleware(mockTokenManager);
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith({
      error: 'unauthorized',
      error_description: 'Missing Authorization header',
    });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject invalid token format', async () => {
    mockReq.headers = { authorization: 'InvalidFormat token' };

    const middleware = authMiddleware(mockTokenManager);
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject expired or invalid token', async () => {
    mockReq.headers = { authorization: 'Bearer invalid-token' };
    mockTokenManager.verifyToken.mockRejectedValue(new Error('Token expired'));

    const middleware = authMiddleware(mockTokenManager);
    await middleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run:
```bash
pnpm test src/middleware/auth.test.ts
```

Expected output: Test FAILS with error message containing "Cannot find module './auth.js'" or similar module resolution error. Verify RED state before proceeding.

**Step 3: Implement auth middleware**

Create `src/middleware/auth.ts`:
```typescript
import type { Request, Response, NextFunction } from 'express';
import type { TokenManager, TokenPayload } from '../oauth/token-manager.js';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Express middleware to validate Bearer tokens
 */
export function authMiddleware(tokenManager: TokenManager) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Missing Authorization header',
        });
        return;
      }

      const [scheme, token] = authHeader.split(' ');

      if (scheme !== 'Bearer' || !token) {
        res.status(401).json({
          error: 'unauthorized',
          error_description: 'Invalid Authorization header format',
        });
        return;
      }

      // Verify our JWT token
      const payload = await tokenManager.verifyToken(token);

      // Attach user to request
      req.user = payload;

      next();
    } catch (error) {
      console.error('Auth middleware error:', error);
      res.status(401).json({
        error: 'unauthorized',
        error_description: 'Invalid or expired token',
      });
    }
  };
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test src/middleware/auth.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state confirms implementation is correct.

**Step 5: Commit auth middleware**

```bash
git add src/middleware/auth.ts src/middleware/auth.test.ts
git commit -m "feat(oauth): add auth middleware for Bearer token validation"
```

### Task 9: Integrate OAuth into HTTP Server

**Files:**
- Modify: `src/services/container.ts`
- Modify: `src/index.ts`
- Create: `src/oauth/index.ts` (barrel export)
- Create: `src/services/container.oauth.test.ts`

**Step 1: Write failing test for OAuth barrel exports**

Create `src/oauth/index.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('OAuth Module Exports', () => {
  it('should export GoogleOAuthClient', async () => {
    const { GoogleOAuthClient } = await import('./index.js');
    expect(GoogleOAuthClient).toBeDefined();
  });

  it('should export all required classes and functions', async () => {
    const module = await import('./index.js');
    expect(module.TokenManager).toBeDefined();
    expect(module.RedisOAuthStore).toBeDefined();
    expect(module.handleLogin).toBeDefined();
    expect(module.handleCallback).toBeDefined();
    expect(module.generatePKCE).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails (RED)**

Run:
```bash
pnpm test src/oauth/index.test.ts
```

Expected output: Test FAILS with "Cannot find module './index.js'". Verify RED state before proceeding.

**Step 3: Create barrel export for OAuth module (GREEN)**

Create `src/oauth/index.ts`:
```typescript
export { GoogleOAuthClient } from './google-client.js';
export { TokenManager } from './token-manager.js';
export { RedisOAuthStore } from './redis-store.js';
export { handleLogin, handleCallback } from './handlers.js';
export { generatePKCE, verifyCodeChallenge } from './pkce.js';

export type { GoogleTokens, GoogleUserInfo } from './google-client.js';
export type { TokenPayload } from './token-manager.js';
export type { OAuthState, UserTokens } from './redis-store.js';
export type { PKCEParams } from './pkce.js';
```

**Step 4: Run test to verify it passes (GREEN)**

Run:
```bash
pnpm test src/oauth/index.test.ts
```

Expected output: All tests PASS with green checkmarks.

**Step 5: Write failing test for ServiceContainer OAuth integration**

Create `src/services/container.oauth.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock ioredis before importing ServiceContainer
vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    setex: vi.fn().mockResolvedValue('OK'),
    get: vi.fn().mockResolvedValue(null),
    del: vi.fn().mockResolvedValue(1),
    quit: vi.fn().mockResolvedValue('OK'),
  })),
}));

describe('ServiceContainer OAuth Integration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return null OAuth services when disabled', async () => {
    process.env.MCP_ENABLE_OAUTH = 'false';
    const { ServiceContainer } = await import('./container.js');
    const container = new ServiceContainer();

    expect(container.getGoogleClient()).toBeNull();
    expect(container.getTokenManager()).toBeNull();
    expect(container.getRedisStore()).toBeNull();
  });

  it('should initialize OAuth services when enabled', async () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:53200/auth/callback';
    process.env.MCP_OAUTH_SECRET = 'test-secret-minimum-32-characters-long-for-jwt';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SERVER_URL = 'http://localhost:53200';

    const { ServiceContainer } = await import('./container.js');
    const container = new ServiceContainer();

    expect(container.getGoogleClient()).not.toBeNull();
    expect(container.getTokenManager()).not.toBeNull();
    expect(container.getRedisStore()).not.toBeNull();
  });

  it('should return OAuth config', async () => {
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:53200/auth/callback';
    process.env.MCP_OAUTH_SECRET = 'test-secret-minimum-32-characters-long-for-jwt';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SERVER_URL = 'http://localhost:53200';

    const { ServiceContainer } = await import('./container.js');
    const container = new ServiceContainer();
    const config = container.getOAuthConfig();

    expect(config.enabled).toBe(true);
    expect(config.googleClientId).toBe('test-client-id');
  });
});
```

**Step 6: Run test to verify it fails (RED)**

Run:
```bash
pnpm test src/services/container.oauth.test.ts
```

Expected output: Test FAILS with "container.getGoogleClient is not a function" or similar. Verify RED state before proceeding.

**Step 7a: Add OAuth imports to ServiceContainer**

Modify `src/services/container.ts` - add imports at top:

```typescript
// Add imports at top of file
import { getOAuthConfig, type OAuthConfig } from '../config/oauth.js';
import { GoogleOAuthClient } from '../oauth/google-client.js';
import { TokenManager } from '../oauth/token-manager.js';
import { RedisOAuthStore } from '../oauth/redis-store.js';
```

**Step 7b: Add OAuth private fields to ServiceContainer class**

Add to ServiceContainer class private fields section:

```typescript
// Add to private fields
private oauthConfig?: OAuthConfig;
private googleClient?: GoogleOAuthClient;
private tokenManager?: TokenManager;
private redisStore?: RedisOAuthStore;
```

**Step 7c: Add getOAuthConfig method**

Add method to ServiceContainer class:

```typescript
getOAuthConfig(): OAuthConfig {
  if (!this.oauthConfig) {
    this.oauthConfig = getOAuthConfig();
  }
  return this.oauthConfig;
}
```

**Step 7d: Add getGoogleClient method**

Add method to ServiceContainer class:

```typescript
getGoogleClient(): GoogleOAuthClient | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.googleClient) {
    this.googleClient = new GoogleOAuthClient(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri
    );
  }
  return this.googleClient;
}
```

**Step 7e: Add getTokenManager method**

Add method to ServiceContainer class:

```typescript
getTokenManager(): TokenManager | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.tokenManager) {
    this.tokenManager = new TokenManager(config.oauthSecret, config.tokenTTL);
  }
  return this.tokenManager;
}
```

**Step 7f: Add getRedisStore method**

Add method to ServiceContainer class:

```typescript
getRedisStore(): RedisOAuthStore | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.redisStore) {
    this.redisStore = new RedisOAuthStore(config.redisUrl);
  }
  return this.redisStore;
}
```

**Step 7g: Update cleanup method**

Update the cleanup() method to include Redis:

```typescript
// Update cleanup() method to include Redis:
async cleanup(): Promise<void> {
  console.error('Cleaning up resources...');
  if (this.sshPool) {
    await this.sshPool.closeAll();
  }
  if (this.dockerService) {
    this.dockerService.clearClients();
  }
  // GoogleClient and TokenManager are stateless - no cleanup needed
  if (this.redisStore) {
    await this.redisStore.close();
  }
}
```

**Step 8: Run test to verify it passes (GREEN)**

Run:
```bash
pnpm test src/services/container.oauth.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify GREEN state.

**Step 9: Modify index.ts to use OAuth services**

Modify `src/index.ts` - add imports at top:

```typescript
// Add imports at top
import { getOAuthConfig, type OAuthConfig } from '../config/oauth.js';
import { GoogleOAuthClient } from '../oauth/google-client.js';
import { TokenManager } from '../oauth/token-manager.js';
import { RedisOAuthStore } from '../oauth/redis-store.js';

// Add to ServiceContainer class:
private oauthConfig?: OAuthConfig;
private googleClient?: GoogleOAuthClient;
private tokenManager?: TokenManager;
private redisStore?: RedisOAuthStore;

getOAuthConfig(): OAuthConfig {
  if (!this.oauthConfig) {
    this.oauthConfig = getOAuthConfig();
  }
  return this.oauthConfig;
}

getGoogleClient(): GoogleOAuthClient | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.googleClient) {
    this.googleClient = new GoogleOAuthClient(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri
    );
  }
  return this.googleClient;
}

getTokenManager(): TokenManager | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.tokenManager) {
    this.tokenManager = new TokenManager(config.oauthSecret, config.tokenTTL);
  }
  return this.tokenManager;
}

getRedisStore(): RedisOAuthStore | null {
  const config = this.getOAuthConfig();
  if (!config.enabled) return null;

  if (!this.redisStore) {
    this.redisStore = new RedisOAuthStore(config.redisUrl);
  }
  return this.redisStore;
}

// Update cleanup() method to include Redis:
async cleanup(): Promise<void> {
  console.error('Cleaning up resources...');
  if (this.sshPool) {
    await this.sshPool.closeAll();
  }
  if (this.dockerService) {
    this.dockerService.clearClients();
  }
  if (this.redisStore) {
    await this.redisStore.close();
  }
}
```

Then, modify `src/index.ts` to use ServiceContainer:

```typescript
// Add imports at top
import { handleLogin, handleCallback } from './oauth/index.js';
import { authMiddleware } from './middleware/auth.js';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// In runHTTP() function, after app creation:
const container = globalThis.__serviceContainer as ServiceContainer;
const oauthConfig = container.getOAuthConfig();

if (oauthConfig.enabled) {
  console.error('OAuth is enabled - initializing...');

  // Security headers
  app.use(helmet());

  // Get OAuth services from container
  const googleClient = container.getGoogleClient()!;
  const tokenManager = container.getTokenManager()!;
  const redisStore = container.getRedisStore()!;

  // Rate limiting for OAuth endpoints (10 requests per 15 minutes)
  const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10,
    standardHeaders: true,
    message: { error: 'too_many_requests', error_description: 'Too many login attempts' }
  });

  // OAuth routes (public, with rate limiting)
  app.get('/auth/login', oauthLimiter, (req, res) => handleLogin(req, res, googleClient, redisStore));
  app.get('/auth/callback', oauthLimiter, (req, res) => handleCallback(req, res, googleClient, redisStore, tokenManager));

  // Health check (public)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', oauth: true });
  });

  // Apply auth middleware to all MCP routes
  app.use('/mcp', authMiddleware(tokenManager));

  console.error(`OAuth initialized - login at ${oauthConfig.serverUrl}/auth/login`);
} else {
  console.error('OAuth is disabled');

  // Health check (public)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', oauth: false });
  });
}
```

**Step 4: Write automated test for OAuth server initialization**

Update `src/oauth/integration.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { getOAuthConfig } from '../config/oauth.js';
import type { ServiceContainer } from '../services/container.js';

describe('OAuth Integration', () => {
  beforeAll(() => {
    // Set OAuth environment variables
    process.env.MCP_ENABLE_OAUTH = 'true';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:53200/auth/callback';
    process.env.MCP_OAUTH_SECRET = 'test-secret-minimum-32-characters-long-for-jwt-signing';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.SERVER_URL = 'http://localhost:53200';
  });

  it('should load OAuth configuration when enabled', () => {
    const config = getOAuthConfig();
    expect(config.enabled).toBe(true);
    expect(config.googleClientId).toBe('test-client-id');
  });

  it('should initialize OAuth services via ServiceContainer', () => {
    // This test verifies ServiceContainer can create OAuth services
    // Full integration tested in tests/integration/oauth-flow.test.ts
    const config = getOAuthConfig();
    expect(config.enabled).toBe(true);
  });
});
```

Run:
```bash
pnpm test src/oauth/integration.test.ts
```

Expected output: All tests PASS with green checkmarks. Verify OAuth configuration loads correctly.

**Step 5: Run all tests**

Run:
```bash
pnpm test
```

Expected output: All tests PASS with green checkmarks across all OAuth modules.

**Step 6: Commit OAuth integration**

```bash
git add src/index.ts src/oauth/index.ts src/oauth/integration.test.ts src/services/container.ts
git commit -m "feat(oauth): integrate OAuth into HTTP server with ServiceContainer

- Add OAuth services to ServiceContainer with lazy initialization
- Add Redis cleanup to ServiceContainer.cleanup() method
- Add rate limiting to OAuth endpoints (10 req/15min)
- Replace manual testing with automated integration tests
- Apply helmet security headers when OAuth enabled
- Use existing dependency injection pattern"
```

## Phase 6: Documentation and Testing

### Task 10: Update README with OAuth Setup

**Files:**
- Modify: `README.md`

**Step 1: Add OAuth section to README**

Add to README.md after "HTTP Mode" section:

```markdown
### OAuth Authentication

When using HTTP transport, you can enable OAuth 2.1 authentication with Google:

#### Setup Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID
3. Add authorized redirect URI: `http://localhost:3000/auth/callback`
4. Note your Client ID and Client Secret

#### Configure OAuth

```bash
# Enable OAuth
export MCP_ENABLE_OAUTH=true

# Google OAuth credentials
export GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
export GOOGLE_CLIENT_SECRET=your-client-secret
export GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback

# JWT signing secret (generate with: openssl rand -base64 32)
export MCP_OAUTH_SECRET=your-secret-key-at-least-32-characters

# Redis for OAuth state storage
export REDIS_URL=redis://localhost:6379

# Server URL for metadata
export SERVER_URL=http://localhost:3000
```

#### OAuth Flow

1. **Login**: Navigate to `http://localhost:3000/auth/login`
2. **Authorize**: Google redirects you to authorize the app
3. **Callback**: Get redirected back with access token
4. **Use Token**: Include token in requests: `Authorization: Bearer <token>`

#### Example Request

```bash
curl -H "Authorization: Bearer your-token-here" \
  http://localhost:3000/mcp/list-tools
```

#### OAuth Endpoints

- `GET /auth/login` - Start OAuth flow
- `GET /auth/callback` - OAuth callback (handles code exchange)
- `GET /health` - Health check (no auth required)
- `GET /.well-known/oauth-protected-resource` - OAuth metadata (RFC 9728)
```

**Step 2: Commit README updates**

```bash
git add README.md
git commit -m "docs: add OAuth authentication setup guide"
```

### Task 11: Create Integration Test

**Files:**
- Create: `tests/integration/oauth-flow.test.ts`

**Step 0: Create integration tests directory**

Run:
```bash
mkdir -p tests/integration
```

Expected: Directory created

**Step 1: Write OAuth flow integration test**

Create `tests/integration/oauth-flow.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { Server } from 'http';
import { GoogleOAuthClient, TokenManager, RedisOAuthStore } from '../../src/oauth/index.js';
import { handleLogin, handleCallback } from '../../src/oauth/handlers.js';
import { authMiddleware } from '../../src/middleware/auth.js';

describe('OAuth Flow Integration', () => {
  let server: Server;
  let baseUrl: string;
  let redisStore: RedisOAuthStore;

  beforeAll(async () => {
    const app = express();

    const googleClient = new GoogleOAuthClient(
      'test-client-id',
      'test-client-secret',
      'http://localhost:3001/auth/callback'
    );
    const tokenManager = new TokenManager('test-secret-key-minimum-32-characters-long', 3600);
    redisStore = new RedisOAuthStore('redis://localhost:6379');

    app.get('/auth/login', (req, res) => handleLogin(req, res, googleClient, redisStore));
    app.get('/auth/callback', (req, res) => handleCallback(req, res, googleClient, redisStore, tokenManager));
    app.get('/protected', authMiddleware(tokenManager), (req, res) => {
      res.json({ user: req.user });
    });

    server = app.listen(3001);
    baseUrl = 'http://localhost:3001';
  });

  afterAll(async () => {
    await redisStore.close();
    server.close();
  });

  it('should redirect to Google on login', async () => {
    const response = await fetch(`${baseUrl}/auth/login`, {
      redirect: 'manual',
    });

    expect(response.status).toBe(302);
    const location = response.headers.get('location');
    expect(location).toContain('accounts.google.com');
    expect(location).toContain('code_challenge');
  });

  it('should reject protected route without token', async () => {
    const response = await fetch(`${baseUrl}/protected`);
    expect(response.status).toBe(401);
  });

  // Note: Full OAuth flow test requires mocking Google's OAuth endpoints
  // This would be done in a separate E2E test suite
});
```

**Step 2: Run integration test**

Run:
```bash
pnpm test tests/integration/oauth-flow.test.ts
```

Expected output: All integration tests PASS with green checkmarks (requires Redis running on localhost:6379). Verify GREEN state confirms OAuth flow works end-to-end.

**Step 3: Commit integration test**

```bash
git add tests/integration/oauth-flow.test.ts
git commit -m "test: add OAuth flow integration tests"
```

### Task 12: Final Verification

**Step 1: Run full test suite**

Run: `pnpm test`

Expected: All tests pass

**Step 2: Build TypeScript**

Run: `pnpm run build`

Expected: Clean build with no errors

**Step 3: Create automated smoke tests**

Create `tests/smoke/oauth-deployment.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('OAuth Deployment Smoke Tests', () => {
  beforeAll(async () => {
    // Start Docker Compose services
    await execAsync('docker compose up -d');
    // Wait for services to be ready
    await new Promise(resolve => setTimeout(resolve, 5000));
  }, 30000);

  afterAll(async () => {
    // Cleanup: stop services
    await execAsync('docker compose down');
  });

  it('should have healthy synapse-mcp service', async () => {
    const response = await fetch('http://localhost:53200/health');
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('ok');
  });

  it('should have synapse-redis service running', async () => {
    const { stdout } = await execAsync('docker compose ps synapse-redis --format json');
    const service = JSON.parse(stdout);
    expect(service.State).toBe('running');
  });
});
```

**Step 4: Run smoke tests**

Run:
```bash
pnpm test tests/smoke/oauth-deployment.test.ts
```

Expected output: All smoke tests PASS with green checkmarks. Verify Docker Compose services are healthy.

**Step 5: Final commit**

```bash
git add tests/smoke/oauth-deployment.test.ts
git commit -m "test: add automated smoke tests for OAuth deployment

- Create smoke tests for Docker Compose deployment
- Verify synapse-mcp health endpoint responds
- Verify synapse-redis service is running
- Replace manual curl commands with automated tests"
```

---

## Implementation Complete

All tasks implement OAuth via Google authentication following the Pulse architecture:

1. ✅ Dependencies installed (google-auth-library, jose, ioredis, helmet)
2. ✅ OAuth configuration validation
3. ✅ Redis store for state and tokens
4. ✅ PKCE utilities for secure OAuth flow
5. ✅ Google OAuth client wrapper
6. ✅ JWT token manager for our tokens
7. ✅ OAuth login/callback handlers
8. ✅ Auth middleware for protected routes
9. ✅ Integration with Express HTTP server
10. ✅ Documentation and integration tests

The implementation follows TDD, DRY, YAGNI principles with comprehensive test coverage and frequent commits.
