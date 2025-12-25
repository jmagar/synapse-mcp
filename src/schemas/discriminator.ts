/**
 * Discriminator transform utilities for O(1) schema lookup
 */

export type DiscriminatedInput = Record<string, unknown> & {
  action: string;
  subaction: string;
  action_subaction?: string;
};

/**
 * Add composite discriminator key to input object
 * Converts { action: "container", subaction: "list" }
 * to { action_subaction: "container:list", action: "container", subaction: "list" }
 */
export function addDiscriminator(input: DiscriminatedInput): DiscriminatedInput {
  return {
    action_subaction: `${input.action}:${input.subaction}`,
    ...input
  };
}

/**
 * Preprocess Zod schema to automatically add discriminator
 * Use with z.preprocess() to transparently transform inputs
 */
export function preprocessWithDiscriminator(input: unknown): unknown {
  if (typeof input === "object" && input !== null && "action" in input && "subaction" in input) {
    return addDiscriminator(input as DiscriminatedInput);
  }
  return input;
}
