import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

describe("Linting Configuration", () => {
  it("eslint.config.js should exist", () => {
    expect(existsSync(join(process.cwd(), "eslint.config.js"))).toBe(true);
  });

  it(".prettierrc.json should exist", () => {
    expect(existsSync(join(process.cwd(), ".prettierrc.json"))).toBe(true);
  });
});

describe("CLAUDE.md", () => {
  it("CLAUDE.md should exist", () => {
    expect(existsSync(join(process.cwd(), "CLAUDE.md"))).toBe(true);
  });

  it("CLAUDE.md should contain required sections", () => {
    const content = readFileSync(join(process.cwd(), "CLAUDE.md"), "utf-8");
    expect(content).toContain("## Commands");
    expect(content).toContain("## Architecture");
    expect(content).toContain("## Code Conventions");
  });
});
