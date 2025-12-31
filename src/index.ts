#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import rateLimit from "express-rate-limit";
import { registerTools } from "./tools/index.js";
import { createDefaultContainer, type ServiceContainer } from "./services/container.js";

// Server metadata
const SERVER_NAME = "synapse-mcp";
const SERVER_VERSION = "1.0.0";

// Global service container instance
let globalContainer: ServiceContainer | undefined;

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  // Create and register service container
  globalContainer = createDefaultContainer();

  // Register all tools
  registerTools(server, globalContainer);

  return server;
}

/**
 * Run server with stdio transport (for Claude Code, local integrations)
 */
async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`${SERVER_NAME} v${SERVER_VERSION} running on stdio`);
}

/**
 * Rate limiter for HTTP API
 */
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" }
});

/**
 * Run server with HTTP transport (for remote access, multiple clients)
 */
async function runHTTP(): Promise<void> {
  const server = createServer();
  const app = express();

  app.use(express.json());

  // Request logging middleware
  app.use((req, _res, next) => {
    const timestamp = new Date().toISOString();
    const forwarded = req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "";
    console.error(`[${timestamp}] ${req.method} ${req.path} from ${req.ip} (fwd: ${forwarded})`);
    next();
  });

  // Health check endpoint (no rate limiting)
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // MCP endpoint - stateless JSON mode with rate limiting
  app.post("/mcp", limiter, async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.SYNAPSE_PORT || "3000", 10);
  const host = process.env.SYNAPSE_HOST || "127.0.0.1";

  app.listen(port, host, () => {
    console.error(`${SERVER_NAME} v${SERVER_VERSION} running on http://${host}:${port}/mcp`);
  });
}

/**
 * Print usage information
 */
function printUsage(): void {
  console.log(`
${SERVER_NAME} v${SERVER_VERSION}

MCP server for managing homelab Docker infrastructure across multiple hosts.

USAGE:
  node dist/index.js [--stdio | --http]

OPTIONS:
  --stdio     Run with stdio transport (default, for Claude Code)
  --http      Run with HTTP transport (for remote access)
  --help      Show this help message

CONFIGURATION:
  Create a config file at one of these locations (checked in order):
    1. Path specified by SYNAPSE_CONFIG_FILE env var
    2. ./synapse.config.json (current directory)
    3. ~/.config/synapse-mcp/config.json
    4. ~/.synapse-mcp.json

  Example config file:
  {
    "hosts": [
      {"name": "unraid", "host": "unraid.local", "port": 2375, "protocol": "http"},
      {"name": "proxmox", "host": "proxmox.local", "port": 2375, "protocol": "http"},
      {"name": "local", "host": "localhost", "dockerSocketPath": "/var/run/docker.sock"}
    ]
  }

ENVIRONMENT VARIABLES:
  SYNAPSE_CONFIG_FILE     Path to config file (optional, overrides default paths)
  SYNAPSE_HOSTS_CONFIG    JSON config as env var (fallback if no config file)
  SYNAPSE_PORT            HTTP server port (default: 3000)
  SYNAPSE_HOST            HTTP server bind address (default: 127.0.0.1)

CLAUDE CODE CONFIG (~/.claude/claude_code_config.json):
  {
    "mcpServers": {
      "synapse": {
        "command": "node",
        "args": ["/path/to/synapse-mcp-server/dist/index.js"],
        "env": {
          "SYNAPSE_CONFIG_FILE": "/path/to/your/synapse.config.json"
        }
      }
    }
  }
`);
}

/**
 * Graceful shutdown handler
 */
async function shutdown(signal: string): Promise<void> {
  console.error(`\nReceived ${signal}, shutting down gracefully...`);
  if (globalContainer) {
    await globalContainer.cleanup();
  }
  console.error("Cleanup complete");
  process.exit(0);
}

// Register signal handlers for graceful shutdown
process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    console.error("Error during shutdown:", error);
    process.exit(1);
  });
});
process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    console.error("Error during shutdown:", error);
    process.exit(1);
  });
});

// Main entry point
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const transportMode = args.includes("--http") ? "http" : "stdio";

if (transportMode === "http") {
  runHTTP().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
} else {
  runStdio().catch((error) => {
    console.error("Server error:", error);
    process.exit(1);
  });
}
