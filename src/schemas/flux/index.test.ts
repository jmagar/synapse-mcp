// src/schemas/flux/index.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema, FLUX_SUBACTION_COUNT } from './index.js';

describe('FluxSchema', () => {
  it('should validate container:list', () => {
    const result = FluxSchema.parse({
      action: 'container',
      subaction: 'list'
    });
    expect(result.action_subaction).toBe('container:list');
  });

  it('should validate container:resume', () => {
    const result = FluxSchema.parse({
      action: 'container',
      subaction: 'resume',
      container_id: 'plex'
    });
    expect(result.action_subaction).toBe('container:resume');
  });

  it('should validate compose:up', () => {
    const result = FluxSchema.parse({
      action: 'compose',
      subaction: 'up',
      host: 'tootie',
      project: 'plex'
    });
    expect(result.action_subaction).toBe('compose:up');
  });

  it('should validate docker:images', () => {
    const result = FluxSchema.parse({
      action: 'docker',
      subaction: 'images',
      host: 'tootie'
    });
    expect(result.action_subaction).toBe('docker:images');
  });

  it('should validate host:services', () => {
    const result = FluxSchema.parse({
      action: 'host',
      subaction: 'services',
      host: 'tootie',
      service: 'docker'
    });
    expect(result.action_subaction).toBe('host:services');
  });

  it('should reject host:services with invalid service name', () => {
    expect(() => FluxSchema.parse({
      action: 'host',
      subaction: 'services',
      host: 'tootie',
      service: 'docker service'
    })).toThrow(/service/i);
  });

  it('should reject invalid action', () => {
    expect(() => FluxSchema.parse({
      action: 'invalid',
      subaction: 'list'
    })).toThrow();
  });

  it('should reject unpause (replaced by resume)', () => {
    expect(() => FluxSchema.parse({
      action: 'container',
      subaction: 'unpause',
      container_id: 'plex'
    })).toThrow();
  });

  it('should count 39 total subactions', () => {
    // Use exported constant instead of accessing Zod internals
    expect(FLUX_SUBACTION_COUNT).toBe(39);
  });

  it('should successfully unwrap preprocessed schemas', () => {
    // This test ensures the unwrapPreprocess function works correctly
    // If it fails, the discriminated union won't be able to parse schemas
    const validInputs = [
      { action: 'container', subaction: 'list' },
      { action: 'compose', subaction: 'list', host: 'tootie' },
      { action: 'docker', subaction: 'info', host: 'tootie' },
      { action: 'host', subaction: 'status' }
    ];

    for (const input of validInputs) {
      const result = FluxSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});
