// src/schemas/flux/index.test.ts
import { describe, it, expect } from 'vitest';
import { FluxSchema } from './index.js';

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

  it('should count 35 total subactions (4 not yet implemented)', () => {
    // Access the inner discriminated union options
    // FluxSchema is a pipe, so we need to get the out schema
    // NOTE: 4 subactions removed until handlers implemented:
    //   - container:exec, container:top, docker:networks, docker:volumes
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const innerSchema = (FluxSchema as any)._def.out;
    const options = innerSchema._def?.options;
    expect(options?.length).toBe(35);
  });
});
