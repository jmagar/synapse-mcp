// src/schemas/flux/container.test.ts
import { describe, it, expect } from 'vitest';
import {
  containerListSchema,
  containerStartSchema,
  containerStopSchema,
  containerRestartSchema,
  containerPauseSchema,
  containerResumeSchema,
  containerLogsSchema,
  containerStatsSchema,
  containerInspectSchema,
  containerSearchSchema,
  containerPullSchema,
  containerRecreateSchema,
  containerExecSchema,
  containerTopSchema
} from './container.js';

describe('Container Schemas', () => {
  describe('containerListSchema', () => {
    it('should validate minimal input', () => {
      const result = containerListSchema.parse({
        action: 'container',
        subaction: 'list'
      });
      expect(result.action_subaction).toBe('container:list');
      expect(result.state).toBe('all');
      expect(result.limit).toBe(20); // Uses DEFAULT_LIMIT from constants.ts
    });

    it('should validate with filters', () => {
      const result = containerListSchema.parse({
        action: 'container',
        subaction: 'list',
        state: 'running',
        name_filter: 'plex',
        host: 'tootie'
      });
      expect(result.state).toBe('running');
      expect(result.name_filter).toBe('plex');
    });
  });

  describe('containerResumeSchema', () => {
    it('should use resume instead of unpause', () => {
      const result = containerResumeSchema.parse({
        action: 'container',
        subaction: 'resume',
        container_id: 'plex'
      });
      expect(result.action_subaction).toBe('container:resume');
      expect(result.subaction).toBe('resume');
    });
  });

  describe('containerLogsSchema', () => {
    it('should validate with time filters', () => {
      const result = containerLogsSchema.parse({
        action: 'container',
        subaction: 'logs',
        container_id: 'nginx',
        since: '1h',
        until: '30m',
        grep: 'error',
        stream: 'stderr'
      });
      expect(result.since).toBe('1h');
      expect(result.stream).toBe('stderr');
    });
  });

  describe('containerExecSchema', () => {
    it('should validate exec with workdir', () => {
      const result = containerExecSchema.parse({
        action: 'container',
        subaction: 'exec',
        container_id: 'app',
        command: 'ls -la',
        user: 'root',
        workdir: '/app'
      });
      expect(result.workdir).toBe('/app');
    });
  });

  describe('containerTopSchema', () => {
    it('should validate top command', () => {
      const result = containerTopSchema.parse({
        action: 'container',
        subaction: 'top',
        container_id: 'plex'
      });
      expect(result.action_subaction).toBe('container:top');
    });
  });
});
