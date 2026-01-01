import { describe, it, expect } from "vitest";
import { z } from "zod";
import { generateHelp, formatHelpMarkdown, formatHelpJson } from "./help.js";
import { FluxSchema } from "../schemas/flux/index.js";
import { ScoutSchema } from "../schemas/scout/index.js";

const EXPECTED_FLUX_ACTION_COUNT = 43; // 14 container + 10 compose + 9 docker + 9 host = 42 (host has 9: status, resources, info, uptime, services, network, mounts, ports, doctor) + 1 help = 43
const EXPECTED_SCOUT_ACTION_COUNT = 17; // 1 help + 9 simple + 3 zfs subactions + 4 logs subactions

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

  describe("Integration with FluxSchema", () => {
    it("should generate help for all 43 flux actions", () => {
      const help = generateHelp(FluxSchema);
      // 1 help + 14 container + 9 compose + 9 docker + 9 host (including ports, doctor)
      expect(help.length).toBe(EXPECTED_FLUX_ACTION_COUNT);
    });

    it("should filter by specific action", () => {
      const help = generateHelp(FluxSchema, "container:list");
      expect(help).toHaveLength(1);
      expect(help[0].discriminator).toBe("container:list");
      // Should have parameters like host, state, name_filter, etc.
      const paramNames = help[0].parameters.map((p) => p.name);
      expect(paramNames).toContain("host");
      expect(paramNames).toContain("state");
    });
  });

  describe("Integration with ScoutSchema", () => {
    it("should generate help for all 17 scout actions (1 help + 9 simple + 3 zfs + 4 logs)", () => {
      const help = generateHelp(ScoutSchema);
      // 1 help + 9 simple + 3 zfs subactions + 4 logs subactions = 17
      expect(help.length).toBe(EXPECTED_SCOUT_ACTION_COUNT);
    });

    it("should filter by nested action with subaction", () => {
      const help = generateHelp(ScoutSchema, "zfs:pools");
      expect(help).toHaveLength(1);
      expect(help[0].discriminator).toBe("zfs:pools");
    });

    it("should include parameter descriptions from schema", () => {
      const help = generateHelp(ScoutSchema, "peek");
      expect(help).toHaveLength(1);
      const targetParam = help[0].parameters.find((p) => p.name === "target");
      expect(targetParam).toBeDefined();
    });
  });
});
