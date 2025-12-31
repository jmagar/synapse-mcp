import type { HostConfig } from "../types.js";
import type { ComposeDiscovery } from "./compose-discovery.js";

/**
 * Timeout for host resolution operations (30 seconds)
 */
const RESOLUTION_TIMEOUT_MS = 30000;

/**
 * Error thrown when host resolution fails
 */
export class HostResolutionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "HostResolutionError";
	}
}

/**
 * Resolves which host contains a compose project when not explicitly specified
 */
export class HostResolver {
	constructor(
		private readonly discovery: ComposeDiscovery,
		private readonly hosts: HostConfig[],
	) {}

	/**
	 * Resolve which host to use for a compose operation
	 *
	 * @param projectName - Name of the compose project
	 * @param specifiedHost - Optional host name explicitly provided by user
	 * @returns The resolved host configuration
	 * @throws {HostResolutionError} If resolution fails
	 */
	async resolveHost(
		projectName: string,
		specifiedHost?: string,
	): Promise<HostConfig> {
		// If host is specified, validate and return it
		if (specifiedHost) {
			const host = this.hosts.find((h) => h.name === specifiedHost);
			if (!host) {
				throw new HostResolutionError(
					`Host "${specifiedHost}" not found in configuration`,
				);
			}
			return host;
		}

		// Auto-resolve: check all hosts in parallel
		if (this.hosts.length === 0) {
			throw new HostResolutionError("No hosts configured");
		}

		const matchingHosts = await this.findMatchingHosts(projectName);

		if (matchingHosts.length === 0) {
			throw new HostResolutionError(
				`Project "${projectName}" not found on any configured host`,
			);
		}

		if (matchingHosts.length > 1) {
			const hostNames = matchingHosts.map((h) => h.name).join(", ");
			throw new HostResolutionError(
				`Project "${projectName}" found on multiple hosts: ${hostNames}. Please specify which host to use.`,
			);
		}

		return matchingHosts[0];
	}

	/**
	 * Find all hosts that contain the specified project
	 */
	private async findMatchingHosts(projectName: string): Promise<HostConfig[]> {
		const checkPromise = this.checkAllHosts(projectName);
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => {
				reject(
					new HostResolutionError(
						`Host resolution timed out after ${RESOLUTION_TIMEOUT_MS}ms`,
					),
				);
			}, RESOLUTION_TIMEOUT_MS);
		});

		return Promise.race([checkPromise, timeoutPromise]);
	}

	/**
	 * Check all hosts in parallel for the project
	 */
	private async checkAllHosts(projectName: string): Promise<HostConfig[]> {
		const checks = this.hosts.map(async (host) => {
			try {
				await this.discovery.resolveProjectPath(host, projectName);
				return host;
			} catch {
				return null;
			}
		});

		const results = await Promise.allSettled(checks);
		const matchingHosts: HostConfig[] = [];

		for (const result of results) {
			if (result.status === "fulfilled" && result.value !== null) {
				matchingHosts.push(result.value);
			}
		}

		return matchingHosts;
	}
}
