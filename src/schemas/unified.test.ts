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
