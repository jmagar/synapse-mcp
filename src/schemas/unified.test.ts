import { describe, it, expect } from "vitest";
import { UnifiedHomelabSchema } from "./unified.js";

describe("UnifiedHomelabSchema", () => {
  it("should validate container list action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "list",
      state: "running"
    });
    expect(result.success).toBe(true);
  });

  it("should validate container restart action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "restart",
      container_id: "plex"
    });
    expect(result.success).toBe(true);
  });

  it("should validate compose up action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "compose",
      subaction: "up",
      host: "tootie",
      project: "plex"
    });
    expect(result.success).toBe(true);
  });

  it("should validate host resources action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "host",
      subaction: "resources",
      host: "tootie"
    });
    expect(result.success).toBe(true);
  });

  it("should validate docker prune action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "docker",
      subaction: "prune",
      prune_target: "images",
      force: true
    });
    expect(result.success).toBe(true);
  });

  it("should validate image list action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "image",
      subaction: "list",
      dangling_only: true
    });
    expect(result.success).toBe(true);
  });

  it("should reject invalid action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "invalid",
      subaction: "list"
    });
    expect(result.success).toBe(false);
  });

  it("should reject invalid subaction for action", () => {
    const result = UnifiedHomelabSchema.safeParse({
      action: "container",
      subaction: "up" // up is for compose, not container
    });
    expect(result.success).toBe(false);
  });
});

describe("schema index re-exports", () => {
  it("should export UnifiedHomelabSchema from index.ts", async () => {
    const { UnifiedHomelabSchema: schema } = await import("./index.js");
    expect(schema).toBeDefined();
    expect(typeof schema.parse).toBe("function");
  });

  it("should export individual subaction schemas from index.ts", async () => {
    const schemas = await import("./index.js");

    // Verify key schema exports exist
    expect(schemas.containerListSchema).toBeDefined();
    expect(schemas.composeUpSchema).toBeDefined();
    expect(schemas.hostStatusSchema).toBeDefined();
    expect(schemas.dockerInfoSchema).toBeDefined();
    expect(schemas.imageListSchema).toBeDefined();
  });
});

describe("Discriminated union optimization", () => {
  it("should validate using discriminator key for fast lookup", () => {
    // Test that validation uses discriminated union (O(1) lookup)
    const testCases = [
      { action: "container", subaction: "list" },
      { action: "container", subaction: "start", container_id: "test" },
      { action: "compose", subaction: "up", host: "test", project: "plex" },
      { action: "host", subaction: "status" },
      { action: "docker", subaction: "info" },
      { action: "image", subaction: "list" }
    ];

    for (const testCase of testCases) {
      const result = UnifiedHomelabSchema.safeParse(testCase);
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid action/subaction combinations instantly", () => {
    const invalidCases = [
      { action: "container", subaction: "up" }, // 'up' is compose-only
      { action: "compose", subaction: "restart", host: "test", project: "plex" }, // valid - should pass
      { action: "host", subaction: "list" }, // 'list' not valid for host
      { action: "docker", subaction: "status" }, // 'status' is host-only
      { action: "image", subaction: "logs" } // 'logs' is container-only
    ];

    const result1 = UnifiedHomelabSchema.safeParse(invalidCases[0]);
    expect(result1.success).toBe(false);

    const result2 = UnifiedHomelabSchema.safeParse(invalidCases[1]);
    expect(result2.success).toBe(true);

    const result3 = UnifiedHomelabSchema.safeParse(invalidCases[2]);
    expect(result3.success).toBe(false);

    const result4 = UnifiedHomelabSchema.safeParse(invalidCases[3]);
    expect(result4.success).toBe(false);

    const result5 = UnifiedHomelabSchema.safeParse(invalidCases[4]);
    expect(result5.success).toBe(false);
  });

  it("should preserve type inference after discriminated union migration", () => {
    const valid = UnifiedHomelabSchema.parse({
      action: "container",
      subaction: "restart",
      container_id: "plex"
    });

    // TypeScript should narrow type based on discriminator
    expect(valid.action).toBe("container");
    expect(valid.subaction).toBe("restart");

    if (valid.action === "container" && valid.subaction === "restart") {
      expect(valid.container_id).toBe("plex");
    }
  });
});

describe("Individual schema discriminators", () => {
  it("should have action_subaction discriminator in container schemas", () => {
    const testCases = [
      {
        input: { action: "container", subaction: "list" },
        expected: "container:list"
      },
      {
        input: { action: "container", subaction: "start", container_id: "test" },
        expected: "container:start"
      },
      {
        input: { action: "container", subaction: "restart", container_id: "test" },
        expected: "container:restart"
      }
    ];

    for (const { input, expected } of testCases) {
      const result = UnifiedHomelabSchema.parse(input);
      expect(result.action_subaction).toBe(expected);
    }
  });

  it("should have action_subaction discriminator in compose schemas", () => {
    const result = UnifiedHomelabSchema.parse({
      action: "compose",
      subaction: "up",
      host: "test",
      project: "plex"
    });

    expect(result.action_subaction).toBe("compose:up");
  });

  it("should have action_subaction discriminator in host schemas", () => {
    const result = UnifiedHomelabSchema.parse({
      action: "host",
      subaction: "status"
    });

    expect(result.action_subaction).toBe("host:status");
  });

  it("should have action_subaction discriminator in docker schemas", () => {
    const result = UnifiedHomelabSchema.parse({
      action: "docker",
      subaction: "info"
    });

    expect(result.action_subaction).toBe("docker:info");
  });

  it("should have action_subaction discriminator in image schemas", () => {
    const result = UnifiedHomelabSchema.parse({
      action: "image",
      subaction: "list"
    });

    expect(result.action_subaction).toBe("image:list");
  });
});
