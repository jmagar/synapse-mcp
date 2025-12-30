// src/tools/flux.integration.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema } from '../schemas/flux/index.js';

describe('Flux Integration', () => {
  describe('container subactions (14 implemented)', () => {
    it('should validate container:list', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'list' })).not.toThrow();
    });

    it('should validate container:start', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'start', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:stop', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'stop', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:restart', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'restart', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:pause', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'pause', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:resume', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'resume', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:logs', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'logs', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:stats', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'stats', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:inspect', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'inspect', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:search', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'search', query: 'nginx' })).not.toThrow();
    });

    it('should validate container:pull', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'pull', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:pull with explicit image', () => {
      expect(() => FluxSchema.parse({
        action: 'container',
        subaction: 'pull',
        container_id: 'test',
        image: 'nginx:latest'
      })).not.toThrow();
    });

    it('should validate container:recreate', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'recreate', container_id: 'test' })).not.toThrow();
    });

    it('should validate container:exec', () => {
      expect(() => FluxSchema.parse({
        action: 'container',
        subaction: 'exec',
        container_id: 'test',
        command: 'ls'
      })).not.toThrow();
    });

    it('should validate container:top', () => {
      expect(() => FluxSchema.parse({
        action: 'container',
        subaction: 'top',
        container_id: 'test'
      })).not.toThrow();
    });

    it('should reject container:unpause (replaced by resume)', () => {
      expect(() => FluxSchema.parse({ action: 'container', subaction: 'unpause', container_id: 'test' })).toThrow();
    });
  });

  describe('compose subactions (9)', () => {
    it('should validate compose:list', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'list', host: 'tootie' })).not.toThrow();
    });

    it('should validate compose:status', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'status', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:up', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'up', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:down', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'down', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:restart', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'restart', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:logs', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'logs', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:build', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'build', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:pull', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'pull', host: 'tootie', project: 'myapp' })).not.toThrow();
    });

    it('should validate compose:recreate', () => {
      expect(() => FluxSchema.parse({ action: 'compose', subaction: 'recreate', host: 'tootie', project: 'myapp' })).not.toThrow();
    });
  });

  describe('docker subactions (9)', () => {
    it('should validate docker:info', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'info', host: 'tootie' })).not.toThrow();
    });

    it('should validate docker:df', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'df', host: 'tootie' })).not.toThrow();
    });

    it('should validate docker:prune', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'prune', host: 'tootie', prune_target: 'containers' })).not.toThrow();
    });

    it('should validate docker:images', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'images', host: 'tootie' })).not.toThrow();
    });

    it('should validate docker:pull', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'pull', host: 'tootie', image: 'nginx:latest' })).not.toThrow();
    });

    it('should validate docker:build', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'build', host: 'tootie', context: '/app', tag: 'myimage:latest' })).not.toThrow();
    });

    it('should validate docker:rmi', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'rmi', host: 'tootie', image: 'nginx:latest' })).not.toThrow();
    });

    it('should validate docker:networks', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'networks', host: 'tootie' })).not.toThrow();
    });

    it('should validate docker:volumes', () => {
      expect(() => FluxSchema.parse({ action: 'docker', subaction: 'volumes', host: 'tootie' })).not.toThrow();
    });
  });

  describe('host subactions (7)', () => {
    it('should validate host:status', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'status' })).not.toThrow();
    });

    it('should validate host:resources', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'resources', host: 'tootie' })).not.toThrow();
    });

    it('should validate host:info', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'info', host: 'tootie' })).not.toThrow();
    });

    it('should validate host:uptime', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'uptime', host: 'tootie' })).not.toThrow();
    });

    it('should validate host:services', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'services', host: 'tootie' })).not.toThrow();
    });

    it('should validate host:network', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'network', host: 'tootie' })).not.toThrow();
    });

    it('should validate host:mounts', () => {
      expect(() => FluxSchema.parse({ action: 'host', subaction: 'mounts', host: 'tootie' })).not.toThrow();
    });
  });

  it('should inject action_subaction discriminator via preprocessor', () => {
    const result = FluxSchema.parse({ action: 'container', subaction: 'list' });
    expect((result as Record<string, unknown>).action_subaction).toBe('container:list');
  });
});
