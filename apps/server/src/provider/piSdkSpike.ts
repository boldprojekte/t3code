import { homedir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const PI_PACKAGE_NAME = "@mariozechner/pi-coding-agent";
const DEFAULT_GLOBAL_PI_ENTRY_PATH = path.join(
  homedir(),
  ".npm-global",
  "lib",
  "node_modules",
  PI_PACKAGE_NAME,
  "dist",
  "index.js",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): ReadonlyArray<string> {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function summarizeUnknown(value: unknown): string | null {
  const text = readString(value);
  if (text) {
    return text;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return null;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" && serialized !== "[]"
      ? serialized.length > 240
        ? `${serialized.slice(0, 237)}...`
        : serialized
      : null;
  } catch {
    return null;
  }
}

function isBareModuleSpecifier(specifier: string): boolean {
  return (
    !specifier.startsWith("/") &&
    !specifier.startsWith("./") &&
    !specifier.startsWith("../") &&
    !specifier.includes(":\\")
  );
}

const noop = () => {};

async function importPiModule(specifier: string): Promise<unknown> {
  return isBareModuleSpecifier(specifier)
    ? import(specifier)
    : import(pathToFileURL(specifier).href);
}

export class PiSdkLoadError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "PiSdkLoadError";
  }
}

export class PiSdkShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PiSdkShapeError";
  }
}

interface PiSlashCommandInfo {
  readonly name: string;
  readonly description?: string;
  readonly source?: string;
  readonly sourceInfo?: {
    readonly path?: string;
  };
}

interface PiSessionLike {
  readonly sessionFile?: string;
  readonly sessionId: string;
  bindExtensions(bindings: Record<string, never>): Promise<void>;
  subscribe(listener: (event: unknown) => void): () => void;
  getCommands(): ReadonlyArray<PiSlashCommandInfo>;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
}

interface PiRuntimeLike {
  readonly session: PiSessionLike;
  readonly diagnostics?: ReadonlyArray<unknown>;
  dispose(): Promise<void>;
  setRebindSession?(rebindSession?: (session: PiSessionLike) => Promise<void>): void;
}

interface PiSessionManagerLike {
  readonly getPath?: () => string;
}

interface PiSessionManagerStaticLike {
  create(cwd: string): PiSessionManagerLike;
  open(sessionFile: string): PiSessionManagerLike;
}

interface PiSdkModule {
  getAgentDir(): string;
  SessionManager: PiSessionManagerStaticLike;
  createAgentSessionServices(options: { cwd: string; agentDir: string }): Promise<unknown>;
  createAgentSessionFromServices(options: {
    services: unknown;
    sessionManager: PiSessionManagerLike;
    sessionStartEvent?: unknown;
  }): Promise<{
    session: PiSessionLike;
    diagnostics?: ReadonlyArray<unknown>;
  }>;
  createAgentSessionRuntime(
    createRuntime: (options: {
      cwd: string;
      agentDir: string;
      sessionManager: PiSessionManagerLike;
      sessionStartEvent?: unknown;
    }) => Promise<{
      session: PiSessionLike;
      services: unknown;
      diagnostics: ReadonlyArray<unknown>;
    }>,
    options: {
      cwd: string;
      agentDir: string;
      sessionManager: PiSessionManagerLike;
    },
  ): Promise<PiRuntimeLike>;
}

