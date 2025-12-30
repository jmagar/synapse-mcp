#!/usr/bin/env node
import { NodeSSH } from 'node-ssh';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ssh = new NodeSSH();

// Read the private key
const keyPath = join(homedir(), '.ssh/id_ed25519');
console.error('=== Reading SSH Key ===');
console.error('Key path:', keyPath);

let privateKey;
try {
  privateKey = readFileSync(keyPath, 'utf-8');
  console.error('Key read successfully');
  console.error('Key length:', privateKey.length);
  console.error('Key first 50 chars:', privateKey.substring(0, 50));
  console.error('Has BEGIN marker:', privateKey.includes('BEGIN'));
  console.error('Has END marker:', privateKey.includes('END'));
} catch (error) {
  console.error('Failed to read key:', error);
  process.exit(1);
}

// Connection config
const config = {
  host: '100.75.111.118',
  port: 22,
  username: 'jmagar',
  privateKey,
  readyTimeout: 30000
};

console.error('\n=== Connection Config ===');
console.error(JSON.stringify({
  ...config,
  privateKey: `${config.privateKey.length} chars`
}, null, 2));

console.error('\n=== Attempting Connection ===');

ssh.connect(config)
  .then(() => {
    console.error('=== Connection Success ===');
    console.error('Connected successfully!');
    return ssh.execCommand('echo test');
  })
  .then(result => {
    console.error('=== Command Result ===');
    console.error('stdout:', result.stdout);
    console.error('stderr:', result.stderr);
    console.error('code:', result.code);
    ssh.dispose();
    process.exit(0);
  })
  .catch(err => {
    console.error('=== Connection Failed ===');
    console.error('Error type:', err.constructor.name);
    console.error('Error message:', err.message);
    console.error('Error stack:', err.stack);
    console.error('Error details:', JSON.stringify(err, null, 2));
    process.exit(1);
  });
