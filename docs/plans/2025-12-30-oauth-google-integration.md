# OAuth via Google for Synapse-MCP

**Date:** 2025-12-30
**Status:** Design
**Spec:** MCP Authorization 2025-11-25

## Executive Summary

Implement MCP-compliant OAuth authentication for synapse-mcp HTTP transport using Google as the Authorization Server. Synapse-MCP acts as a **Resource Server only** - it validates Google-issued JWT tokens but does NOT handle the OAuth flow itself.

**Key Insight:** This is MUCH simpler than initially designed. We don't build an authorization server - we just validate tokens from Google.

## Architecture

### What Synapse-MCP Does (Resource Server)

```
MCP Client → POST /mcp (no token)
  ↓
Synapse-MCP: 401 Unauthorized
  WWW-Authenticate: Bearer resource_metadata="https://..."
  ↓
MCP Client: GET /.well-known/oauth-protected-resource
  ↓
Synapse-MCP: {
  "resource": "https://mcp.example.com/mcp",
  "authorization_servers": ["https://accounts.google.com"],
  "scopes_supported": ["flux:read", "flux:write", "scout:read", "scout:write"]
}
  ↓
MCP Client: [Handles OAuth flow with Google directly - WE DON'T PARTICIPATE]
  ↓
MCP Client: POST /mcp
  Authorization: Bearer <google-jwt-token>
  ↓
Synapse-MCP:
  1. Verify JWT signature (using Google's JWKS)
  2. Validate audience claim (our client ID)
  3. Extract user info (email, sub)
  4. Check scopes and host access
  5. Process MCP request
```

### What We DON'T Need

- ❌ Authorization code flow (`/auth/login`, `/auth/callback`)
- ❌ Token issuance endpoint (`/oauth/token`)
- ❌ PKCE generation/validation
- ❌ Authorization code storage
- ❌ Refresh token management
- ❌ Session cookies
- ❌ **Redis** (stateless JWT validation only!)
- ❌ GoogleOAuthClient wrapper
- ❌ Our own JWT signing

### What We DO Need

- ✅ Google JWT verification (JWKS from Google)
- ✅ Protected Resource Metadata endpoint (RFC 9728)
- ✅ WWW-Authenticate header on 401
- ✅ Bearer token middleware
- ✅ Scope validation middleware
- ✅ Host access control middleware

## Specification Compliance

### MCP Authorization Spec 2025-11-25

**Resource Server Requirements (RFC 9728):**
- ✅ Implement `/.well-known/oauth-protected-resource` endpoint
- ✅ Return `authorization_servers` array pointing to Google
- ✅ List `scopes_supported` for our tools
- ✅ Validate Bearer tokens on every request
- ✅ Return WWW-Authenticate header on 401

**Token Validation (OAuth 2.1):**
- ✅ Accept tokens in `Authorization: Bearer` header only (NOT query params)
- ✅ Verify JWT signature using Google's public keys (JWKS)
- ✅ Validate `aud` claim matches our Google Client ID
- ✅ Validate `iss` claim is `https://accounts.google.com`
- ✅ Check token expiration (`exp` claim)

**Error Responses:**
- ✅ 401 Unauthorized: Missing/invalid/expired token
- ✅ 403 Forbidden: Insufficient scopes or host access denied
- ✅ 400 Bad Request: Malformed request

## File Structure (Simplified)

```
src/
├── index.ts                    # MODIFY: Add OAuth mode
├── types.ts                    # EXTEND: OAuth config types
├── constants.ts                # EXTEND: OAuth constants
│
├── oauth/                      # NEW (minimal!)
│   ├── google-verifier.ts     # Google JWT verification via JWKS
│   ├── scopes.ts              # Scope definitions
│   └── types.ts               # OAuth-specific types
│
├── middleware/                 # NEW
│   ├── auth.ts                # Bearer token validation
│   ├── scope.ts               # Scope checking
│   ├── host.ts                # Host access control
│   ├── cors.ts                # CORS configuration
│   ├── security-headers.ts    # Security headers (helmet)
│   └── rate-limit.ts          # Rate limiting
│
├── routes/                     # NEW
│   ├── metadata.ts            # /.well-known endpoints
│   └── health.ts              # /health endpoint
│
└── server/                     # NEW
    └── http.ts                # Express server + middleware pipeline
```

## Dependencies

