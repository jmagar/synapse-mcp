#!/usr/bin/env node
/**
 * Test script to reproduce the SSH connection failure with full diagnostic logging.
 * This runs the same code path that the MCP server would execute for a 'ps' action.
 */

import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import SSHConfig from 'ssh-config';
import { NodeSSH } from 'node-ssh';

console.error('===========================================');
console.error('Starting MCP Server SSH Connection Test');
console.error('===========================================\n');

// 1. Load SSH config (same as ssh-config-loader.ts)
console.error('=== STEP 1: Load SSH Config ===');
const configPath = join(homedir(), '.ssh', 'config');
console.error('Config path:', configPath);

if (!existsSync(configPath)) {
  console.error('ERROR: SSH config file does not exist');
  process.exit(1);
}

const configContent = readFileSync(configPath, 'utf-8');
const config = SSHConfig.parse(configContent);

console.error('SSH config parsed');

// Find the "squirts" host
console.error('\nSearching for host "squirts"...');

const squirtsSection = config.find({ Host: 'squirts' });
if (!squirtsSection || !('config' in squirtsSection)) {
  console.error('ERROR: Host "squirts" not found in SSH config');
  process.exit(1);
}

console.error('Found "squirts" section');

// Extract configuration values (same logic as ssh-config-loader.ts)
function getStringValue(value) {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && value.length > 0) {
    return value[0].val;
  }
  return '';
}

function expandTildePath(path) {
  if (path.startsWith('~/')) {
    return join(homedir(), path.slice(2));
  }
  if (path === '~') {
    return homedir();
  }
  return path;
}

const LineType = { DIRECTIVE: 1 };

const hostname = squirtsSection.config.find(line =>
  line.type === LineType.DIRECTIVE && line.param === 'HostName'
);
const user = squirtsSection.config.find(line =>
  line.type === LineType.DIRECTIVE && line.param === 'User'
);
const port = squirtsSection.config.find(line =>
  line.type === LineType.DIRECTIVE && line.param === 'Port'
);
const identityFile = squirtsSection.config.find(line =>
  line.type === LineType.DIRECTIVE && line.param === 'IdentityFile'
);

const hostConfig = {
  name: 'squirts',
  host: getStringValue(hostname.value),
  protocol: 'ssh',
  sshUser: user ? getStringValue(user.value) : undefined,
  port: port ? parseInt(getStringValue(port.value), 10) : undefined,
  sshKeyPath: identityFile ? expandTildePath(getStringValue(identityFile.value)) : undefined
};

console.error('\n=== Host Config Created ===');
console.error('Host:', hostConfig.name);
console.error('Host address:', hostConfig.host);
console.error('Port:', hostConfig.port || 22);
console.error('User:', hostConfig.sshUser || '(not set)');
console.error('SSH Key Path:', hostConfig.sshKeyPath || '(not set)');

// 2. File System Checks (same as ssh-pool.ts createConnection)
console.error('\n=== STEP 2: File System Checks ===');
if (hostConfig.sshKeyPath) {
  console.error('Key path:', hostConfig.sshKeyPath);
  console.error('Exists:', existsSync(hostConfig.sshKeyPath));

  if (existsSync(hostConfig.sshKeyPath)) {
    const { statSync } = await import('fs');
    const stats = statSync(hostConfig.sshKeyPath);
    console.error('Is file:', stats.isFile());
    console.error('Permissions:', stats.mode.toString(8));
    console.error('Size:', stats.size, 'bytes');
  }
} else {
  console.error('WARNING: No sshKeyPath configured');
}

// 3. Read Private Key (same as ssh-pool.ts)
console.error('\n=== STEP 3: Read Private Key ===');
let privateKey;
if (hostConfig.sshKeyPath) {
  try {
    privateKey = readFileSync(hostConfig.sshKeyPath, 'utf-8');
    console.error('Key read successfully');
    console.error('Key length:', privateKey.length, 'characters');
    console.error('Key first 50 chars:', privateKey.substring(0, 50));
    console.error('Key last 50 chars:', privateKey.substring(privateKey.length - 50));
    console.error('Has BEGIN marker:', privateKey.includes('BEGIN'));
    console.error('Has END marker:', privateKey.includes('END'));
  } catch (error) {
    console.error('ERROR reading private key:');
    console.error('  Type:', error.constructor.name);
    console.error('  Message:', error.message);
    process.exit(1);
  }
} else {
  console.error('ERROR: Cannot connect without SSH key');
  process.exit(1);
}

// 4. Create Connection Config (same as ssh-pool.ts)
console.error('\n=== STEP 4: Create Connection Config ===');
const connectionConfig = {
  host: hostConfig.host,
  port: hostConfig.port || 22,
  username: hostConfig.sshUser || process.env.USER || 'root',
  privateKey,
  readyTimeout: 5000  // DEFAULT_POOL_CONFIG.connectionTimeoutMs
};

console.error('Connection config:');
console.error('  host:', connectionConfig.host);
console.error('  port:', connectionConfig.port);
console.error('  username:', connectionConfig.username);
console.error('  privateKey:', connectionConfig.privateKey ? `${connectionConfig.privateKey.length} chars` : 'undefined');
console.error('  readyTimeout:', connectionConfig.readyTimeout, 'ms');

// 5. Attempt Connection (same as ssh-pool.ts)
console.error('\n=== STEP 5: Attempt SSH Connection ===');
const ssh = new NodeSSH();

try {
  await ssh.connect(connectionConfig);
  console.error('✅ CONNECTION SUCCESS!');
  console.error('Connected to', hostConfig.name);

  // Try running ps command
  console.error('\n=== STEP 6: Run ps Command ===');
  const result = await ssh.execCommand('ps aux');
  console.error('Command executed successfully');
  console.error('Exit code:', result.code);
  console.error('Output lines:', result.stdout.split('\n').length);

  await ssh.dispose();
  console.error('\n✅ ALL TESTS PASSED!');
  process.exit(0);
} catch (error) {
  console.error('❌ CONNECTION FAILED');
  console.error('Error type:', error.constructor.name);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);

  if (error && typeof error === 'object') {
    console.error('Error details:', JSON.stringify(error, null, 2));
  }

  process.exit(1);
}
