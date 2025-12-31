# OAuth via Google for Synapse-MCP (Pulse Architecture)

**Date:** 2025-12-30
**Status:** Design
**Architecture:** OAuth Proxy (like Pulse)

## Executive Summary

Implement OAuth authentication for synapse-mcp HTTP transport following the **exact same architecture as Pulse**:
- We handle the OAuth flow with Google (login, callback)
- We issue our own JWT tokens
- We store tokens in Redis
- MCP clients use our tokens (not Google's)

This is the CORRECT architecture - proven in Pulse.

## Architecture (Like Pulse)

```
User/MCP Client
  ↓
  1. GET /auth/login
  ↓
Synapse-MCP: Generate PKCE, redirect to Google
  ↓
  2. User authenticates with Google
  ↓
  3. GET /auth/callback?code=...
  ↓
Synapse-MCP:
  - Validate PKCE
  - Exchange code for Google tokens (needs CLIENT_SECRET!)
  - Verify Google ID token
  - Store encrypted Google refresh token in Redis
  - Generate OUR OWN JWT token
  - Return our token to client
  ↓
  4. POST /mcp
     Authorization: Bearer <OUR-jwt-token>
  ↓
Synapse-MCP:
  - Verify OUR JWT (not Google's!)
  - Check scopes & host access
  - Process request
```

## What We Need (Same as Pulse)

### Dependencies
```json
{
  "google-auth-library": "^10.5.0",  // Google OAuth client
  "jose": "^6.1.3",                   // Our JWT signing
  "ioredis": "^5.6.1",                // Redis for storage
  "helmet": "^8.0.0"                  // Security headers
}
```

### Redis Storage
- Auth state (PKCE verifiers, 5min TTL)
- Authorization codes (5min TTL)
- Google refresh tokens (encrypted, 30 day TTL)
- User permissions (no TTL)

### Environment Variables
```bash
# OAuth Configuration
MCP_ENABLE_OAUTH=true
MCP_OAUTH_SECRET=<32+ char secret for JWT signing>
MCP_OAUTH_TOKEN_TTL=3600

# Google OAuth (BOTH client ID and secret!)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:53200/auth/callback

# Redis
REDIS_URL=redis://synapse-redis:6379

# Server
SERVER_URL=http://localhost:53200
```

## File Structure (Copied from Pulse)

```
src/
├── oauth/
│   ├── google-client.ts       # GoogleOAuthClient (like Pulse)
│   ├── token-manager.ts       # Our JWT signing/verification
│   ├── redis-store.ts         # Redis storage adapter
│   ├── pkce.ts                # PKCE generation/validation
│   ├── crypto.ts              # Encryption for refresh tokens
│   ├── scopes.ts              # Scope definitions
│   └── types.ts               # OAuth types
│
├── middleware/
│   ├── auth.ts                # Bearer token validation (OUR tokens)
│   ├── scope.ts               # Scope checking
│   ├── host.ts                # Host access control
│   ├── cors.ts                # CORS
│   ├── security-headers.ts    # Helmet
│   └── rate-limit.ts          # Rate limiting
│
├── routes/
│   ├── auth-routes.ts         # /auth/login, /auth/callback
│   ├── oauth-handlers.ts      # OAuth flow logic
│   ├── token-handlers.ts      # /oauth/token endpoint
│   └── metadata.ts            # /.well-known endpoints
│
└── server/
    └── http.ts                # Express server + middleware pipeline
```

## Implementation (Exact Pulse Patterns)

### 1. Google OAuth Client (src/oauth/google-client.ts)

```typescript
import { OAuth2Client } from 'google-auth-library';

export class GoogleOAuthClient {
  private client: OAuth2Client;

  constructor(config: { clientId: string; clientSecret: string; redirectUri: string }) {
    this.client = new OAuth2Client(
      config.clientId,
      config.clientSecret,
      config.redirectUri
    );
  }

  // Generate authorization URL with PKCE
  generateAuthUrl(codeChallenge: string, state: string): string {
    return this.client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent',
    });
  }

  // Exchange authorization code for tokens (USES CLIENT SECRET!)
  async exchangeCode(code: string, codeVerifier: string) {
    const { tokens } = await this.client.getToken({
      code,
      codeVerifier,
    });

    return {
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiryDate: tokens.expiry_date!,
      idToken: tokens.id_token,
    };
  }

  // Verify Google ID token
  async verifyIdToken(idToken: string) {
    const ticket = await this.client.verifyIdToken({ idToken });
    return ticket.getPayload(); // { sub, email, name }
  }

  // Refresh access token
  async refreshAccessToken(refreshToken: string) {
    this.client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.client.refreshAccessToken();
    return {
      accessToken: credentials.access_token!,
      expiryDate: credentials.expiry_date!,
    };
  }
}
```

### 2. Token Manager (src/oauth/token-manager.ts)

```typescript
import { SignJWT, jwtVerify } from 'jose';

export class TokenManager {
  private secret: Uint8Array;
  private ttl: number;

  constructor(secret: string, ttl: number = 3600) {
    this.secret = new TextEncoder().encode(secret);
    this.ttl = ttl;
  }

  // Create OUR JWT token
  async createAccessToken(user: UserPermissions): Promise<string> {
    return await new SignJWT({
      userId: user.userId,
      email: user.email,
      scopes: user.scopes,
      allowedHosts: user.allowedHosts,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${this.ttl}s`)
      .sign(this.secret);
  }

  // Verify OUR JWT token
  async verifyToken(token: string): Promise<UserPermissions> {
    const { payload } = await jwtVerify(token, this.secret);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      scopes: payload.scopes as string[],
      allowedHosts: payload.allowedHosts as string[],
    };
  }
}
```

### 3. Redis Store (src/oauth/redis-store.ts)

```typescript
import Redis from 'ioredis';
import { encrypt, decrypt } from './crypto.js';