**Add to package.json:**

```json
{
  "dependencies": {
    "jose": "^6.1.3",              // JWT verification with JWKS
    "helmet": "^8.0.0"             // Security headers
  }
}
```

**NO Redis, NO google-auth-library, NO session management!**

## Implementation

### 1. Google JWT Verifier (`src/oauth/google-verifier.ts`)

```typescript
import { createRemoteJWKSet, jwtVerify } from 'jose';

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUER = 'https://accounts.google.com';

export class GoogleTokenVerifier {
  private jwks: ReturnType<typeof createRemoteJWKSet>;
  private clientId: string;

  constructor(googleClientId: string) {
    this.clientId = googleClientId;
    this.jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }

  async verify(token: string): Promise<GoogleTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: GOOGLE_ISSUER,
        audience: this.clientId,
        // Clock tolerance for expiration check
        clockTolerance: 60
      });

      return {
        userId: payload.sub as string,
        email: payload.email as string,
        name: payload.name as string,
        picture: payload.picture as string,
        // Google doesn't include scopes in ID tokens
        // We'll map email to scopes via config
      };
    } catch (error) {
      if (error.code === 'ERR_JWT_EXPIRED') {
        throw new TokenExpiredError('Token has expired');
      }
      throw new InvalidTokenError('Invalid token signature or claims');
    }
  }
}

export interface GoogleTokenPayload {
  userId: string;    // Google sub claim
  email: string;
  name?: string;
  picture?: string;
}
```

### 2. Protected Resource Metadata (`src/routes/metadata.ts`)

```typescript
import { Router } from 'express';

export function createMetadataRouter(config: {
  serverUrl: string;
  googleAuthServer: string;
  scopes: string[];
}) {
  const router = Router();

  // RFC 9728: OAuth 2.0 Protected Resource Metadata
  router.get('/.well-known/oauth-protected-resource', (req, res) => {
    res.json({
      resource: `${config.serverUrl}/mcp`,
      authorization_servers: [config.googleAuthServer],
      scopes_supported: config.scopes,
      bearer_methods_supported: ['header'],
      resource_documentation: `${config.serverUrl}/docs`
    });
  });

  return router;
}
```

### 3. Auth Middleware (`src/middleware/auth.ts`)

```typescript
import type { Request, Response, NextFunction } from 'express';
import { GoogleTokenVerifier } from '../oauth/google-verifier.js';
import { getUserPermissions } from '../oauth/permissions.js';

export function createAuthMiddleware(verifier: GoogleTokenVerifier, config: {
  serverUrl: string;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Allow unauthenticated MCP initialization
    if (req.body?.method === 'initialize') {
      return next();
    }

    // Extract Bearer token
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res
        .status(401)
        .header('WWW-Authenticate',
          `Bearer realm="mcp", ` +
          `resource_metadata="${config.serverUrl}/.well-known/oauth-protected-resource"`
        )
        .json({
          error: 'unauthorized',
          message: 'Missing Authorization header. Include: Authorization: Bearer <token>'
        });
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    try {
      // Verify Google JWT
      const googlePayload = await verifier.verify(token);

      // Load user permissions from config
      const permissions = getUserPermissions(googlePayload.email);

      if (!permissions) {
        return res.status(403).json({
          error: 'access_denied',
          message: `User ${googlePayload.email} not authorized for this server`
        });
      }

      // Attach user to request
      res.locals.user = {
        userId: googlePayload.userId,
        email: googlePayload.email,
        name: googlePayload.name,
        scopes: permissions.scopes,
        allowedHosts: permissions.allowedHosts
      };

      next();
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'token_expired',
          message: 'Access token has expired. Please re-authenticate with Google.'
        });
      }

      return res.status(401).json({
        error: 'invalid_token',
        message: 'Invalid or malformed access token'
      });
    }
  };
}
```

### 4. User Permissions Config (`src/oauth/permissions.ts`)

