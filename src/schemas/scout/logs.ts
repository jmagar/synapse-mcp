// src/schemas/scout/logs.ts
import { z } from 'zod';
import { responseFormatSchema, hostSchema, jsFilterSchema } from '../common.js';
import { DEFAULT_LOG_LINES, MAX_LOG_LINES } from '../../constants.js';

/**
 * Scout logs nested discriminator (4 subactions)
 * Uses standard discriminatedUnion on 'subaction'
 */
export const scoutLogsSchema = z.discriminatedUnion('subaction', [
  z.object({
    action: z.literal('logs'),
    subaction: z.literal('syslog'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: jsFilterSchema.optional(),
    response_format: responseFormatSchema
  }).describe('Access system log files (/var/log)'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('journal'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    since: z.string().optional().describe('ISO 8601 timestamp or relative time'),
    until: z.string().optional(),
    unit: z.string().optional().describe('Systemd unit name to filter'),
    priority: z.enum(['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug']).optional(),
    grep: jsFilterSchema.optional(),
    response_format: responseFormatSchema
  }).describe('Access systemd journal logs'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('dmesg'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: jsFilterSchema.optional(),
    response_format: responseFormatSchema
  }).describe('Access kernel ring buffer logs'),

  z.object({
    action: z.literal('logs'),
    subaction: z.literal('auth'),
    host: hostSchema,
    lines: z.number().int().min(1).max(MAX_LOG_LINES).default(DEFAULT_LOG_LINES),
    grep: jsFilterSchema.optional(),
    response_format: responseFormatSchema
  }).describe('Access authentication logs')
]);
