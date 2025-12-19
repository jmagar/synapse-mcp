import { describe, it, expect } from "vitest";
import { validateProjectName } from "./compose.js";

describe("validateProjectName", () => {
  it("should accept alphanumeric names", () => {
    expect(() => validateProjectName("myproject123")).not.toThrow();
  });

  it("should accept hyphens and underscores", () => {
    expect(() => validateProjectName("my-project_1")).not.toThrow();
  });

  it("should reject empty string", () => {
    expect(() => validateProjectName("")).toThrow("Invalid project name");
  });

  it("should reject special characters", () => {
    expect(() => validateProjectName("project; rm -rf /")).toThrow("Invalid project name");
  });

  it("should reject spaces", () => {
    expect(() => validateProjectName("my project")).toThrow("Invalid project name");
  });

  it("should reject dots", () => {
    expect(() => validateProjectName("my.project")).toThrow("Invalid project name");
  });
});