```typescript
// Simple file-based permission mapping
// email -> scopes + allowed hosts

interface UserPermissions {
  scopes: string[];
  allowedHosts: string[];
}

// Load from synapse.config.json
const USER_PERMISSIONS: Record<string, UserPermissions> = {
  'admin@example.com': {
    scopes: ['flux:*', 'scout:*'],  // Wildcard = all permissions
    allowedHosts: ['*']              // All hosts
  },
  'developer@example.com': {
    scopes: ['flux:read', 'scout:read'],
    allowedHosts: ['tootie', 'dookie']
  },
  'readonly@example.com': {
    scopes: ['flux:read'],
    allowedHosts: ['tootie']
  }
};

export function getUserPermissions(email: string): UserPermissions | null {
  return USER_PERMISSIONS[email] || null;
}

// Load from config file
export function loadUserPermissionsFromConfig(config: SynapseConfig) {
  // TODO: Load from config.oauth.users
}
```

### 5. Scope Middleware (`src/middleware/scope.ts`)

```typescript
import type { Request, Response, NextFunction } from 'express';

// Map MCP actions to required scopes
const SCOPE_REQUIREMENTS: Record<string, string[]> = {
  // Flux actions
  'flux:container:start': ['flux:write'],
  'flux:container:stop': ['flux:write'],
  'flux:container:restart': ['flux:write'],
  'flux:container:list': ['flux:read'],
  'flux:container:logs': ['flux:read'],
  'flux:container:stats': ['flux:read'],

  'flux:compose:up': ['flux:write'],
  'flux:compose:down': ['flux:write'],
  'flux:compose:restart': ['flux:write'],
  'flux:compose:logs': ['flux:read'],

  // Scout actions
  'scout:peek': ['scout:read'],
  'scout:exec': ['scout:write'],
  'scout:beam': ['scout:write'],
  'scout:zfs:pools': ['scout:read'],
  'scout:logs:journal': ['scout:read'],
};

export function createScopeMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    if (!user) return next(); // Auth middleware catches this

    // Extract action from MCP request
    const action = extractActionFromMCPRequest(req.body);
    const requiredScopes = SCOPE_REQUIREMENTS[action] || [];

    // Check if user has required scopes
    const hasScopes = requiredScopes.every(requiredScope =>
      user.scopes.includes(requiredScope) ||
      user.scopes.includes(requiredScope.split(':')[0] + ':*') || // Wildcard
      user.scopes.includes('*')  // Super wildcard
    );

    if (!hasScopes) {
      return res
        .status(403)
        .header('WWW-Authenticate',
          `Bearer error="insufficient_scope", ` +
          `scope="${requiredScopes.join(' ')}"`
        )
        .json({
          error: 'insufficient_scope',
          message: `Missing required scopes for action: ${action}`,
          required_scopes: requiredScopes,
          user_scopes: user.scopes
        });
    }

    next();
  };
}

function extractActionFromMCPRequest(body: any): string {
  if (body?.params?.name === 'flux') {
    const args = body.params.arguments;
    return `flux:${args.action}:${args.subaction}`;
  }
  if (body?.params?.name === 'scout') {
    const args = body.params.arguments;
    if (args.subaction) {
      return `scout:${args.action}:${args.subaction}`;
    }
    return `scout:${args.action}`;
  }
  return 'unknown';
}
```

### 6. Host Middleware (`src/middleware/host.ts`)

```typescript
import type { Request, Response, NextFunction } from 'express';

export function createHostMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = res.locals.user;
    if (!user) return next();

    // Extract target host from MCP request
    const targetHost = extractHostFromMCPRequest(req.body);
    if (!targetHost) return next(); // No specific host targeted

    // Check if user has access to this host
    const hasAccess =
      user.allowedHosts.includes('*') ||          // Wildcard access
      user.allowedHosts.includes(targetHost);     // Explicit access

    if (!hasAccess) {
      return res.status(403).json({
        error: 'host_access_denied',
        message: `Access denied to host: ${targetHost}`,
        allowed_hosts: user.allowedHosts,
        requested_host: targetHost
      });
    }

    next();
  };
}

function extractHostFromMCPRequest(body: any): string | null {
  return body?.params?.arguments?.host || null;
}
```

### 7. HTTP Server (`src/server/http.ts`)

