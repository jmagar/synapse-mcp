// src/services/interfaces.test.ts - NEW FILE
import { describe, it, expect } from 'vitest';
import type { IComposeProjectLister } from './interfaces.js';
import type { HostConfig, ComposeProject } from '../types.js';

describe('IComposeProjectLister', () => {
  it('should be implemented with listComposeProjects method', async () => {
    const mockLister: IComposeProjectLister = {
      listComposeProjects: async (host: HostConfig): Promise<ComposeProject[]> => {
        return [
          {
            name: 'test-project',
            status: 'running',
            configFiles: ['/compose/test/docker-compose.yaml'],
            services: []
          }
        ];
      }
    };

    const host: HostConfig = {
      name: 'test',
      host: 'localhost',
      protocol: 'ssh'
    };

    const result = await mockLister.listComposeProjects(host);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test-project');
    expect(result[0].configFiles).toContain('/compose/test/docker-compose.yaml');
  });
});