export class RedisOAuthStore {
  private redis: Redis;
  private encryptionKey: string;

  constructor(redisUrl: string, encryptionKey: string) {
    this.redis = new Redis(redisUrl);
    this.encryptionKey = encryptionKey;
  }

  // Auth state (PKCE verifiers, 5min TTL)
  async saveAuthState(stateId: string, data: {
    codeVerifier: string;
    clientId?: string;
    redirectUri?: string;
  }): Promise<void> {
    await this.redis.setex(
      `oauth:state:${stateId}`,
      300,
      JSON.stringify(data)
    );
  }

  async getAuthState(stateId: string) {
    const data = await this.redis.get(`oauth:state:${stateId}`);
    return data ? JSON.parse(data) : null;
  }

  // Authorization codes (5min TTL)
  async saveAuthCode(code: string, data: {
    userId: string;
    email: string;
    scopes: string[];
    codeChallenge?: string;
  }): Promise<void> {
    await this.redis.setex(
      `oauth:code:${code}`,
      300,
      JSON.stringify(data)
    );
  }

  async getAuthCode(code: string) {
    const data = await this.redis.get(`oauth:code:${code}`);
    if (!data) return null;
    await this.redis.del(`oauth:code:${code}`); // One-time use
    return JSON.parse(data);
  }

  // Google refresh tokens (encrypted, 30 day TTL)
  async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const encrypted = encrypt(refreshToken, this.encryptionKey);
    await this.redis.setex(
      `oauth:refresh:${userId}`,
      2592000, // 30 days
      encrypted
    );
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    const encrypted = await this.redis.get(`oauth:refresh:${userId}`);
    return encrypted ? decrypt(encrypted, this.encryptionKey) : null;
  }

  // User permissions (no TTL)
  async saveUserPermissions(userId: string, permissions: UserPermissions): Promise<void> {
    await this.redis.set(
      `oauth:user:${userId}`,
      JSON.stringify(permissions)
    );
  }

  async getUserPermissions(userId: string): Promise<UserPermissions | null> {
    const data = await this.redis.get(`oauth:user:${userId}`);
    return data ? JSON.parse(data) : null;
  }
}
```

### 4. OAuth Handlers (src/routes/oauth-handlers.ts)

```typescript
import { generatePKCE, validatePKCE } from '../oauth/pkce.js';

