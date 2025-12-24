import { describe, it, expect } from "vitest";
import { composeExec } from "./compose.js";

describe("Compose Security - Integration", () => {
  it("should prevent command injection through entire call chain", async () => {
    const maliciousHost = {
      name: "test-host",
      host: "localhost",
      protocol: "http" as const,
      port: 2375
    };

    // Attempt realistic attack: stop legitimate service, then delete data
    const attackVector = ["down", "-v;", "rm", "-rf", "/var/lib/docker"];

    await expect(
      composeExec(maliciousHost, "production-db", "up", attackVector)
    ).rejects.toThrow(/Invalid character/);

    // Verify error message contains security context
    try {
      await composeExec(maliciousHost, "production-db", "up", attackVector);
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/Invalid character/);
      expect((error as Error).message).toMatch(/-v;/); // Shows which arg failed
    }
  });
});
