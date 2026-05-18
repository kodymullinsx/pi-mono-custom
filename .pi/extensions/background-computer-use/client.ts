import fs from "node:fs/promises";
import { REQUIRED_PHASE1_ROUTES, SUPPORTED_CONTRACT_VERSION, type BcuExtensionConfig, loadConfig } from "./config.ts";

export type JsonObject = Record<string, unknown>;

export interface PermissionStatus {
	granted: boolean;
	promptable?: boolean;
}

export interface RuntimePermissions {
	accessibility: PermissionStatus;
	screenRecording: PermissionStatus;
	checkedAt?: string;
	checkMs?: number;
}

export interface BootstrapInstructions {
	ready: boolean;
	summary?: string;
	agent?: string[];
	user?: string[];
}

export interface BcuRouteSummary {
	id: string;
	method: string;
	path: string;
	url?: string;
	category?: string;
	summary?: string;
}

export interface RuntimeManifest {
	contractVersion: string;
	baseURL: string;
	startedAt?: string;
	permissions?: RuntimePermissions;
	instructions?: BootstrapInstructions;
	routes: BcuRouteSummary[];
}

export interface BootstrapResponse extends JsonObject {
	contractVersion: string;
	baseURL?: string | null;
	startedAt?: string | null;
	permissions: RuntimePermissions;
	instructions: BootstrapInstructions;
	routes: BcuRouteSummary[];
}

export interface RouteCatalogResponse extends JsonObject {
	contractVersion: string;
	routes: BcuRouteSummary[];
}

export type BcuClientErrorCode =
	| "manifest_missing"
	| "manifest_invalid"
	| "base_url_invalid"
	| "base_url_not_loopback"
	| "timeout"
	| "connection_refused"
	| "network_error"
	| "non_json_response"
	| "http_error"
	| "api_error"
	| "unsupported_contract"
	| "missing_routes";

export class BcuClientError extends Error {
	readonly code: BcuClientErrorCode;
	readonly status?: number;
	readonly recovery?: string[];
	readonly details?: JsonObject;

	constructor(
		code: BcuClientErrorCode,
		message: string,
		options: { status?: number; recovery?: string[]; details?: JsonObject; cause?: unknown } = {},
	) {
		super(message, { cause: options.cause });
		this.name = "BcuClientError";
		this.code = code;
		this.status = options.status;
		this.recovery = options.recovery;
		this.details = options.details;
	}
}

export interface RuntimeStatus {
	manifestPath: string;
	configuredManifestPath?: string;
	manifestCandidatePaths?: string[];
	manifest?: RuntimeManifest;
	health?: JsonObject;
	bootstrap?: BootstrapResponse;
	routes?: RouteCatalogResponse;
	errors: BcuClientError[];
	warnings: string[];
	missingRoutes: string[];
	contractSupported: boolean;
}

export interface ManifestLookupResult {
	manifest: RuntimeManifest;
	manifestPath: string;
	configuredManifestPath: string;
	candidatePaths: string[];
	warnings: string[];
}

function isObject(value: unknown): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(source: JsonObject, key: string): string | undefined {
	const value = source[key];
	return typeof value === "string" ? value : undefined;
}

function readBoolean(source: JsonObject, key: string): boolean | undefined {
	const value = source[key];
	return typeof value === "boolean" ? value : undefined;
}

function parsePermissionStatus(value: unknown): PermissionStatus | undefined {
	if (!isObject(value)) return undefined;
	const granted = readBoolean(value, "granted");
	if (granted === undefined) return undefined;
	return {
		granted,
		promptable: readBoolean(value, "promptable"),
	};
}

function parsePermissions(value: unknown): RuntimePermissions | undefined {
	if (!isObject(value)) return undefined;
	const accessibility = parsePermissionStatus(value.accessibility);
	const screenRecording = parsePermissionStatus(value.screenRecording);
	if (!accessibility || !screenRecording) return undefined;
	return {
		accessibility,
		screenRecording,
		checkedAt: readString(value, "checkedAt"),
		checkMs: typeof value.checkMs === "number" ? value.checkMs : undefined,
	};
}

