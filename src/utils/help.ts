/**
 * Help Handler - Auto-generate documentation from Zod discriminated union schemas
 *
 * Provides schema introspection to generate help text for MCP tools.
 * Supports schemas wrapped in z.preprocess() for backward compatibility
 * with composite discriminator patterns.
 *
 * NOTE: This module accesses Zod internal implementation details (_def, options, etc.)
 * which are not part of the public API. When upgrading Zod:
 * 1. Run full test suite to verify help generation still works
 * 2. Check Zod changelog for changes to internal structure
 * 3. Update this module if internal structure changes
 */

import { z } from "zod";

export interface HelpEntry {
  discriminator: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    required: boolean;
    default?: unknown;
  }>;
}

/**
 * JSON output format for help entries
 */
export interface HelpJsonEntry {
  action: string;
  description: string;
  parameters: Array<{
    name: string;
    type: string;
    description?: string;
    required: boolean;
    default?: unknown;
  }>;
}

/**
 * Internal Zod definition structure (not part of public API)
 * Used for schema introspection
 */
interface ZodInternalDef {
  type?: string;
  out?: z.ZodTypeAny;
  innerType?: z.ZodTypeAny;
  options?: z.ZodTypeAny[];
  values?: unknown[];
  defaultValue?: unknown;
}

/**
 * Safely access _def from a Zod schema
 */
function getDef(schema: z.ZodTypeAny): ZodInternalDef {
  return (schema as unknown as { _def: ZodInternalDef })._def ?? {};
}

/**
 * Unwrap z.preprocess wrapper to access inner discriminated union schema
 *
 * In Zod 4.x, z.preprocess() creates a pipe with:
 * - _def.type === 'pipe'
 * - _def.out containing the inner schema
 */
function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  const def = getDef(schema);

  // Check if schema is wrapped in z.preprocess (Zod 4.x uses pipe internally)
  if (def.type === "pipe" && def.out) {
    return def.out;
  }
  // Zod 3.x compatibility: check for innerType
  if (def.innerType) {
    return def.innerType;
  }
  return schema;
}

/**
 * Get the base type name from a potentially wrapped Zod schema
 *
 * Handles default(), optional(), nullable() wrapping to get the underlying type.
 */
function getBaseTypeName(schema: z.ZodTypeAny): string {
  const def = getDef(schema);

  // Handle wrapped types: default, optional, nullable, etc.
  if (def.innerType) {
    return getBaseTypeName(def.innerType);
  }

  // Handle union type
  if (def.type === "union" && def.options) {
    const types = def.options.map((opt) => getBaseTypeName(opt));
    return types.join(" | ");
  }

  // Handle enum type
  if (def.type === "enum" && def.values) {
    return (def.values as string[]).map((v) => `"${v}"`).join(" | ");
  }

  // Handle native enum
  if (def.type === "enum" || def.type === "nativeEnum") {
    return "enum";
  }

  // Return the base type
  return def.type ?? "unknown";
}

/**
 * Get default value from a schema if present
 */
function getDefaultValue(schema: z.ZodTypeAny): unknown | undefined {
  const def = getDef(schema);

  if (def.type === "default" && def.defaultValue !== undefined) {
    try {
      // defaultValue is a getter function in Zod 4.x
      return typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    } catch {
      return undefined;
    }
  }

  return undefined;
}

/**
 * Get options from a discriminated union schema
 */
function getOptions(schema: z.ZodTypeAny): z.ZodTypeAny[] | undefined {
  // Try direct access (Zod 4.x)
  const directOptions = (schema as unknown as { options?: z.ZodTypeAny[] }).options;
  if (directOptions) {
    return directOptions;
  }

  // Try via _def
  const def = getDef(schema);
  return def.options;
}

/**
 * Generate help documentation from discriminated union schema
 *
 * Handles schemas wrapped in z.preprocess() by unwrapping to access
 * the inner discriminated union.
 *
 * @param schema - A Zod discriminated union schema (optionally wrapped in preprocess)
 * @param topic - Optional discriminator value to filter results
 * @returns Array of help entries for matching actions
 */
export function generateHelp(schema: z.ZodTypeAny, topic?: string): HelpEntry[] {
  // Unwrap z.preprocess if present
  const actualSchema = unwrapSchema(schema);

  // Access options from discriminated union
  const options = getOptions(actualSchema);

  if (!options || !Array.isArray(options)) {
    throw new Error("Schema is not a discriminated union");
  }

  const entries: HelpEntry[] = options.map((option) => {
    // Access shape from ZodObject
    const shape = (option as unknown as { shape: Record<string, z.ZodTypeAny> }).shape;

    if (!shape) {
      throw new Error("Schema option is not a ZodObject");
    }

    // Find the discriminator key (the first literal field)
    let discriminatorValue: string | undefined;
    for (const key of Object.keys(shape)) {
      const fieldSchema = shape[key];
      const fieldDef = getDef(fieldSchema);
      // In Zod 4.x, literals use _def.values array
      if (fieldDef.type === "literal" && fieldDef.values) {
        discriminatorValue = fieldDef.values[0] as string;
        break;
      }
    }

    if (!discriminatorValue) {
      throw new Error("Schema option missing discriminator literal");
    }

    // Extract parameters (excluding discriminator fields)
    const parameters = Object.entries(shape)
      .filter(
        ([key]) =>
          // Skip discriminator-related fields
          key !== "action_subaction" && key !== "action" && key !== "subaction"
      )
      .map(([name, fieldSchema]) => {
        return {
          name,
          type: getBaseTypeName(fieldSchema),
          description: fieldSchema.description,
          required: !fieldSchema.isOptional(),
          default: getDefaultValue(fieldSchema)
        };
      });

    return {
      discriminator: discriminatorValue,
      description: option.description ?? "",
      parameters
    };
  });

  // Filter by topic if provided
  if (topic) {
    return entries.filter((e) => e.discriminator === topic);
  }

  return entries;
}

/**
 * Format help entries as markdown
 *
 * @param entries - Array of help entries from generateHelp
 * @returns Formatted markdown string
 */
export function formatHelpMarkdown(entries: HelpEntry[]): string {
  if (entries.length === 0) {
    return "No help available for the specified topic.";
  }

  return entries
    .map((entry) => {
      let md = `## ${entry.discriminator}\n\n`;

      if (entry.description) {
        md += `${entry.description}\n\n`;
      }

      if (entry.parameters.length > 0) {
        md += "**Parameters:**\n\n";
        entry.parameters.forEach((param) => {
          const required = param.required ? " (required)" : " (optional)";
          const defaultVal =
            param.default !== undefined ? `, default: ${JSON.stringify(param.default)}` : "";
          md += `- **${param.name}** (${param.type}${required}${defaultVal})`;
          if (param.description) {
            md += ` - ${param.description}`;
          }
          md += "\n";
        });
      }

      return md;
    })
    .join("\n---\n\n");
}

/**
 * Format help entries as JSON
 *
 * Uses 'action' as the key name in output for consistency with tool parameters.
 *
 * @param entries - Array of help entries from generateHelp
 * @returns JSON string
 */
export function formatHelpJson(entries: HelpEntry[]): string {
  const jsonEntries: HelpJsonEntry[] = entries.map((entry) => ({
    action: entry.discriminator,
    description: entry.description,
    parameters: entry.parameters
  }));

  return JSON.stringify(jsonEntries, null, 2);
}
