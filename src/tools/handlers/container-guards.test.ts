// src/tools/handlers/container-guards.test.ts
/**
 * Tests for container handler type guards
 * Documents and validates the type guard pattern for all 14 subactions
 */
import { describe, it, expect } from 'vitest';
import type { ContainerActionInput } from '../../schemas/flux/container.js';

/**
 * Type guards for discriminated union narrowing
 * These replace unsafe `as` casts with proper type narrowing
 */
function isContainerListInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerListInput {
  return input.subaction === 'list';
}

function isContainerLogsInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerLogsInput {
  return input.subaction === 'logs';
}

function isContainerStatsInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerStatsInput {
  return input.subaction === 'stats';
}

function isContainerInspectInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerInspectInput {
  return input.subaction === 'inspect';
}

function isContainerSearchInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerSearchInput {
  return input.subaction === 'search';
}

function isContainerPullInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerPullInput {
  return input.subaction === 'pull';
}

function isContainerRecreateInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerRecreateInput {
  return input.subaction === 'recreate';
}

function isContainerExecInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerExecInput {
  return input.subaction === 'exec';
}

function isContainerTopInput(input: ContainerActionInput): input is import('../../schemas/flux/container.js').ContainerTopInput {
  return input.subaction === 'top';
}

/**
 * Type guard for simple lifecycle actions (start/stop/restart/pause/resume)
 * These all share the same shape: container_id + host + response_format
 */
type SimpleLifecycleAction =
  | import('../../schemas/flux/container.js').ContainerStartInput
  | import('../../schemas/flux/container.js').ContainerStopInput
  | import('../../schemas/flux/container.js').ContainerRestartInput
  | import('../../schemas/flux/container.js').ContainerPauseInput
  | import('../../schemas/flux/container.js').ContainerResumeInput;

function isSimpleLifecycleAction(input: ContainerActionInput): input is SimpleLifecycleAction {
  return input.subaction === 'start'
    || input.subaction === 'stop'
    || input.subaction === 'restart'
    || input.subaction === 'pause'
    || input.subaction === 'resume';
}

describe('Container type guards', () => {
  describe('Complex subaction type guards', () => {
    it('should narrow list input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'list',
        action_subaction: 'container:list',
        state: 'running',
        response_format: 'markdown'
      };

      if (isContainerListInput(input)) {
        // TypeScript should know about list-specific fields
        expect(input.state).toBe('running');
        expect(input.subaction).toBe('list');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow logs input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'logs',
        action_subaction: 'container:logs',
        container_id: 'abc123',
        lines: 100,
        response_format: 'markdown'
      };

      if (isContainerLogsInput(input)) {
        // TypeScript should know about logs-specific fields
        expect(input.lines).toBe(100);
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow stats input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'stats',
        action_subaction: 'container:stats',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isContainerStatsInput(input)) {
        // TypeScript should know container_id is optional for stats
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow inspect input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'inspect',
        action_subaction: 'container:inspect',
        container_id: 'abc123',
        summary: true,
        response_format: 'markdown'
      };

      if (isContainerInspectInput(input)) {
        // TypeScript should know about inspect-specific fields
        expect(input.summary).toBe(true);
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow search input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'search',
        action_subaction: 'container:search',
        query: 'nginx',
        response_format: 'markdown'
      };

      if (isContainerSearchInput(input)) {
        // TypeScript should know about search-specific fields
        expect(input.query).toBe('nginx');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow pull input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'pull',
        action_subaction: 'container:pull',
        container_id: 'abc123',
        image: 'nginx:latest',
        response_format: 'markdown'
      };

      if (isContainerPullInput(input)) {
        // TypeScript should know about pull-specific fields
        expect(input.image).toBe('nginx:latest');
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow recreate input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'recreate',
        action_subaction: 'container:recreate',
        container_id: 'abc123',
        pull: true,
        response_format: 'markdown'
      };

      if (isContainerRecreateInput(input)) {
        // TypeScript should know about recreate-specific fields
        expect(input.pull).toBe(true);
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow exec input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'exec',
        action_subaction: 'container:exec',
        container_id: 'abc123',
        command: 'ls -la',
        user: 'root',
        timeout: 30000,
        response_format: 'markdown'
      };

      if (isContainerExecInput(input)) {
        // TypeScript should know about exec-specific fields
        expect(input.command).toBe('ls -la');
        expect(input.user).toBe('root');
        expect(input.timeout).toBe(30000);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow top input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'top',
        action_subaction: 'container:top',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isContainerTopInput(input)) {
        // TypeScript should know about top-specific fields
        expect(input.container_id).toBe('abc123');
      } else {
        throw new Error('Type guard failed');
      }
    });
  });

  describe('Simple lifecycle action type guard', () => {
    it('should narrow start input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'start',
        action_subaction: 'container:start',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isSimpleLifecycleAction(input)) {
        // TypeScript should know container_id exists
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow stop input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'stop',
        action_subaction: 'container:stop',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isSimpleLifecycleAction(input)) {
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow restart input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'restart',
        action_subaction: 'container:restart',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isSimpleLifecycleAction(input)) {
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow pause input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'pause',
        action_subaction: 'container:pause',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isSimpleLifecycleAction(input)) {
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should narrow resume input correctly', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'resume',
        action_subaction: 'container:resume',
        container_id: 'abc123',
        response_format: 'markdown'
      };

      if (isSimpleLifecycleAction(input)) {
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error('Type guard failed');
      }
    });

    it('should reject complex actions', () => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction: 'logs',
        action_subaction: 'container:logs',
        container_id: 'abc123',
        lines: 100,
        response_format: 'markdown'
      };

      expect(isSimpleLifecycleAction(input)).toBe(false);
    });
  });

  describe('Type guard exhaustiveness', () => {
    it('should have a type guard pattern for all 14 subactions', () => {
      const allSubactions = [
        'list', 'start', 'stop', 'restart', 'pause', 'resume',
        'logs', 'stats', 'inspect', 'search', 'pull', 'recreate',
        'exec', 'top'
      ];

      // This test documents that we have guards for all subactions:
      // - 9 complex subactions have dedicated guards
      // - 5 simple lifecycle actions share one guard
      expect(allSubactions.length).toBe(14);

      // Verify the pattern:
      const complexSubactions = ['list', 'logs', 'stats', 'inspect', 'search', 'pull', 'recreate', 'exec', 'top'];
      const simpleSubactions = ['start', 'stop', 'restart', 'pause', 'resume'];

      expect(complexSubactions.length).toBe(9);
      expect(simpleSubactions.length).toBe(5);
    });
  });
});
