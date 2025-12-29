import { describe, it, expect } from "vitest";
import {
  DEFAULT_MAX_FILE_SIZE,
  MAX_FILE_SIZE_LIMIT,
  DEFAULT_COMMAND_TIMEOUT,
  MAX_COMMAND_TIMEOUT,
  DEFAULT_TREE_DEPTH,
  MAX_TREE_DEPTH,
  DEFAULT_FIND_LIMIT,
  MAX_FIND_LIMIT,
  ALLOWED_COMMANDS
} from "./constants.js";

describe("scout constants", () => {
  it("defines DEFAULT_MAX_FILE_SIZE as 1MB", () => {
    expect(DEFAULT_MAX_FILE_SIZE).toBe(1048576);
  });

  it("defines MAX_FILE_SIZE_LIMIT as 10MB", () => {
    expect(MAX_FILE_SIZE_LIMIT).toBe(10485760);
  });

  it("defines DEFAULT_COMMAND_TIMEOUT as 30 seconds", () => {
    expect(DEFAULT_COMMAND_TIMEOUT).toBe(30000);
  });

  it("defines MAX_COMMAND_TIMEOUT as 300 seconds", () => {
    expect(MAX_COMMAND_TIMEOUT).toBe(300000);
  });

  it("defines DEFAULT_TREE_DEPTH as 3", () => {
    expect(DEFAULT_TREE_DEPTH).toBe(3);
  });

  it("defines MAX_TREE_DEPTH as 10", () => {
    expect(MAX_TREE_DEPTH).toBe(10);
  });

  it("defines DEFAULT_FIND_LIMIT as 100", () => {
    expect(DEFAULT_FIND_LIMIT).toBe(100);
  });

  it("defines MAX_FIND_LIMIT as 1000", () => {
    expect(MAX_FIND_LIMIT).toBe(1000);
  });

  it("ALLOWED_COMMANDS contains safe read-only commands", () => {
    expect(ALLOWED_COMMANDS.has("cat")).toBe(true);
    expect(ALLOWED_COMMANDS.has("ls")).toBe(true);
    expect(ALLOWED_COMMANDS.has("grep")).toBe(true);
    expect(ALLOWED_COMMANDS.has("find")).toBe(true);
    expect(ALLOWED_COMMANDS.has("tree")).toBe(true);
    expect(ALLOWED_COMMANDS.has("head")).toBe(true);
    expect(ALLOWED_COMMANDS.has("tail")).toBe(true);
  });

  it("ALLOWED_COMMANDS does not contain dangerous commands", () => {
    expect(ALLOWED_COMMANDS.has("rm")).toBe(false);
    expect(ALLOWED_COMMANDS.has("mv")).toBe(false);
    expect(ALLOWED_COMMANDS.has("chmod")).toBe(false);
    expect(ALLOWED_COMMANDS.has("wget")).toBe(false);
    expect(ALLOWED_COMMANDS.has("curl")).toBe(false);
    expect(ALLOWED_COMMANDS.has("bash")).toBe(false);
  });
});
