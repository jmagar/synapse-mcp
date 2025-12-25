import { describe, it, expect } from "vitest";
import { addDiscriminator } from "./discriminator.js";

describe("Discriminator transform", () => {
  it("should add composite discriminator key to schema object", () => {
    const input = {
      action: "container",
      subaction: "list",
      state: "running"
    };

    const result = addDiscriminator(input);

    expect(result).toEqual({
      action_subaction: "container:list",
      action: "container",
      subaction: "list",
      state: "running"
    });
  });

  it("should handle all 28 action/subaction combinations", () => {
    const combinations = [
      { action: "container", subaction: "list" },
      { action: "container", subaction: "start" },
      { action: "container", subaction: "stop" },
      { action: "container", subaction: "restart" },
      { action: "container", subaction: "pause" },
      { action: "container", subaction: "unpause" },
      { action: "container", subaction: "logs" },
      { action: "container", subaction: "stats" },
      { action: "container", subaction: "inspect" },
      { action: "container", subaction: "search" },
      { action: "container", subaction: "pull" },
      { action: "container", subaction: "recreate" },
      { action: "compose", subaction: "list" },
      { action: "compose", subaction: "status" },
      { action: "compose", subaction: "up" },
      { action: "compose", subaction: "down" },
      { action: "compose", subaction: "restart" },
      { action: "compose", subaction: "logs" },
      { action: "compose", subaction: "build" },
      { action: "compose", subaction: "recreate" },
      { action: "compose", subaction: "pull" },
      { action: "host", subaction: "status" },
      { action: "host", subaction: "resources" },
      { action: "docker", subaction: "info" },
      { action: "docker", subaction: "df" },
      { action: "docker", subaction: "prune" },
      { action: "image", subaction: "list" },
      { action: "image", subaction: "pull" },
      { action: "image", subaction: "build" },
      { action: "image", subaction: "remove" }
    ];

    for (const combo of combinations) {
      const result = addDiscriminator(combo);
      expect(result.action_subaction).toBe(`${combo.action}:${combo.subaction}`);
    }

    // Verify we have exactly 30 unique discriminators
    const discriminators = new Set(combinations.map(c => `${c.action}:${c.subaction}`));
    expect(discriminators.size).toBe(30);
  });

  it("should override existing action_subaction with computed value", () => {
    const input = {
      action: "container",
      subaction: "list",
      action_subaction: "malicious:override"
    };

    const result = addDiscriminator(input);

    expect(result.action_subaction).toBe("container:list");
  });

  it("should preserve all original fields", () => {
    const input = {
      action: "container",
      subaction: "logs",
      container_id: "plex",
      host: "tootie",
      lines: 100,
      grep: "error"
    };

    const result = addDiscriminator(input);

    expect(result.action).toBe("container");
    expect(result.subaction).toBe("logs");
    expect(result.container_id).toBe("plex");
    expect(result.host).toBe("tootie");
    expect(result.lines).toBe(100);
    expect(result.grep).toBe("error");
  });
});
