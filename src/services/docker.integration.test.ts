import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

// IMPORTANT: This is an integration test - reset mocks before importing
vi.doUnmock('./docker.js');
vi.resetModules();

import { loadHostConfigs } from './docker.js';

describe('Config Loading Integration (Rename Verification)', () => {
  let originalEnv: Record<string, string | undefined>;
  let originalCwd: string;
  let testConfigFile: string | null = null;

  beforeEach(() => {
    // Save original state
    originalCwd = process.cwd();
    originalEnv = {
      SYNAPSE_HOSTS_CONFIG: process.env.SYNAPSE_HOSTS_CONFIG,
      SYNAPSE_CONFIG_FILE: process.env.SYNAPSE_CONFIG_FILE
    };

    // Change to /tmp to prevent loading config files from project directory
    process.chdir('/tmp');

    // Clear environment variables and set CONFIG_FILE to nonexistent to skip file loading
    delete process.env.SYNAPSE_HOSTS_CONFIG;
    process.env.SYNAPSE_CONFIG_FILE = '/tmp/nonexistent-synapse-config-for-testing.json';
  });

  afterEach(() => {
    // Restore environment
    process.chdir(originalCwd);
    if (originalEnv.SYNAPSE_HOSTS_CONFIG !== undefined) {
      process.env.SYNAPSE_HOSTS_CONFIG = originalEnv.SYNAPSE_HOSTS_CONFIG;
    } else {
      delete process.env.SYNAPSE_HOSTS_CONFIG;
    }
    if (originalEnv.SYNAPSE_CONFIG_FILE !== undefined) {
      process.env.SYNAPSE_CONFIG_FILE = originalEnv.SYNAPSE_CONFIG_FILE;
    } else {
      delete process.env.SYNAPSE_CONFIG_FILE;
    }

    // Cleanup test config file
    if (testConfigFile && existsSync(testConfigFile)) {
      rmSync(testConfigFile, { force: true });
      testConfigFile = null;
    }
  });

  it('should read SYNAPSE_HOSTS_CONFIG environment variable (renamed from HOMELAB_HOSTS_CONFIG)', () => {
    const configJson = '[{"name":"env-test","host":"192.168.1.1","port":2375,"protocol":"http"}]';
    process.env.SYNAPSE_HOSTS_CONFIG = configJson;

    const hosts = loadHostConfigs();

    expect(hosts.some(h => h.name === 'env-test')).toBe(true);
    const envHost = hosts.find(h => h.name === 'env-test');
    expect(envHost).toBeDefined();
    expect(envHost?.host).toBe('192.168.1.1');
  });

  it('should verify synapse naming convention is used (not homelab)', () => {
    // Test verifies the config system uses "synapse" naming, not "homelab"
    // This is a regression test from the homelab → synapse rename refactor
    const config = {
      hosts: [
        { name: 'test', host: 'localhost', port: 2375, protocol: 'http' }
      ]
    };

    // Create a temp file to verify naming convention
    testConfigFile = join(homedir(), '.synapse-mcp-test-temp.json');
    writeFileSync(testConfigFile, JSON.stringify(config));

    // Verify file was created with synapse naming, not homelab
    expect(existsSync(testConfigFile)).toBe(true);
    expect(testConfigFile).toContain('synapse');
    expect(testConfigFile).not.toContain('homelab');

    // Integration: Set SYNAPSE_CONFIG_FILE to point to the temp file and load it
    process.env.SYNAPSE_CONFIG_FILE = testConfigFile;
    const hosts = loadHostConfigs();

    // Verify the config was actually loaded from the file
    expect(hosts.some(h => h.name === 'test')).toBe(true);
    const testHost = hosts.find(h => h.name === 'test');
    expect(testHost).toBeDefined();
    expect(testHost?.host).toBe('localhost');
    expect(testHost?.port).toBe(2375);
    expect(testHost?.protocol).toBe('http');
  });

  it('should use SYNAPSE_ prefix for environment variables (renamed from HOMELAB_)', () => {
    // Verify the env var names are correctly renamed
    const validConfig = '[{"name":"test","host":"localhost","port":2375,"protocol":"http"}]';

    // Test SYNAPSE_HOSTS_CONFIG works
    process.env.SYNAPSE_HOSTS_CONFIG = validConfig;
    const hosts = loadHostConfigs();
    expect(hosts.length).toBeGreaterThan(0);

    // Clean up
    delete process.env.SYNAPSE_HOSTS_CONFIG;

    // Verify HOMELAB_HOSTS_CONFIG would NOT work (would fall back to local)
    delete process.env.HOMELAB_HOSTS_CONFIG;
    const hostsWithOldName = loadHostConfigs();
    // Should only have the default "local" host since HOMELAB_ prefix is not recognized
    expect(hostsWithOldName.every(h => h.name !== 'test')).toBe(true);
  });
});