function parseInstructions(value: unknown): BootstrapInstructions | undefined {
	if (!isObject(value)) return undefined;
	const ready = readBoolean(value, "ready");
	if (ready === undefined) return undefined;
	return {
		ready,
		summary: readString(value, "summary"),
		agent: Array.isArray(value.agent) ? value.agent.filter((item): item is string => typeof item === "string") : undefined,
		user: Array.isArray(value.user) ? value.user.filter((item): item is string => typeof item === "string") : undefined,
	};
}

function parseRoute(value: unknown): BcuRouteSummary | undefined {
	if (!isObject(value)) return undefined;
	const id = readString(value, "id");
	const method = readString(value, "method");
	const routePath = readString(value, "path");
	if (!id || !method || !routePath) return undefined;
	return {
		id,
		method: method.toUpperCase(),
		path: routePath,
		url: readString(value, "url"),
		category: readString(value, "category"),
		summary: readString(value, "summary"),
	};
}

function parseRoutes(value: unknown): BcuRouteSummary[] {
	if (!Array.isArray(value)) return [];
	return value.map(parseRoute).filter((route): route is BcuRouteSummary => route !== undefined);
}

function isLoopbackHost(hostname: string): boolean {
	const normalized = hostname.toLowerCase();
	return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1" || normalized === "[::1]";
}

export function validateBaseURL(rawBaseURL: string): string {
	let parsed: URL;
	try {
		parsed = new URL(rawBaseURL);
	} catch (error) {
		throw new BcuClientError("base_url_invalid", `BackgroundComputerUse manifest baseURL is invalid: ${rawBaseURL}`, {
			cause: error,
		});
	}

	if (parsed.protocol !== "http:") {
		throw new BcuClientError("base_url_not_loopback", `BackgroundComputerUse baseURL must use http:, got ${parsed.protocol}`);
	}

	if (!isLoopbackHost(parsed.hostname)) {
		throw new BcuClientError(
			"base_url_not_loopback",
			`BackgroundComputerUse baseURL must be loopback-only, got ${parsed.hostname}.`,
		);
	}

	parsed.pathname = parsed.pathname.replace(/\/+$/, "");
	parsed.search = "";
	parsed.hash = "";
	return parsed.toString().replace(/\/$/, "");
}

export function parseRuntimeManifest(value: unknown): RuntimeManifest {
	if (!isObject(value)) {
		throw new BcuClientError("manifest_invalid", "BackgroundComputerUse runtime manifest is not a JSON object.");
	}

	const contractVersion = readString(value, "contractVersion");
	const baseURL = readString(value, "baseURL");
	if (!contractVersion) {
		throw new BcuClientError("manifest_invalid", "BackgroundComputerUse runtime manifest is missing contractVersion.");
	}
	if (!baseURL) {
		throw new BcuClientError("manifest_invalid", "BackgroundComputerUse runtime manifest is missing baseURL.");
	}

	return {
		contractVersion,
		baseURL: validateBaseURL(baseURL),
		startedAt: readString(value, "startedAt"),
		permissions: parsePermissions(value.permissions),
		instructions: parseInstructions(value.instructions),
		routes: parseRoutes(value.routes),
	};
}

export function parseBootstrapResponse(value: unknown): BootstrapResponse {
	if (!isObject(value)) {
		throw new BcuClientError("non_json_response", "Bootstrap response was not a JSON object.");
	}
	const contractVersion = readString(value, "contractVersion");
	const permissions = parsePermissions(value.permissions);
	const instructions = parseInstructions(value.instructions);
	if (!contractVersion || !permissions || !instructions) {
		throw new BcuClientError("non_json_response", "Bootstrap response did not match the expected contract.");
	}
	return {
		...value,
		contractVersion,
		baseURL: readString(value, "baseURL") ?? null,
		permissions,
		instructions,
		routes: parseRoutes(value.routes),
	};
}