function assertPiSdkModule(moduleNamespace: unknown): PiSdkModule {
  if (!isRecord(moduleNamespace)) {
    throw new PiSdkShapeError("Pi SDK import did not return a module namespace object.");
  }

  const getAgentDir = moduleNamespace.getAgentDir;
  const sessionManager = moduleNamespace.SessionManager;
  const createAgentSessionServices = moduleNamespace.createAgentSessionServices;
  const createAgentSessionFromServices = moduleNamespace.createAgentSessionFromServices;
  const createAgentSessionRuntime = moduleNamespace.createAgentSessionRuntime;

  if (typeof getAgentDir !== "function") {
    throw new PiSdkShapeError("Pi SDK is missing getAgentDir().");
  }
  if (!isRecord(sessionManager)) {
    throw new PiSdkShapeError("Pi SDK is missing SessionManager.");
  }
  if (typeof sessionManager.create !== "function" || typeof sessionManager.open !== "function") {
    throw new PiSdkShapeError("Pi SDK SessionManager must provide create() and open().");
  }
  if (typeof createAgentSessionServices !== "function") {
    throw new PiSdkShapeError("Pi SDK is missing createAgentSessionServices().");
  }
  if (typeof createAgentSessionFromServices !== "function") {
    throw new PiSdkShapeError("Pi SDK is missing createAgentSessionFromServices().");
  }
  if (typeof createAgentSessionRuntime !== "function") {
    throw new PiSdkShapeError("Pi SDK is missing createAgentSessionRuntime().");
  }

  return {
    getAgentDir: getAgentDir as PiSdkModule["getAgentDir"],
    SessionManager: {
      create: sessionManager.create.bind(sessionManager) as PiSessionManagerStaticLike["create"],
      open: sessionManager.open.bind(sessionManager) as PiSessionManagerStaticLike["open"],
    },
    createAgentSessionServices:
      createAgentSessionServices as PiSdkModule["createAgentSessionServices"],
    createAgentSessionFromServices:
      createAgentSessionFromServices as PiSdkModule["createAgentSessionFromServices"],
    createAgentSessionRuntime:
      createAgentSessionRuntime as PiSdkModule["createAgentSessionRuntime"],
  };
}

export async function resolvePiSdkEntryPath(packageEntryPath?: string): Promise<string> {
  const requestedPath = readString(packageEntryPath);
  if (requestedPath) {
    return requestedPath;
  }

  try {
    return require.resolve(PI_PACKAGE_NAME);
  } catch {
    const envPath = readString(process.env.PI_CODING_AGENT_PACKAGE_PATH);
    if (envPath) {
      return envPath;
    }

    return DEFAULT_GLOBAL_PI_ENTRY_PATH;
  }
}

export async function loadPiSdkModule(options?: {
  packageEntryPath?: string;
  loader?: (specifier: string) => Promise<unknown>;
}): Promise<PiSdkModule> {
  const entryPath = await resolvePiSdkEntryPath(options?.packageEntryPath);
  const loader = options?.loader ?? importPiModule;

  try {
    const moduleNamespace = await loader(entryPath);
    return assertPiSdkModule(moduleNamespace);
  } catch (error) {
    if (error instanceof PiSdkShapeError) {
      throw error;
    }
    throw new PiSdkLoadError(
      `Failed to load Pi SDK from '${entryPath}'. Install '${PI_PACKAGE_NAME}' or set PI_CODING_AGENT_PACKAGE_PATH to a valid dist/index.js.`,
      { cause: error },
    );
  }
}

export type PiDiscoveredCommandSource = "extension" | "prompt" | "skill" | "unknown";

export interface PiDiscoveredCommand {
  readonly name: string;
  readonly description: string | null;
  readonly source: PiDiscoveredCommandSource;
  readonly path: string | null;
}

export type PiSessionSpikeEvent =
  | {
      readonly type: "session.ready";
      readonly cwd: string;
      readonly sessionId: string;
      readonly sessionFile: string | null;
      readonly diagnosticsCount: number;
    }
  | {
      readonly type: "agent.started" | "agent.ended";
    }
  | {
      readonly type: "turn.started" | "turn.ended";
    }
  | {
      readonly type: "assistant.message.started" | "assistant.message.ended";
    }
  | {
      readonly type: "assistant.text.delta";
      readonly delta: string;
    }
  | {
      readonly type: "tool.started" | "tool.updated";
      readonly toolName: string | null;
      readonly toolCallId: string | null;
      readonly summary: string | null;
    }
  | {
      readonly type: "tool.ended";
      readonly toolName: string | null;
      readonly toolCallId: string | null;
      readonly isError: boolean;
      readonly summary: string | null;
    }
  | {
      readonly type: "queue.updated";
      readonly steeringCount: number;
      readonly followUpCount: number;
    }
  | {
      readonly type: "compaction.started";
      readonly reason: string | null;
    }
  | {
      readonly type: "compaction.ended";
      readonly reason: string | null;
      readonly aborted: boolean;
      readonly willRetry: boolean;
      readonly errorMessage: string | null;
    }
  | {
      readonly type: "retry.started";
      readonly attempt: number | null;
      readonly maxAttempts: number | null;
      readonly delayMs: number | null;
      readonly errorMessage: string | null;
    }
  | {
      readonly type: "retry.ended";
      readonly success: boolean;
      readonly attempt: number | null;
      readonly finalError: string | null;
    };

