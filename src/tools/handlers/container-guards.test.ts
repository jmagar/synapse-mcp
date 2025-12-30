// src/tools/handlers/container-guards.test.ts
/**
 * Tests for container handler type guards
 * Documents and validates the type guard pattern for all 14 subactions
 */
import { describe, it, expect, test } from 'vitest';
import type {
  ContainerActionInput,
  ContainerListInput,
  ContainerLogsInput,
  ContainerStatsInput,
  ContainerInspectInput,
  ContainerSearchInput,
  ContainerPullInput,
  ContainerRecreateInput,
  ContainerExecInput,
  ContainerTopInput,
  ContainerStartInput,
  ContainerStopInput,
  ContainerRestartInput,
  ContainerPauseInput,
  ContainerResumeInput
} from '../../schemas/flux/container.js';

/**
 * Type guards for discriminated union narrowing
 * These replace unsafe `as` casts with proper type narrowing
 */
function isContainerListInput(input: ContainerActionInput): input is ContainerListInput {
  return input.subaction === 'list';
}

function isContainerLogsInput(input: ContainerActionInput): input is ContainerLogsInput {
  return input.subaction === 'logs';
}

function isContainerStatsInput(input: ContainerActionInput): input is ContainerStatsInput {
  return input.subaction === 'stats';
}

function isContainerInspectInput(input: ContainerActionInput): input is ContainerInspectInput {
  return input.subaction === 'inspect';
}

function isContainerSearchInput(input: ContainerActionInput): input is ContainerSearchInput {
  return input.subaction === 'search';
}

function isContainerPullInput(input: ContainerActionInput): input is ContainerPullInput {
  return input.subaction === 'pull';
}

function isContainerRecreateInput(input: ContainerActionInput): input is ContainerRecreateInput {
  return input.subaction === 'recreate';
}

function isContainerExecInput(input: ContainerActionInput): input is ContainerExecInput {
  return input.subaction === 'exec';
}

function isContainerTopInput(input: ContainerActionInput): input is ContainerTopInput {
  return input.subaction === 'top';
}

/**
 * Type guard for simple lifecycle actions (start/stop/restart/pause/resume)
 * These all share the same shape: container_id + host + response_format
 */
type SimpleLifecycleAction =
  | ContainerStartInput
  | ContainerStopInput
  | ContainerRestartInput
  | ContainerPauseInput
  | ContainerResumeInput;

function isSimpleLifecycleAction(input: ContainerActionInput): input is SimpleLifecycleAction {
  const simpleActions = ['start', 'stop', 'restart', 'pause', 'resume'] as const;
  return simpleActions.includes(input.subaction as typeof simpleActions[number]);
}