export function parseRouteCatalogResponse(value: unknown): RouteCatalogResponse {
	if (!isObject(value)) {
		throw new BcuClientError("non_json_response", "Route catalog response was not a JSON object.");
	}
	const contractVersion = readString(value, "contractVersion");
	if (!contractVersion) {
		throw new BcuClientError("non_json_response", "Route catalog response is missing contractVersion.");
	}
	return {
		...value,
		contractVersion,
		routes: parseRoutes(value.routes),
	};
}

export function isSupportedContract(contractVersion: string | undefined): boolean {
	return contractVersion === SUPPORTED_CONTRACT_VERSION;
}

export function findMissingPhase1Routes(routes: BcuRouteSummary[]): string[] {
	return REQUIRED_PHASE1_ROUTES.filter((required) => {
		return !routes.some((route) => {
			return (
				route.id === required.id ||
				(route.method.toUpperCase() === required.method && route.path === required.path)
			);
		});
	}).map((route) => `${route.method} ${route.path} (${route.id})`);
}

function classifyFetchError(error: unknown, timedOut: boolean): BcuClientError {
	if (timedOut) {
		return new BcuClientError("timeout", "BackgroundComputerUse request timed out.", { cause: error });
	}

	const cause = error instanceof Error ? error.cause : undefined;
	const code = isObject(cause) && typeof cause.code === "string" ? cause.code : undefined;
	if (code === "ECONNREFUSED") {
		return new BcuClientError("connection_refused", "BackgroundComputerUse refused the connection.", { cause: error });
	}

	return new BcuClientError("network_error", error instanceof Error ? error.message : String(error), { cause: error });
}

async function readJsonResponse(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text.trim().length === 0) return {};
	try {
		return JSON.parse(text) as unknown;
	} catch (error) {
		throw new BcuClientError("non_json_response", `Expected JSON response from BackgroundComputerUse, got ${text.slice(0, 120)}`, {
			status: response.status,
			cause: error,
		});
	}
}

export class BcuClient {
	private readonly config: BcuExtensionConfig;

	constructor(config: BcuExtensionConfig = loadConfig()) {
		this.config = config;
	}

	get manifestPath(): string {
		return this.config.manifestPath;
	}

	get timeoutMs(): number {
		return this.config.timeoutMs;
	}

	private manifestCandidates(): string[] {
		const candidates = this.config.manifestCandidatePaths ?? [this.config.manifestPath];
		return Array.from(new Set([this.config.manifestPath, ...candidates]));
	}

	private manifestRecovery(candidatePaths: string[]): string[] {
		const recovery = [];
		if (this.config.appPath) recovery.push(`Start the installed app: open ${this.config.appPath}`);
		recovery.push(`Check for the runtime manifest at ${candidatePaths.join(" or ")}.`);
		return recovery;
	}

	async readManifestWithMetadata(): Promise<ManifestLookupResult> {
		const candidatePaths = this.manifestCandidates();
		const parseErrors: BcuClientError[] = [];
		const missingErrors: unknown[] = [];

		for (const candidatePath of candidatePaths) {
			let raw: string;
			try {
				raw = await fs.readFile(candidatePath, "utf8");
			} catch (error) {
				missingErrors.push(error);
				continue;
			}

			try {
				const manifest = parseRuntimeManifest(JSON.parse(raw) as unknown);
				const warnings =
					candidatePath === this.config.manifestPath
						? []
						: [`Using fallback manifest ${candidatePath}; configured manifest was ${this.config.manifestPath}.`];
				if (parseErrors.length > 0) {
					warnings.push(
						`Ignored ${parseErrors.length} earlier manifest candidate${parseErrors.length === 1 ? "" : "s"} that could not be used.`,
					);
				}
				return {
					manifest,
					manifestPath: candidatePath,
					configuredManifestPath: this.config.manifestPath,
					candidatePaths,
					warnings,
				};
			} catch (error) {
				if (error instanceof BcuClientError) {
					parseErrors.push(error);
				} else {
					parseErrors.push(
						new BcuClientError("manifest_invalid", `BackgroundComputerUse runtime manifest at ${candidatePath} is invalid JSON.`, {
							cause: error,
						}),
					);
				}
			}
		}

		if (parseErrors.length > 0) {
			const first = parseErrors[0];
			throw new BcuClientError(first.code, first.message, {
				status: first.status,
				recovery: first.recovery ?? this.manifestRecovery(candidatePaths),
				details: first.details,
				cause: first,
			});
		}

		throw new BcuClientError(
			"manifest_missing",
			`BackgroundComputerUse runtime manifest was not found. Tried: ${candidatePaths.join(", ")}.`,
			{ cause: missingErrors[0], recovery: this.manifestRecovery(candidatePaths) },
		);
	}

