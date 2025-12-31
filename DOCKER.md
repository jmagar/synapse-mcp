# Docker Deployment Guide for Synapse-MCP

## Overview

Run synapse-mcp with OAuth authentication using Docker Compose. This setup includes:
- **synapse-mcp** - MCP server with HTTP transport + OAuth
- **synapse-redis** - Dedicated Redis instance for OAuth tokens/sessions

## Quick Start

### 1. Prerequisites

- Docker and Docker Compose installed
- Google OAuth credentials (see [Setup Google OAuth](#setup-google-oauth))
- SSH keys configured for remote hosts (if using SSH protocol)

### 2. Configuration

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and configure:
```bash
# Required OAuth Settings
MCP_ENABLE_OAUTH=true
MCP_OAUTH_SECRET=$(openssl rand -base64 32)  # Generate secure secret
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:53200/auth/callback

# Port Configuration
SYNAPSE_PORT=53200  # External MCP server port
REDIS_PORT=53201    # External Redis port (optional, for debugging)
```

### 3. Deploy

Start the services:
```bash
docker compose up -d
```

Check health:
```bash
docker compose ps
docker compose logs synapse-mcp
```

## Setup Google OAuth

### 1. Create OAuth Credentials

Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. **Create Project** (or select existing)
2. **Enable APIs**:
   - Go to "APIs & Services" → "Library"
   - Enable "Google+ API" or "People API"
3. **Create OAuth Client**:
   - Go to "Credentials" → "Create Credentials" → "OAuth client ID"
   - Application type: **Web application**
   - Name: `synapse-mcp`

4. **Configure Authorized Redirect URIs**:
   ```
   http://localhost:53200/auth/callback
   http://YOUR_SERVER_IP:53200/auth/callback
   ```

5. **Copy Credentials**:
   - Copy the **Client ID**
   - Copy the **Client Secret**
   - Add to `.env` file

### 2. Configure OAuth Consent Screen

1. Go to "OAuth consent screen"
2. User Type: **Internal** (if using Google Workspace) or **External**
3. Fill in app information:
   - App name: `Synapse MCP`
   - User support email: your email
   - Developer contact: your email
4. Scopes: Add `openid`, `email`, `profile`
5. Save

## Service Details

### Synapse MCP Server

- **Container**: `synapse-mcp`
- **Port**: `53200` (configurable via `SYNAPSE_PORT`)
- **Health**: `http://localhost:53200/health`
- **MCP Endpoint**: `http://localhost:53200/mcp`

**OAuth Endpoints:**
- Login: `http://localhost:53200/auth/login`
- Callback: `http://localhost:53200/auth/callback`
- Token: `http://localhost:53200/oauth/token`
- Metadata: `http://localhost:53200/.well-known/oauth-authorization-server`

### Redis

- **Container**: `synapse-redis`
- **Port**: `53201` (configurable via `REDIS_PORT`)
- **Persistence**: AOF (append-only file) with `everysec` fsync
- **Memory**: 256MB max with LRU eviction
- **Volume**: `synapse_redis_data`

**Redis stores:**
- OAuth state (5min TTL)
- Authorization codes (5min TTL)
- Refresh tokens (30 day TTL, encrypted)
- User permissions (no TTL)

## Usage

### For MCP Clients

1. **Initiate OAuth Flow**:
   ```bash
   curl "http://localhost:53200/auth/login?client_id=my-client&redirect_uri=http://localhost:8080/callback"
   ```

2. **User authenticates with Google** (redirect to browser)

3. **Exchange authorization code for token**:
   ```bash
   curl -X POST http://localhost:53200/oauth/token \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "code=YOUR_AUTH_CODE" \
     -d "redirect_uri=http://localhost:8080/callback" \
     -d "code_verifier=YOUR_PKCE_VERIFIER"
   ```

4. **Make MCP requests with Bearer token**:
   ```bash
   curl -X POST http://localhost:53200/mcp \
     -H "Authorization: Bearer YOUR_JWT_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
   ```

### Token Refresh

Access tokens expire after 1 hour (configurable). Refresh using:
```bash
curl -X POST http://localhost:53200/oauth/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "refresh_token=YOUR_REFRESH_TOKEN"
```

## Volumes & Data

### Persistent Data

- **Redis data**: `synapse_redis_data` volume
  - Location: Docker volume (inspect with `docker volume inspect synapse_redis_data`)
  - Contains: OAuth tokens, user permissions

### Backup Redis Data

```bash
# Backup
docker compose exec synapse-redis redis-cli BGSAVE
docker cp synapse-redis:/data/dump.rdb ./redis-backup-$(date +%Y%m%d).rdb

# Restore
docker compose down
docker cp redis-backup-20241230.rdb synapse-redis:/data/dump.rdb
docker compose up -d
```

## Maintenance

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f synapse-mcp
docker compose logs -f synapse-redis
```

### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart synapse-mcp
```

### Update

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose up -d --build
```

### Clean Up

```bash
# Stop services (keep data)
docker compose down

# Stop and remove volumes (DELETE ALL DATA)
docker compose down -v
```

## Troubleshooting

### OAuth Login Fails

**Check Google OAuth configuration:**
```bash
# Verify redirect URI matches
echo $GOOGLE_REDIRECT_URI

# Test OAuth metadata endpoint
curl http://localhost:53200/.well-known/oauth-authorization-server | jq
```

**Check Redis connection:**
```bash
docker compose exec synapse-redis redis-cli ping
# Should return: PONG
```

### Token Validation Fails

**Check JWT secret:**
```bash
# Ensure MCP_OAUTH_SECRET is set and >= 32 chars
echo $MCP_OAUTH_SECRET | wc -c
```

**Check token in Redis:**
```bash
docker compose exec synapse-redis redis-cli
> KEYS oauth:*
> GET oauth:refresh:google-123
```

### Port Conflicts

If ports 53200 or 53201 are in use:

1. Check what's using the port:
   ```bash
   lsof -i :53200
   ```

2. Change port in `.env`:
   ```bash
   SYNAPSE_PORT=53300  # Use different port
   ```

3. Restart:
   ```bash
   docker compose up -d
   ```

## Security Notes

### Production Recommendations

1. **Use HTTPS**: Deploy behind a reverse proxy (Caddy, nginx) with TLS
2. **Strong Secret**: Generate `MCP_OAUTH_SECRET` with `openssl rand -base64 32`
3. **Network Isolation**: Use Docker networks to restrict Redis access
4. **Firewall**: Restrict port 53200 to trusted IPs only
5. **Redis Password**: Add Redis password authentication (update `REDIS_URL`)

### Token Security

- Access tokens expire after 1 hour (configurable)
- Refresh tokens stored encrypted in Redis
- JWT signed with HS256 algorithm
- PKCE (S256) required for authorization code flow

## Architecture

```
┌──────────────────────────────────────┐
│  Docker Host                         │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  synapse-mcp                   │ │
│  │  Port: 53200                   │ │
│  │                                │ │
│  │  ┌──────────────────────────┐ │ │
│  │  │  Express HTTP Server     │ │ │
│  │  │  • OAuth Routes          │ │ │
│  │  │  • MCP Endpoints         │ │ │
│  │  │  • Middleware Pipeline   │ │ │
│  │  └──────────────────────────┘ │ │
│  └────────────┬───────────────────┘ │
│               │                      │
│               │ redis://synapse-redis:6379
│               │                      │
│  ┌────────────▼───────────────────┐ │
│  │  synapse-redis                 │ │
│  │  Port: 53201 (external)        │ │
│  │  Port: 6379 (internal)         │ │
│  │                                │ │
│  │  Storage:                      │ │
│  │  • OAuth states (5min TTL)     │ │
│  │  • Auth codes (5min TTL)       │ │
│  │  • Refresh tokens (30d TTL)    │ │
│  │  • User permissions            │ │
│  └────────────────────────────────┘ │
└──────────────────────────────────────┘
```

## Next Steps

After deployment:

1. Test OAuth flow: `curl http://localhost:53200/auth/login`
2. Configure MCP client to use Bearer token authentication
3. Set up reverse proxy for production (optional)
4. Configure user permissions and scopes (see main README.md)
