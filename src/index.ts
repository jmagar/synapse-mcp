#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerTools } from "./tools/index.js";

// Server metadata
const SERVER_NAME = "homelab-mcp-server";
const SERVER_VERSION = "1.0.0";

/**
 * Create and configure the MCP server
 */
function createServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION
  });

  // Register all homelab tools
  registerTools(server);

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
 * Run server with HTTP transport (for remote access, multiple clients)
 */
async function runHTTP(): Promise<void> {
  const server = createServer();
  const app = express();
  
  app.use(express.json());

  // Health check endpoint
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION });
  });

  // MCP endpoint - stateless JSON mode
  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    res.on("close", () => transport.close());

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  const host = process.env.HOST || "127.0.0.1";

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
    1. Path specified by HOMELAB_CONFIG_FILE env var
    2. ./homelab.config.json (current directory)
    3. ~/.config/homelab-mcp/config.json
    4. ~/.homelab-mcp.json

  Example config file:
  {
    "hosts": [
      {"name": "unraid", "host": "unraid.local", "port": 2375, "protocol": "http"},
      {"name": "proxmox", "host": "proxmox.local", "port": 2375, "protocol": "http"},
      {"name": "local", "host": "localhost", "dockerSocketPath": "/var/run/docker.sock"}
    ]
  }

ENVIRONMENT VARIABLES:
  HOMELAB_CONFIG_FILE     Path to config file (optional, overrides default paths)
  HOMELAB_HOSTS_CONFIG    JSON config as env var (fallback if no config file)
  PORT                    HTTP server port (default: 3000)
  HOST                    HTTP server bind address (default: 127.0.0.1)

CLAUDE CODE CONFIG (~/.claude/claude_code_config.json):
  {
    "mcpServers": {
      "homelab": {
        "command": "node",
        "args": ["/path/to/homelab-mcp-server/dist/index.js"],
        "env": {
          "HOMELAB_CONFIG_FILE": "/path/to/your/homelab.config.json"
        }
      }
    }
  }
`);
}

// Main entry point
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}

const transport = args.includes("--http") ? "http" : "stdio";

if (transport === "http") {
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