	async readManifest(): Promise<RuntimeManifest> {
		return (await this.readManifestWithMetadata()).manifest;
	}

	async requestJSON(
		pathname: string,
		options: { method?: "GET" | "POST"; body?: JsonObject; signal?: AbortSignal; allowOkFalse?: boolean } = {},
	) {
		const manifest = await this.readManifest();
		return this.requestJSONWithBaseURL(manifest.baseURL, pathname, options);
	}

	async requestJSONWithBaseURL(
		baseURL: string,
		pathname: string,
		options: { method?: "GET" | "POST"; body?: JsonObject; signal?: AbortSignal; allowOkFalse?: boolean } = {},
	): Promise<unknown> {
		const controller = new AbortController();
		let timedOut = false;
		const timeout = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, this.config.timeoutMs);
		const onAbort = () => controller.abort();
		options.signal?.addEventListener("abort", onAbort, { once: true });

		try {
			const url = new URL(pathname, `${baseURL}/`);
			const response = await fetch(url, {
				method: options.method ?? "GET",
				headers: options.body ? { "content-type": "application/json" } : undefined,
				body: options.body ? JSON.stringify(options.body) : undefined,
				signal: controller.signal,
			});
			const data = await readJsonResponse(response);

			if (!response.ok) {
				const body = isObject(data) ? data : {};
				throw new BcuClientError(
					"http_error",
					readString(body, "message") ?? `BackgroundComputerUse returned HTTP ${response.status}.`,
					{
						status: response.status,
						recovery: Array.isArray(body.recovery)
							? body.recovery.filter((item): item is string => typeof item === "string")
							: undefined,
						details: body,
					},
				);
			}

			if (isObject(data) && data.ok === false && options.allowOkFalse !== true) {
				throw new BcuClientError("api_error", readString(data, "message") ?? "BackgroundComputerUse returned ok=false.", {
					details: data,
				});
			}

			return data;
		} catch (error) {
			if (error instanceof BcuClientError) throw error;
			throw classifyFetchError(error, timedOut);
		} finally {
			clearTimeout(timeout);
			options.signal?.removeEventListener("abort", onAbort);
		}
	}

	async getHealth(signal?: AbortSignal): Promise<JsonObject> {
		const response = await this.requestJSON("/health", { signal });
		return isObject(response) ? response : {};
	}

	async getBootstrap(signal?: AbortSignal): Promise<BootstrapResponse> {
		return parseBootstrapResponse(await this.requestJSON("/v1/bootstrap", { signal }));
	}

	async getRoutes(signal?: AbortSignal): Promise<RouteCatalogResponse> {
		return parseRouteCatalogResponse(await this.requestJSON("/v1/routes", { signal }));
	}

	async postRoute(
		pathname: string,
		body: JsonObject,
		signal?: AbortSignal,
		options: { allowOkFalse?: boolean } = {},
	): Promise<JsonObject> {
		const response = await this.requestJSON(pathname, { method: "POST", body, signal, allowOkFalse: options.allowOkFalse });
		if (!isObject(response)) {
			throw new BcuClientError("non_json_response", `POST ${pathname} did not return a JSON object.`);
		}
		return response;
	}

	async getStatus(signal?: AbortSignal): Promise<RuntimeStatus> {
		const errors: BcuClientError[] = [];
		const warnings: string[] = [];
		let manifest: RuntimeManifest | undefined;
		let health: JsonObject | undefined;
		let bootstrap: BootstrapResponse | undefined;
		let routes: RouteCatalogResponse | undefined;

		let manifestLookup: ManifestLookupResult | undefined;
		try {
			manifestLookup = await this.readManifestWithMetadata();
			manifest = manifestLookup.manifest;
			warnings.push(...manifestLookup.warnings);
		} catch (error) {
			if (error instanceof BcuClientError) errors.push(error);
			else errors.push(new BcuClientError("manifest_invalid", String(error), { cause: error }));
			return {
				manifestPath: this.config.manifestPath,
				configuredManifestPath: this.config.manifestPath,
				manifestCandidatePaths: this.manifestCandidates(),
				errors,
				warnings,
				missingRoutes: REQUIRED_PHASE1_ROUTES.map((route) => `${route.method} ${route.path} (${route.id})`),
				contractSupported: false,
			};
		}

		try {
			health = await this.getHealth(signal);
		} catch (error) {
			errors.push(error instanceof BcuClientError ? error : new BcuClientError("network_error", String(error), { cause: error }));
		}

		try {
			bootstrap = await this.getBootstrap(signal);
		} catch (error) {
			errors.push(error instanceof BcuClientError ? error : new BcuClientError("network_error", String(error), { cause: error }));
		}

		try {
			routes = await this.getRoutes(signal);
		} catch (error) {
			errors.push(error instanceof BcuClientError ? error : new BcuClientError("network_error", String(error), { cause: error }));
		}

		if (bootstrap?.baseURL && bootstrap.baseURL !== manifest.baseURL) {
			warnings.push(`Bootstrap baseURL (${bootstrap.baseURL}) differs from manifest baseURL (${manifest.baseURL}).`);
		}

		const routeSource = routes?.routes.length ? routes.routes : manifest.routes;
		const missingRoutes = findMissingPhase1Routes(routeSource);
		const contractSupported = isSupportedContract(routes?.contractVersion ?? bootstrap?.contractVersion ?? manifest.contractVersion);

		if (!contractSupported) {
			warnings.push(
				`Unsupported BackgroundComputerUse contract: ${routes?.contractVersion ?? bootstrap?.contractVersion ?? manifest.contractVersion}.`,
			);
		}

		if (missingRoutes.length > 0) {
			warnings.push(`Missing required Phase 1 routes: ${missingRoutes.join(", ")}.`);
		}

		return {
			manifestPath: manifestLookup.manifestPath,
			configuredManifestPath: manifestLookup.configuredManifestPath,
			manifestCandidatePaths: manifestLookup.candidatePaths,
			manifest,
			health,
			bootstrap,
			routes,
			errors,
			warnings,
			missingRoutes,
			contractSupported,
		};
	}

	async assertPhase1Ready(signal?: AbortSignal): Promise<{ manifest: RuntimeManifest; bootstrap: BootstrapResponse; routes: RouteCatalogResponse }> {
		const manifest = await this.readManifest();
		const bootstrap = await this.getBootstrap(signal);
		const routes = await this.getRoutes(signal);
		const contractVersion = routes.contractVersion || bootstrap.contractVersion || manifest.contractVersion;
		if (!isSupportedContract(contractVersion)) {
			throw new BcuClientError(
				"unsupported_contract",
				`Unsupported BackgroundComputerUse contract ${contractVersion}; supported contract is ${SUPPORTED_CONTRACT_VERSION}.`,
				{ details: { contractVersion, supportedContractVersion: SUPPORTED_CONTRACT_VERSION } },
			);
		}
		const missingRoutes = findMissingPhase1Routes(routes.routes.length ? routes.routes : manifest.routes);
		if (missingRoutes.length > 0) {
			throw new BcuClientError("missing_routes", `BackgroundComputerUse is missing required routes: ${missingRoutes.join(", ")}`, {
				details: { missingRoutes },
			});
		}
		return { manifest, bootstrap, routes };
	}
}