```typescript
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMetadataRouter } from '../routes/metadata.js';
import { GoogleTokenVerifier } from '../oauth/google-verifier.js';
import { createAuthMiddleware } from '../middleware/auth.js';
import { createScopeMiddleware } from '../middleware/scope.js';
import { createHostMiddleware } from '../middleware/host.js';

export async function createHTTPServer(
  mcpServer: McpServer,
  config: OAuthConfig
): Promise<express.Application> {
  const app = express();

  // Security
  app.use(helmet());
  app.use(express.json());

  // Rate limiting
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests' }
  });

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Protected Resource Metadata (no auth required)
  app.use(createMetadataRouter({
    serverUrl: config.serverUrl,
    googleAuthServer: 'https://accounts.google.com',
    scopes: ['flux:read', 'flux:write', 'scout:read', 'scout:write']
  }));

  // OAuth enabled mode
  if (config.enabled) {
    const verifier = new GoogleTokenVerifier(config.google.clientId);
    const authMiddleware = createAuthMiddleware(verifier, { serverUrl: config.serverUrl });
    const scopeMiddleware = createScopeMiddleware();
    const hostMiddleware = createHostMiddleware();

    // MCP endpoint with auth
    app.post('/mcp', limiter, authMiddleware, scopeMiddleware, hostMiddleware, async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on('close', () => transport.close());
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  } else {
    // MCP endpoint without auth (development mode)
    app.post('/mcp', limiter, async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });

      res.on('close', () => transport.close());
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    });
  }

  return app;
}
```

## Configuration

### Environment Variables (Simplified)

```bash
# OAuth Configuration
MCP_ENABLE_OAUTH=true

# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com

# Server URL (for metadata)
SERVER_URL=http://localhost:53200
```

### User Permissions (synapse.config.json)

```json
{
  "hosts": [ ... ],
  "oauth": {
    "users": {
      "admin@example.com": {
        "scopes": ["flux:*", "scout:*"],
        "allowedHosts": ["*"]
      },
      "developer@example.com": {
        "scopes": ["flux:read", "scout:read"],
        "allowedHosts": ["tootie", "dookie"]
      }
    }
  }
}
```

## Google OAuth Setup