export async function handleLogin(req, res, { googleClient, store }) {
  // Generate PKCE
  const { verifier, challenge } = generatePKCE();
  const state = crypto.randomUUID();

  // Store PKCE verifier in Redis
  await store.saveAuthState(state, {
    codeVerifier: verifier,
  });

  // Redirect to Google
  const authUrl = googleClient.generateAuthUrl(challenge, state);
  res.redirect(authUrl);
}

export async function handleCallback(req, res, { googleClient, store, tokenManager }) {
  const { code, state } = req.query;

  // Get PKCE verifier from Redis
  const authState = await store.getAuthState(state);
  if (!authState) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  // Exchange code for Google tokens (USES CLIENT SECRET!)
  const googleTokens = await googleClient.exchangeCode(code, authState.codeVerifier);

  // Verify Google ID token
  const googleUser = await googleClient.verifyIdToken(googleTokens.idToken);

  // Store Google refresh token (encrypted)
  if (googleTokens.refreshToken) {
    await store.saveRefreshToken(googleUser.sub, googleTokens.refreshToken);
  }

  // Load user permissions from config
  const permissions = getUserPermissionsFromConfig(googleUser.email);

  // Store user permissions in Redis
  await store.saveUserPermissions(googleUser.sub, {
    userId: googleUser.sub,
    email: googleUser.email,
    scopes: permissions.scopes,
    allowedHosts: permissions.allowedHosts,
  });

  // Generate OUR JWT token
  const accessToken = await tokenManager.createAccessToken({
    userId: googleUser.sub,
    email: googleUser.email,
    scopes: permissions.scopes,
    allowedHosts: permissions.allowedHosts,
  });

  // Return our token
  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
  });
}
```

## Docker Compose (WITH Redis!)

```yaml
services:
  synapse-mcp:
    build: .
    ports:
      - "${SYNAPSE_PORT:-53200}:3000"
    environment:
      MCP_ENABLE_OAUTH: "${MCP_ENABLE_OAUTH:-true}"
      MCP_OAUTH_SECRET: "${MCP_OAUTH_SECRET}"
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      GOOGLE_CLIENT_SECRET: "${GOOGLE_CLIENT_SECRET}"
      GOOGLE_REDIRECT_URI: "${GOOGLE_REDIRECT_URI}"
      REDIS_URL: "redis://synapse-redis:6379"
      SERVER_URL: "${SERVER_URL}"
    volumes:
      - ./synapse.config.json:/app/synapse.config.json:ro
    depends_on:
      - synapse-redis
    networks:
      - synapse-network

  synapse-redis:
    image: redis:7-alpine
    ports:
      - "${REDIS_PORT:-53201}:6379"
    volumes:
      - synapse-redis-data:/data
    networks:
      - synapse-network
    command: redis-server --appendonly yes

volumes:
  synapse-redis-data:

networks:
  synapse-network:
```

## Implementation Plan

### Phase 1: OAuth Infrastructure (Week 1)
1. ✅ Install dependencies (google-auth-library, jose, ioredis, helmet)
2. ✅ Implement GoogleOAuthClient
3. ✅ Implement TokenManager (our JWT signing)
4. ✅ Implement RedisOAuthStore
5. ✅ Implement PKCE utilities
6. ✅ Implement crypto utilities

### Phase 2: OAuth Routes (Week 1)
1. ✅ Implement /auth/login
2. ✅ Implement /auth/callback
3. ✅ Implement /oauth/token (for refresh)
4. ✅ Implement /.well-known endpoints

### Phase 3: Middleware (Week 1)
1. ✅ Implement auth middleware (validates OUR tokens)
2. ✅ Implement scope middleware
3. ✅ Implement host access middleware
4. ✅ Integrate into HTTP server

### Phase 4: Testing & Docs (Week 1)
1. ✅ Integration tests with real Google OAuth
2. ✅ Update README
3. ✅ Docker deployment guide

**Total: 1 week**

## User Flow

1. User visits `http://localhost:53200/auth/login`
2. Redirected to Google login
3. User authenticates with Google
4. Redirected back to `/auth/callback`
5. Receives our JWT token
6. Uses our token for MCP requests: `Authorization: Bearer <our-token>`

This is the PULSE architecture. Proven and working.