describe('Container type guards', () => {
  describe('Complex subaction type guards - positive cases', () => {
    test.each([
      {
        name: 'list',
        input: {
          action: 'container' as const,
          subaction: 'list' as const,
          action_subaction: 'container:list' as const,
          state: 'running' as const,
          response_format: 'markdown' as const
        },
        guard: isContainerListInput,
        specificChecks: (input: ContainerListInput): void => {
          expect(input.state).toBe('running');
        }
      },
      {
        name: 'logs',
        input: {
          action: 'container' as const,
          subaction: 'logs' as const,
          action_subaction: 'container:logs' as const,
          container_id: 'abc123',
          lines: 100,
          response_format: 'markdown' as const
        },
        guard: isContainerLogsInput,
        specificChecks: (input: ContainerLogsInput): void => {
          expect(input.lines).toBe(100);
          expect(input.container_id).toBe('abc123');
        }
      },
      {
        name: 'stats',
        input: {
          action: 'container' as const,
          subaction: 'stats' as const,
          action_subaction: 'container:stats' as const,
          container_id: 'abc123',
          response_format: 'markdown' as const
        },
        guard: isContainerStatsInput,
        specificChecks: (input: ContainerStatsInput): void => {
          expect(input.container_id).toBe('abc123');
        }
      },
      {
        name: 'inspect',
        input: {
          action: 'container' as const,
          subaction: 'inspect' as const,
          action_subaction: 'container:inspect' as const,
          container_id: 'abc123',
          summary: true,
          response_format: 'markdown' as const
        },
        guard: isContainerInspectInput,
        specificChecks: (input: ContainerInspectInput): void => {
          expect(input.summary).toBe(true);
          expect(input.container_id).toBe('abc123');
        }
      },
      {
        name: 'search',
        input: {
          action: 'container' as const,
          subaction: 'search' as const,
          action_subaction: 'container:search' as const,
          query: 'nginx',
          response_format: 'markdown' as const
        },
        guard: isContainerSearchInput,
        specificChecks: (input: ContainerSearchInput): void => {
          expect(input.query).toBe('nginx');
        }
      },
      {
        name: 'pull',
        input: {
          action: 'container' as const,
          subaction: 'pull' as const,
          action_subaction: 'container:pull' as const,
          container_id: 'abc123',
          image: 'nginx:latest',
          response_format: 'markdown' as const
        },
        guard: isContainerPullInput,
        specificChecks: (input: ContainerPullInput): void => {
          expect(input.image).toBe('nginx:latest');
          expect(input.container_id).toBe('abc123');
        }
      },
      {
        name: 'recreate',
        input: {
          action: 'container' as const,
          subaction: 'recreate' as const,
          action_subaction: 'container:recreate' as const,
          container_id: 'abc123',
          pull: true,
          response_format: 'markdown' as const
        },
        guard: isContainerRecreateInput,
        specificChecks: (input: ContainerRecreateInput): void => {
          expect(input.pull).toBe(true);
          expect(input.container_id).toBe('abc123');
        }
      },
      {
        name: 'exec',
        input: {
          action: 'container' as const,
          subaction: 'exec' as const,
          action_subaction: 'container:exec' as const,
          container_id: 'abc123',
          command: 'ls -la',
          user: 'root',
          timeout: 30000,
          response_format: 'markdown' as const
        },
        guard: isContainerExecInput,
        specificChecks: (input: ContainerExecInput): void => {
          expect(input.command).toBe('ls -la');
          expect(input.user).toBe('root');
          expect(input.timeout).toBe(30000);
        }
      },
      {
        name: 'top',
        input: {
          action: 'container' as const,
          subaction: 'top' as const,
          action_subaction: 'container:top' as const,
          container_id: 'abc123',
          response_format: 'markdown' as const
        },
        guard: isContainerTopInput,
        specificChecks: (input: ContainerTopInput): void => {
          expect(input.container_id).toBe('abc123');
        }
      }
    ])('should narrow $name input correctly', ({ name, input, guard, specificChecks }) => {
      if (guard(input as ContainerActionInput)) {
        // Type is narrowed by guard, but we need to cast for the generic test function
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        specificChecks(input as any);
        expect(input.subaction).toBe(name);
      } else {
        throw new Error(`Type guard failed for ${name}`);
      }
    });
  });

  describe('Complex subaction type guards - negative cases', () => {
    test.each([
      {
        guardName: 'isContainerListInput',
        guard: isContainerListInput,
        wrongSubaction: 'logs',
        input: {
          action: 'container' as const,
          subaction: 'logs' as const,
          action_subaction: 'container:logs' as const,
          container_id: 'abc123',
          lines: 100,
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerLogsInput',
        guard: isContainerLogsInput,
        wrongSubaction: 'list',
        input: {
          action: 'container' as const,
          subaction: 'list' as const,
          action_subaction: 'container:list' as const,
          state: 'running' as const,
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerStatsInput',
        guard: isContainerStatsInput,
        wrongSubaction: 'inspect',
        input: {
          action: 'container' as const,
          subaction: 'inspect' as const,
          action_subaction: 'container:inspect' as const,
          container_id: 'abc123',
          summary: true,
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerInspectInput',
        guard: isContainerInspectInput,
        wrongSubaction: 'stats',
        input: {
          action: 'container' as const,
          subaction: 'stats' as const,
          action_subaction: 'container:stats' as const,
          container_id: 'abc123',
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerSearchInput',
        guard: isContainerSearchInput,
        wrongSubaction: 'pull',
        input: {
          action: 'container' as const,
          subaction: 'pull' as const,
          action_subaction: 'container:pull' as const,
          container_id: 'abc123',
          image: 'nginx:latest',
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerPullInput',
        guard: isContainerPullInput,
        wrongSubaction: 'search',
        input: {
          action: 'container' as const,
          subaction: 'search' as const,
          action_subaction: 'container:search' as const,
          query: 'nginx',
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerRecreateInput',
        guard: isContainerRecreateInput,
        wrongSubaction: 'exec',
        input: {
          action: 'container' as const,
          subaction: 'exec' as const,
          action_subaction: 'container:exec' as const,
          container_id: 'abc123',
          command: 'ls -la',
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerExecInput',
        guard: isContainerExecInput,
        wrongSubaction: 'top',
        input: {
          action: 'container' as const,
          subaction: 'top' as const,
          action_subaction: 'container:top' as const,
          container_id: 'abc123',
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isContainerTopInput',
        guard: isContainerTopInput,
        wrongSubaction: 'recreate',
        input: {
          action: 'container' as const,
          subaction: 'recreate' as const,
          action_subaction: 'container:recreate' as const,
          container_id: 'abc123',
          pull: true,
          response_format: 'markdown' as const
        }
      },
      {
        guardName: 'isSimpleLifecycleAction',
        guard: isSimpleLifecycleAction,
        wrongSubaction: 'logs',
        input: {
          action: 'container' as const,
          subaction: 'logs' as const,
          action_subaction: 'container:logs' as const,
          container_id: 'abc123',
          lines: 100,
          response_format: 'markdown' as const
        }
      }
    ])('$guardName should reject $wrongSubaction', ({ guard, input }) => {
      expect(guard(input as ContainerActionInput)).toBe(false);
    });
  });

  describe('Simple lifecycle action type guard - positive cases', () => {
    test.each([
      { subaction: 'start', action_subaction: 'container:start' },
      { subaction: 'stop', action_subaction: 'container:stop' },
      { subaction: 'restart', action_subaction: 'container:restart' },
      { subaction: 'pause', action_subaction: 'container:pause' },
      { subaction: 'resume', action_subaction: 'container:resume' }
    ])('should narrow $subaction input correctly', ({ subaction, action_subaction }) => {
      const input: ContainerActionInput = {
        action: 'container',
        subaction,
        action_subaction,
        container_id: 'abc123',
        response_format: 'markdown'
      } as ContainerActionInput;

      if (isSimpleLifecycleAction(input)) {
        expect(input.container_id).toBe('abc123');
        expect(['start', 'stop', 'restart', 'pause', 'resume']).toContain(input.subaction);
      } else {
        throw new Error(`Type guard failed for ${subaction}`);
      }
    });
  });

  describe('Type guard exhaustiveness', () => {
    it('should recognize all 14 subactions with appropriate type guards', () => {
      const allSubactions = [
        'list', 'start', 'stop', 'restart', 'pause', 'resume',
        'logs', 'stats', 'inspect', 'search', 'pull', 'recreate',
        'exec', 'top'
      ];

      // Define test inputs for each subaction
      const testInputs: Record<string, ContainerActionInput> = {
        list: {
          action: 'container',
          subaction: 'list',
          action_subaction: 'container:list',
          state: 'running',
          response_format: 'markdown'
        },
        start: {
          action: 'container',
          subaction: 'start',
          action_subaction: 'container:start',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        stop: {
          action: 'container',
          subaction: 'stop',
          action_subaction: 'container:stop',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        restart: {
          action: 'container',
          subaction: 'restart',
          action_subaction: 'container:restart',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        pause: {
          action: 'container',
          subaction: 'pause',
          action_subaction: 'container:pause',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        resume: {
          action: 'container',
          subaction: 'resume',
          action_subaction: 'container:resume',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        logs: {
          action: 'container',
          subaction: 'logs',
          action_subaction: 'container:logs',
          container_id: 'abc123',
          lines: 100,
          response_format: 'markdown'
        },
        stats: {
          action: 'container',
          subaction: 'stats',
          action_subaction: 'container:stats',
          container_id: 'abc123',
          response_format: 'markdown'
        },
        inspect: {
          action: 'container',
          subaction: 'inspect',
          action_subaction: 'container:inspect',
          container_id: 'abc123',
          summary: true,
          response_format: 'markdown'
        },
        search: {
          action: 'container',
          subaction: 'search',
          action_subaction: 'container:search',
          query: 'nginx',
          response_format: 'markdown'
        },
        pull: {
          action: 'container',
          subaction: 'pull',
          action_subaction: 'container:pull',
          container_id: 'abc123',
          image: 'nginx:latest',
          response_format: 'markdown'
        },
        recreate: {
          action: 'container',
          subaction: 'recreate',
          action_subaction: 'container:recreate',
          container_id: 'abc123',
          pull: true,
          response_format: 'markdown'
        },
        exec: {
          action: 'container',
          subaction: 'exec',
          action_subaction: 'container:exec',
          container_id: 'abc123',
          command: 'ls -la',
          response_format: 'markdown'
        },
        top: {
          action: 'container',
          subaction: 'top',
          action_subaction: 'container:top',
          container_id: 'abc123',
          response_format: 'markdown'
        }
      } as const;

      // Map of complex guards
      const complexGuards: Record<string, (input: ContainerActionInput) => boolean> = {
        list: isContainerListInput,
        logs: isContainerLogsInput,
        stats: isContainerStatsInput,
        inspect: isContainerInspectInput,
        search: isContainerSearchInput,
        pull: isContainerPullInput,
        recreate: isContainerRecreateInput,
        exec: isContainerExecInput,
        top: isContainerTopInput
      };

      // Verify each subaction is recognized by at least one type guard
      for (const subaction of allSubactions) {
        const input = testInputs[subaction];
        const complexGuard = complexGuards[subaction];
        const isRecognized = complexGuard
          ? complexGuard(input)
          : isSimpleLifecycleAction(input);

        if (!isRecognized) {
          throw new Error(`Subaction '${subaction}' not recognized by any type guard`);
        }
      }

      // Verify the totals match expected pattern:
      // - 9 complex subactions have dedicated guards
      // - 5 simple lifecycle actions share one guard
      const complexSubactions = Object.keys(complexGuards);
      const simpleSubactions = ['start', 'stop', 'restart', 'pause', 'resume'];

      expect(complexSubactions.length).toBe(9);
      expect(simpleSubactions.length).toBe(5);
      expect(allSubactions.length).toBe(14);
    });
  });
});