### 1. Create OAuth Client

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth Client ID
3. Application type: **Web application**
4. **Important:** Do NOT configure redirect URIs (we're not handling the flow!)
5. Copy Client ID only

### 2. What MCP Clients Need

MCP clients need to:
1. Configure their own redirect URI with Google
2. Handle OAuth flow themselves
3. Obtain Google ID token
4. Pass token to synapse-mcp via `Authorization: Bearer` header

We just validate their tokens!

## Testing Strategy

### Unit Tests

```typescript
// src/oauth/google-verifier.test.ts
describe('GoogleTokenVerifier', () => {
  it('should verify valid Google JWT tokens', async () => {
    const verifier = new GoogleTokenVerifier('test-client-id');
    const mockToken = createMockGoogleJWT();

    const payload = await verifier.verify(mockToken);
    expect(payload.email).toBe('test@example.com');
  });

  it('should reject tokens with wrong audience', async () => {
    const verifier = new GoogleTokenVerifier('correct-client-id');
    const tokenWithWrongAud = createMockGoogleJWT({ aud: 'wrong-client-id' });

    await expect(verifier.verify(tokenWithWrongAud)).rejects.toThrow();
  });

  it('should reject expired tokens', async () => {
    const expiredToken = createMockGoogleJWT({ exp: Date.now() / 1000 - 3600 });
    await expect(verifier.verify(expiredToken)).rejects.toThrow('TokenExpiredError');
  });
});

// src/middleware/auth.test.ts
describe('authMiddleware', () => {
  it('should allow requests with valid Google tokens', async () => {
    const token = await createValidGoogleToken();
    const req = mockRequest({
      headers: { authorization: `Bearer ${token}` }
    });

    await authMiddleware(req, res, next);
    expect(res.locals.user).toBeDefined();
    expect(next).toHaveBeenCalled();
  });

  it('should return 401 with WWW-Authenticate header', async () => {
    const req = mockRequest({ headers: {} });

    await authMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.header).toHaveBeenCalledWith('WWW-Authenticate', expect.stringContaining('Bearer'));
  });
});

// src/routes/metadata.test.ts
describe('Protected Resource Metadata', () => {
  it('should return correct metadata structure', async () => {
    const res = await request(app).get('/.well-known/oauth-protected-resource');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      resource: expect.stringContaining('/mcp'),
      authorization_servers: ['https://accounts.google.com'],
      scopes_supported: expect.arrayContaining(['flux:read', 'flux:write'])
    });
  });
});
```

### Integration Tests

```typescript
describe('OAuth Integration', () => {
  it('should complete full flow with real Google token', async () => {
    // 1. Unauthenticated request
    const res1 = await request(app).post('/mcp').send({ method: 'tools/list' });
    expect(res1.status).toBe(401);
    expect(res1.headers['www-authenticate']).toContain('Bearer');

    // 2. Discover metadata
    const res2 = await request(app).get('/.well-known/oauth-protected-resource');
    expect(res2.body.authorization_servers).toContain('https://accounts.google.com');

    // 3. (Client handles OAuth with Google here)
    const googleToken = await getGoogleTokenFromRealOAuthFlow();

    // 4. Authenticated request
    const res3 = await request(app)
      .post('/mcp')
      .set('Authorization', `Bearer ${googleToken}`)
      .send({ method: 'tools/list' });

    expect(res3.status).toBe(200);
  });
});
```

## Implementation Plan

### Phase 1: Core JWT Validation (Week 1)
1. ✅ Install `jose` dependency
2. ✅ Implement `GoogleTokenVerifier`
3. ✅ Write unit tests for token verification
4. ✅ Test with real Google tokens

### Phase 2: Middleware Pipeline (Week 1)
1. ✅ Implement auth middleware with WWW-Authenticate
2. ✅ Implement scope middleware
3. ✅ Implement host access middleware
4. ✅ Write middleware tests

### Phase 3: Metadata & Routes (Week 1)
1. ✅ Implement Protected Resource Metadata endpoint
2. ✅ Update HTTP server with middleware pipeline
3. ✅ Integration tests

### Phase 4: Configuration & Docs (Week 1)
1. ✅ Update synapse.config.json schema
2. ✅ Update .env.example
3. ✅ Write Google OAuth setup guide
4. ✅ Update README.md

**Total: 1 week (not 4!)**

## Docker Deployment

**NO REDIS NEEDED!**

```yaml
services:
  synapse-mcp:
    build: .
    ports:
      - "53200:3000"
    environment:
      MCP_ENABLE_OAUTH: "true"
      GOOGLE_CLIENT_ID: "${GOOGLE_CLIENT_ID}"
      SERVER_URL: "http://localhost:53200"
    volumes:
      - ./synapse.config.json:/app/synapse.config.json:ro
    restart: unless-stopped
```

## Migration from Current Design

### What to Remove
- ❌ Entire `src/oauth/google-client.ts` (don't need OAuth flow)
- ❌ Entire `src/oauth/token-manager.ts` (don't create JWTs)
- ❌ Entire `src/oauth/redis-store.ts` (no storage needed)
- ❌ Entire `src/oauth/pkce.ts` (client handles PKCE)
- ❌ All `/auth/*` routes
- ❌ `/oauth/token` endpoint
- ❌ Redis dependency
- ❌ google-auth-library dependency
- ❌ ioredis dependency
- ❌ Session middleware

### What to Keep
- ✅ Scope definitions (`src/oauth/scopes.ts`)
- ✅ Middleware structure (but simplify)
- ✅ Host access control concept

## Security Considerations

### Token Validation
- ✅ Verify signature using Google's JWKS (auto-rotated)
- ✅ Validate `aud` claim (prevents token reuse across apps)
- ✅ Validate `iss` claim (ensures token from Google)
- ✅ Check expiration with clock tolerance (60s)

### Scope Enforcement
- ✅ Per-action scope requirements
- ✅ Wildcard support (`flux:*`)
- ✅ Deny by default

### Host Access Control
- ✅ Per-user host allowlist
- ✅ Wildcard support for admins
- ✅ Explicit deny for unauthorized hosts

### Rate Limiting
- ✅ 100 requests per minute per IP
- ✅ Separate limits for auth vs MCP endpoints

## References

- [MCP Authorization Spec (2025-11-25)](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)
- [RFC 9728: OAuth 2.0 Protected Resource Metadata](https://datatracker.ietf.org/doc/html/rfc9728)
- [RFC 8414: OAuth 2.0 Authorization Server Metadata](https://datatracker.ietf.org/doc/html/rfc8414)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [MCP Example Remote Server](https://github.com/modelcontextprotocol/example-remote-server)

## Conclusion

This design is **dramatically simpler** than initially planned:
- No authorization server implementation
- No OAuth flow handling
- No Redis/session storage
- No token issuance
- **Just JWT validation from Google**

Implementation time: **1 week** (not 4!)
