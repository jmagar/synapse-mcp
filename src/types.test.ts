// src/types.test.ts - NEW FILE
import { describe, it, expect } from 'vitest';
import type { HostConfig } from './types.js';

describe('HostConfig', () => {
  it('should support optional composeSearchPaths field', () => {
    const config: HostConfig = {
      name: 'test',
      host: 'localhost',
      protocol: 'ssh',
      composeSearchPaths: ['/opt/stacks', '/srv/docker']
    };

    expect(config.composeSearchPaths).toEqual(['/opt/stacks', '/srv/docker']);
  });

  it('should work without composeSearchPaths', () => {
    const config: HostConfig = {
      name: 'test',
      host: 'localhost',
      protocol: 'ssh'
    };

    expect(config.composeSearchPaths).toBeUndefined();
  });
});
