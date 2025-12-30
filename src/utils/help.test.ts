import { describe, it, expect } from "vitest";
import { z } from "zod";
import { generateHelp, formatHelpMarkdown, formatHelpJson } from "./help.js";
import { UnifiedHomelabSchema } from "../schemas/unified.js";

describe("Help Handler", () => {
  const testSchema = z.discriminatedUnion("action_subaction", [
    z
      .object({
        action_subaction: z.literal("test:echo"),
        action: z.literal("test"),
        subaction: z.literal("echo"),
        message: z.string().describe("Message to echo")
      })
      .describe("Echo a message"),
    z
      .object({
        action_subaction: z.literal("test:ping"),
        action: z.literal("test"),
        subaction: z.literal("ping"),
        host: z.string().describe("Target host")
      })
      .describe("Ping a host")
  ]);

  describe("generateHelp", () => {
    it("should generate help for all actions", () => {
      const help = generateHelp(testSchema);
      expect(help).toHaveLength(2);
      expect(help[0].discriminator).toBe("test:echo");
      expect(help[1].discriminator).toBe("test:ping");
    });

    it("should filter by topic", () => {
      const help = generateHelp(testSchema, "test:echo");
      expect(help).toHaveLength(1);
      expect(help[0].discriminator).toBe("test:echo");
    });

    it("should return empty for unknown topic", () => {
      const help = generateHelp(testSchema, "unknown");
      expect(help).toHaveLength(0);
    });

    it("should unwrap preprocessed schema", () => {
      const preprocessedSchema = z.preprocess((data) => data, testSchema);
      const help = generateHelp(preprocessedSchema);
      expect(help).toHaveLength(2);
    });
  });

  describe("formatHelpMarkdown", () => {
    it("should format all actions as markdown", () => {
      const help = generateHelp(testSchema);
      const md = formatHelpMarkdown(help);
      expect(md).toContain("## test:echo");
      expect(md).toContain("## test:ping");
      expect(md).toContain("**message** (string");
      expect(md).toContain("**host** (string");
      expect(md).toContain("Message to echo");
      expect(md).toContain("Target host");
    });

    it("should format single action as markdown", () => {
      const help = generateHelp(testSchema, "test:echo");
      const md = formatHelpMarkdown(help);
      expect(md).toContain("## test:echo");
      expect(md).not.toContain("test:ping");
    });

    it("should return message when no help available", () => {
      const help = generateHelp(testSchema, "unknown");
      const md = formatHelpMarkdown(help);
      expect(md).toContain("No help available");
    });
  });

  describe("formatHelpJson", () => {
    it("should format as valid JSON", () => {
      const help = generateHelp(testSchema);
      const json = formatHelpJson(help);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].action).toBe("test:echo");
    });

    it("should return empty array JSON for no results", () => {
      const help = generateHelp(testSchema, "unknown");
      const json = formatHelpJson(help);
      const parsed = JSON.parse(json);
      expect(parsed).toHaveLength(0);
    });
  });

  describe("Integration with UnifiedHomelabSchema", () => {
    it("should generate help for all 37 actions", () => {
      const help = generateHelp(UnifiedHomelabSchema);
      // 12 container + 9 compose + 2 host + 3 docker + 4 image + 7 scout = 37
      expect(help.length).toBe(37);
    });

    it("should filter by specific action", () => {
      const help = generateHelp(UnifiedHomelabSchema, "container:list");
      expect(help).toHaveLength(1);
      expect(help[0].discriminator).toBe("container:list");
      // Should have parameters like host, state, name_filter, etc.
      const paramNames = help[0].parameters.map((p) => p.name);
      expect(paramNames).toContain("host");
      expect(paramNames).toContain("state");
    });

    it("should include parameter descriptions from schema", () => {
      const help = generateHelp(UnifiedHomelabSchema, "scout:read");
      expect(help).toHaveLength(1);
      const pathParam = help[0].parameters.find((p) => p.name === "path");
      expect(pathParam).toBeDefined();
      expect(pathParam?.description).toContain("path");
    });
  });
});