export interface CreatePiSessionSpikeOptions {
  readonly cwd: string;
  readonly agentDir?: string;
  readonly sessionFile?: string;
  readonly packageEntryPath?: string;
  readonly onEvent?: (event: PiSessionSpikeEvent) => void;
  readonly onRawEvent?: (event: unknown) => void;
  readonly sdkLoader?: (specifier: string) => Promise<unknown>;
}

export interface PiSessionSpike {
  readonly cwd: string;
  readonly agentDir: string;
  getSessionInfo(): {
    readonly sessionId: string;
    readonly sessionFile: string | null;
  };
  getRuntimeInfo(): {
    readonly sessionId: string;
    readonly sessionFile: string | null;
    readonly diagnosticsCount: number;
  };
  getCommands(): Promise<ReadonlyArray<PiDiscoveredCommand>>;
  prompt(text: string): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

function normalizeCommandSource(source: string | undefined): PiDiscoveredCommandSource {
  switch (source) {
    case "extension":
    case "prompt":
    case "skill":
      return source;
    default:
      return "unknown";
  }
}

export function normalizePiSlashCommands(
  commands: ReadonlyArray<PiSlashCommandInfo>,
): ReadonlyArray<PiDiscoveredCommand> {
  const normalized = new Map<string, PiDiscoveredCommand>();

  for (const command of commands) {
    const name = readString(command.name);
    if (!name) {
      continue;
    }

    const source = normalizeCommandSource(readString(command.source));
    const key = `${source}:${name}`;
    if (normalized.has(key)) {
      continue;
    }

    normalized.set(key, {
      name,
      source,
      description: readString(command.description) ?? null,
      path: readString(command.sourceInfo?.path) ?? null,
    });
  }

  return [...normalized.values()].toSorted((left, right) =>
    left.source === right.source
      ? left.name.localeCompare(right.name)
      : left.source.localeCompare(right.source),
  );
}

function mapPiSessionEvent(event: unknown): ReadonlyArray<PiSessionSpikeEvent> {
  if (!isRecord(event)) {
    return [];
  }

  const type = readString(event.type);
  if (!type) {
    return [];
  }

  switch (type) {
    case "agent_start":
      return [{ type: "agent.started" }];
    case "agent_end":
      return [{ type: "agent.ended" }];
    case "turn_start":
      return [{ type: "turn.started" }];
    case "turn_end":
      return [{ type: "turn.ended" }];
    case "message_start":
      return [{ type: "assistant.message.started" }];
    case "message_end":
      return [{ type: "assistant.message.ended" }];
    case "message_update": {
      const assistantMessageEvent = isRecord(event.assistantMessageEvent)
        ? event.assistantMessageEvent
        : undefined;
      if (readString(assistantMessageEvent?.type) !== "text_delta") {
        return [];
      }
      const delta = readString(assistantMessageEvent?.delta);
      return delta ? [{ type: "assistant.text.delta", delta }] : [];
    }
    case "tool_execution_start":
      return [
        {
          type: "tool.started",
          toolName: readString(event.toolName) ?? null,
          toolCallId: readString(event.toolCallId) ?? null,
          summary: summarizeUnknown(event.args),
        },
      ];
    case "tool_execution_update":
      return [
        {
          type: "tool.updated",
          toolName: readString(event.toolName) ?? null,
          toolCallId: readString(event.toolCallId) ?? null,
          summary: summarizeUnknown(event.partialResult),
        },
      ];
    case "tool_execution_end":
      return [
        {
          type: "tool.ended",
          toolName: readString(event.toolName) ?? null,
          toolCallId: readString(event.toolCallId) ?? null,
          isError: readBoolean(event.isError) ?? false,
          summary: summarizeUnknown(event.result),
        },
      ];
    case "queue_update":
      return [
        {
          type: "queue.updated",
          steeringCount: readStringArray(event.steering).length,
          followUpCount: readStringArray(event.followUp).length,
        },
      ];
    case "compaction_start":
      return [
        {
          type: "compaction.started",
          reason: readString(event.reason) ?? null,
        },
      ];
    case "compaction_end":
      return [
        {
          type: "compaction.ended",
          reason: readString(event.reason) ?? null,
          aborted: readBoolean(event.aborted) ?? false,
          willRetry: readBoolean(event.willRetry) ?? false,
          errorMessage: readString(event.errorMessage) ?? null,
        },
      ];
    case "auto_retry_start":
      return [
        {
          type: "retry.started",
          attempt: readNumber(event.attempt) ?? null,
          maxAttempts: readNumber(event.maxAttempts) ?? null,
          delayMs: readNumber(event.delayMs) ?? null,
          errorMessage: readString(event.errorMessage) ?? null,
        },
      ];
    case "auto_retry_end":
      return [
        {
          type: "retry.ended",
          success: readBoolean(event.success) ?? false,
          attempt: readNumber(event.attempt) ?? null,
          finalError: readString(event.finalError) ?? null,
        },
      ];
    default:
      return [];
  }
}

export async function createPiSessionSpike(
  options: CreatePiSessionSpikeOptions,
): Promise<PiSessionSpike> {
  const cwd = readString(options.cwd);
  if (!cwd) {
    throw new Error("Pi session spike requires a non-empty cwd.");
  }

  const sdk = await loadPiSdkModule({
    ...(options.packageEntryPath !== undefined
      ? { packageEntryPath: options.packageEntryPath }
      : {}),
    ...(options.sdkLoader !== undefined ? { loader: options.sdkLoader } : {}),
  });

  const agentDir = readString(options.agentDir) ?? sdk.getAgentDir();
  const sessionManager = options.sessionFile
    ? sdk.SessionManager.open(options.sessionFile)
    : sdk.SessionManager.create(cwd);

  const createRuntime = async (input: {
    cwd: string;
    agentDir: string;
    sessionManager: PiSessionManagerLike;
    sessionStartEvent?: unknown;
  }) => {
    const services = await sdk.createAgentSessionServices({
      cwd: input.cwd,
      agentDir: input.agentDir,
    });
    const created = await sdk.createAgentSessionFromServices({
      services,
      sessionManager: input.sessionManager,
      sessionStartEvent: input.sessionStartEvent,
    });

    return {
      ...created,
      services,
      diagnostics: created.diagnostics ?? [],
    };
  };

  const runtime = await sdk.createAgentSessionRuntime(createRuntime, {
    cwd,
    agentDir,
    sessionManager,
  });

  let unsubscribe = noop;

  const bindSession = async (session: PiSessionLike) => {
    unsubscribe();
    await session.bindExtensions({});
    unsubscribe = session.subscribe((event) => {
      options.onRawEvent?.(event);
      for (const mappedEvent of mapPiSessionEvent(event)) {
        options.onEvent?.(mappedEvent);
      }
    });
  };

  await bindSession(runtime.session);
  runtime.setRebindSession?.(bindSession);

  options.onEvent?.({
    type: "session.ready",
    cwd,
    sessionId: runtime.session.sessionId,
    sessionFile: readString(runtime.session.sessionFile) ?? null,
    diagnosticsCount: runtime.diagnostics?.length ?? 0,
  });

  return {
    cwd,
    agentDir,
    getSessionInfo() {
      return {
        sessionId: runtime.session.sessionId,
        sessionFile: readString(runtime.session.sessionFile) ?? null,
      };
    },
    getRuntimeInfo() {
      return {
        sessionId: runtime.session.sessionId,
        sessionFile: readString(runtime.session.sessionFile) ?? null,
        diagnosticsCount: runtime.diagnostics?.length ?? 0,
      };
    },
    async getCommands() {
      return normalizePiSlashCommands(runtime.session.getCommands());
    },
    async prompt(text: string) {
      const promptText = readString(text);
      if (!promptText) {
        throw new Error("Pi session spike prompt text must not be empty.");
      }
      await runtime.session.prompt(promptText);
    },
    async abort() {
      await runtime.session.abort();
    },
    async dispose() {
      unsubscribe();
      await runtime.dispose();
    },
  } satisfies PiSessionSpike;
}
