import { describe, it, expect, vi, beforeEach } from "vitest";
import { HostResolver } from "./host-resolver.js";
import type { ComposeDiscoveryService } from "./compose-discovery.js";
import type { HostConfig } from "../types.js";

describe("HostResolver", () => {
	let mockDiscovery: ComposeDiscoveryService;
	let resolver: HostResolver;
	const hosts: HostConfig[] = [
		{ name: "host1", address: "192.168.1.10" },
		{ name: "host2", address: "192.168.1.20" },
	];

	beforeEach(() => {
		mockDiscovery = {
			findProject: vi.fn(),
		} as unknown as ComposeDiscoveryService;
		resolver = new HostResolver(hosts, mockDiscovery);
	});

	describe("resolveHost", () => {
		it("should return specified host if provided", async () => {
			const result = await resolver.resolveHost("myproject", "host1");
			expect(result).toEqual({ name: "host1", address: "192.168.1.10" });
		});

		it("should throw error if specified host not found", async () => {
			await expect(
				resolver.resolveHost("myproject", "nonexistent"),
			).rejects.toThrow('Host "nonexistent" not found in configuration');
		});

		it("should auto-resolve to single matching host", async () => {
			vi.mocked(mockDiscovery.findProject).mockImplementation(
				async (projectName: string, hostName: string) => {
					if (hostName === "host2" && projectName === "myproject") {
						return {
							projectName: "myproject",
							host: "host2",
							composeFiles: ["/opt/myproject/compose.yaml"],
							workingDirectory: "/opt/myproject",
							discoveredAt: new Date().toISOString(),
						};
					}
					throw new Error("Project not found");
				},
			);

			const result = await resolver.resolveHost("myproject");
			expect(result).toEqual({ name: "host2", address: "192.168.1.20" });
		});

		it("should throw error if project found on multiple hosts", async () => {
			vi.mocked(mockDiscovery.findProject).mockResolvedValue({
				projectName: "myproject",
				host: "host1",
				composeFiles: ["/opt/myproject/compose.yaml"],
				workingDirectory: "/opt/myproject",
				discoveredAt: new Date().toISOString(),
			});

			await expect(resolver.resolveHost("myproject")).rejects.toThrow(
				'Project "myproject" found on multiple hosts: host1, host2. Please specify which host to use.',
			);
		});

		it("should throw error if project not found on any host", async () => {
			vi.mocked(mockDiscovery.findProject).mockRejectedValue(
				new Error("Project not found"),
			);

			await expect(resolver.resolveHost("myproject")).rejects.toThrow(
				'Project "myproject" not found on any configured host',
			);
		});

		it("should throw error if no hosts configured", async () => {
			const emptyResolver = new HostResolver([], mockDiscovery);
			await expect(emptyResolver.resolveHost("myproject")).rejects.toThrow(
				"No hosts configured",
			);
		});

		it("should respect timeout during auto-resolution", async () => {
			vi.mocked(mockDiscovery.findProject).mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(
							() =>
								resolve({
									projectName: "myproject",
									host: "host1",
									composeFiles: ["/opt/myproject/compose.yaml"],
									workingDirectory: "/opt/myproject",
									discoveredAt: new Date().toISOString(),
								}),
							35000,
						);
					}),
			);

			await expect(resolver.resolveHost("myproject")).rejects.toThrow(
				"Host resolution timed out after 30000ms",
			);
		}, 35000);
	});
});
