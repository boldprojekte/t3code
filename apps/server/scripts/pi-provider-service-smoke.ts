#!/usr/bin/env bun
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { ThreadId, type ProviderRuntimeEvent } from "@t3tools/contracts";
import {
  Cause,
  Duration,
  Effect,
  Exit,
  Layer,
  ManagedRuntime,
  Option,
  Scope,
  Stream,
} from "effect";

import {
  makeSqlitePersistenceLive,
  SqlitePersistenceMemory,
} from "../src/persistence/Layers/Sqlite.ts";
import { ProviderSessionRuntimeRepositoryLive } from "../src/persistence/Layers/ProviderSessionRuntime.ts";
import { ProviderSessionRuntimeRepository } from "../src/persistence/Services/ProviderSessionRuntime.ts";
import { ProviderAdapterRegistry } from "../src/provider/Services/ProviderAdapterRegistry.ts";
import { ProviderService } from "../src/provider/Services/ProviderService.ts";
import { PiAdapter } from "../src/provider/Services/PiAdapter.ts";
import { PiAdapterLive } from "../src/provider/Layers/PiAdapter.ts";
import { makeProviderServiceLive } from "../src/provider/Layers/ProviderService.ts";
import { ProviderSessionDirectoryLive } from "../src/provider/Layers/ProviderSessionDirectory.ts";
import { ProviderUnsupportedError } from "../src/provider/Errors.ts";
import { ServerSettingsService } from "../src/serverSettings.ts";
import { AnalyticsService } from "../src/telemetry/Services/AnalyticsService.ts";

interface SmokeOptions {
  readonly cwd: string;
  readonly threadId: string;
  readonly prompt: string;
  readonly resumePrompt: string;
  readonly dbPath?: string;
  readonly eventsFile?: string;
  readonly eventSettleMs: number;
  readonly skipResume: boolean;
}

interface SmokeLogger {
  readonly write: (record: unknown) => Promise<void>;
}

const DEFAULT_PROMPT = "Reply with exactly: T3 Pi ProviderService smoke OK. Do not modify files.";
const DEFAULT_RESUME_PROMPT =
  "Reply with exactly: T3 Pi ProviderService resume OK. Do not modify files.";

const USAGE = `Usage:
  bun apps/server/scripts/pi-provider-service-smoke.ts [options]

Options:
  --cwd <path>               Repository root to exercise. Defaults to process.cwd().
  --thread-id <id>           Thread id to use. Defaults to pi-provider-service-smoke-<timestamp>.
  --prompt <text>            Prompt for the first turn.
  --resume-prompt <text>     Prompt for the resume turn.
  --db-path <path>           Optional SQLite database path. Defaults to in-memory.
  --events-file <path>       Optional JSONL output file for structured logs.
  --event-settle-ms <number> Milliseconds to wait after each turn for event fanout. Defaults to 1000.
  --skip-resume              Skip stop-and-resume validation.
  --help                     Print this help.
`;

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return String(error);
}

function serializeError(error: unknown): { readonly message: string } {
  return {
    message: toErrorMessage(error),
  };
}

function recordEnvelope(type: string, payload: Record<string, unknown>) {
  return {
    type,
    createdAt: new Date().toISOString(),
    ...payload,
  };
}

async function createLogger(eventsFile?: string): Promise<SmokeLogger> {
  if (eventsFile) {
    await mkdir(path.dirname(eventsFile), { recursive: true });
  }

  return {
    async write(record: unknown) {
      const line = JSON.stringify(record);
      process.stdout.write(`${line}\n`);
      if (eventsFile) {
        await appendFile(eventsFile, `${line}\n`, "utf8");
      }
    },
  } satisfies SmokeLogger;
}

function readRequiredValue(args: ReadonlyArray<string>, index: number, flag: string): string {
  const value = args[index + 1]?.trim();
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(rawValue: string, flag: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function resolveOptionalPath(processCwd: string, rawPath?: string): string | undefined {
  return rawPath ? path.resolve(processCwd, rawPath) : undefined;
}

function parseArgs(
  args: ReadonlyArray<string>,
  options?: {
    readonly processCwd?: string;
    readonly now?: () => number;
  },
): SmokeOptions & { readonly help: boolean } {
  const processCwd = options?.processCwd ?? process.cwd();
  const now = options?.now ?? Date.now;

  let cwd = processCwd;
  let threadId = `pi-provider-service-smoke-${now()}`;
  let prompt = DEFAULT_PROMPT;
  let resumePrompt = DEFAULT_RESUME_PROMPT;
  let dbPath: string | undefined;
  let eventsFile: string | undefined;
  let eventSettleMs = 1_000;
  let skipResume = false;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--help":
        help = true;
        break;
      case "--cwd":
        cwd = path.resolve(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--thread-id":
        threadId = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--prompt":
        prompt = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--resume-prompt":
        resumePrompt = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--db-path":
        dbPath = resolveOptionalPath(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--events-file":
        eventsFile = resolveOptionalPath(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--event-settle-ms":
        eventSettleMs = parsePositiveInteger(readRequiredValue(args, index, arg), arg);
        index += 1;
        break;
      case "--skip-resume":
        skipResume = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const normalizedPrompt = prompt.trim();
  if (!help && normalizedPrompt.length === 0) {
    throw new Error("--prompt must not be empty.");
  }
  const normalizedResumePrompt = resumePrompt.trim();
  if (!help && !skipResume && normalizedResumePrompt.length === 0) {
    throw new Error("--resume-prompt must not be empty unless --skip-resume is set.");
  }

  return {
    help,
    cwd,
    threadId,
    prompt: normalizedPrompt,
    resumePrompt: normalizedResumePrompt,
    ...(dbPath ? { dbPath } : {}),
    ...(eventsFile ? { eventsFile } : {}),
    eventSettleMs,
    skipResume,
  };
}

function makePiOnlyProviderAdapterRegistryLive() {
  return Layer.effect(
    ProviderAdapterRegistry,
    Effect.gen(function* () {
      const piAdapter = yield* PiAdapter;
      return {
        getByProvider: (provider) =>
          provider === "pi"
            ? Effect.succeed(piAdapter)
            : Effect.fail(new ProviderUnsupportedError({ provider })),
        listProviders: () => Effect.succeed(["pi"]),
      } satisfies typeof ProviderAdapterRegistry.Service;
    }),
  ).pipe(Layer.provide(PiAdapterLive));
}

function truncate(value: string, maxLength = 120): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function summarizeProviderEvent(event: ProviderRuntimeEvent) {
  const payload: Record<string, unknown> = isRecord(event.payload) ? event.payload : {};
  return {
    type: event.type,
    eventId: event.eventId,
    provider: event.provider,
    threadId: event.threadId,
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.itemId ? { itemId: event.itemId } : {}),
    payload: {
      ...(typeof payload.state === "string" ? { state: payload.state } : {}),
      ...(typeof payload.stopReason === "string" ? { stopReason: payload.stopReason } : {}),
      ...(typeof payload.itemType === "string" ? { itemType: payload.itemType } : {}),
      ...(typeof payload.streamKind === "string" ? { streamKind: payload.streamKind } : {}),
      ...(typeof payload.delta === "string"
        ? { deltaPreview: truncate(payload.delta), deltaLength: payload.delta.length }
        : {}),
      ...(typeof payload.message === "string" ? { message: truncate(payload.message) } : {}),
      ...(typeof payload.reason === "string" ? { reason: truncate(payload.reason) } : {}),
      ...(typeof payload.errorMessage === "string"
        ? { errorMessage: truncate(payload.errorMessage) }
        : {}),
    },
  };
}

function summarizeEvents(events: ReadonlyArray<ProviderRuntimeEvent>) {
  const countsByType = new Map<string, number>();
  for (const event of events) {
    countsByType.set(event.type, (countsByType.get(event.type) ?? 0) + 1);
  }
  return {
    total: events.length,
    countsByType: Object.fromEntries([...countsByType.entries()].toSorted()),
    turnStarts: events.filter((event) => event.type === "turn.started").length,
    turnCompletions: events.filter((event) => event.type === "turn.completed").length,
    runtimeErrors: events.filter((event) => event.type === "runtime.error").length,
  };
}

function hasSessionFileResumeCursor(value: unknown): value is { readonly sessionFile: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "sessionFile" in value &&
    typeof value.sessionFile === "string" &&
    value.sessionFile.trim().length > 0
  );
}

async function runSmoke(options: SmokeOptions, logger: SmokeLogger): Promise<void> {
  const persistenceLayer = options.dbPath
    ? makeSqlitePersistenceLive(options.dbPath).pipe(Layer.provide(NodeServices.layer))
    : SqlitePersistenceMemory;
  const runtimeRepositoryLayer = ProviderSessionRuntimeRepositoryLive.pipe(
    Layer.provide(persistenceLayer),
  );
  const directoryLayer = ProviderSessionDirectoryLive.pipe(Layer.provide(runtimeRepositoryLayer));
  const providerLayer = makeProviderServiceLive().pipe(
    Layer.provide(makePiOnlyProviderAdapterRegistryLive()),
    Layer.provide(directoryLayer),
    Layer.provide(
      ServerSettingsService.layerTest({
        providers: {
          pi: {
            enabled: true,
          },
        },
      }),
    ),
    Layer.provide(AnalyticsService.layerTest),
  );
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(NodeServices.layer, runtimeRepositoryLayer, providerLayer),
  );
  const scope = await Effect.runPromise(Scope.make("sequential"));
  const threadId = ThreadId.make(options.threadId);
  const observedEvents: ProviderRuntimeEvent[] = [];

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    runtime.runPromise(effect.pipe(Scope.provide(scope)) as Effect.Effect<A, E, never>);

  const readPersistedBinding = () =>
    run(
      Effect.gen(function* () {
        const repository = yield* ProviderSessionRuntimeRepository;
        return yield* repository.getByThreadId({ threadId });
      }),
    );

  try {
    await logger.write(
      recordEnvelope("smoke.started", {
        options: {
          ...options,
          threadId,
          persistence: options.dbPath ? "sqlite-file" : "sqlite-memory",
        },
      }),
    );

    const provider = await run(Effect.service(ProviderService));

    await run(
      provider.streamEvents.pipe(
        Stream.filter((event) => event.threadId === threadId),
        Stream.runForEach((event) =>
          Effect.promise(async () => {
            observedEvents.push(event);
            await logger.write(
              recordEnvelope("provider.event", {
                summary: summarizeProviderEvent(event),
              }),
            );
          }),
        ),
        Effect.forkScoped,
      ),
    );

    await logger.write(recordEnvelope("session.start.requested", {}));
    const session = await run(
      provider.startSession(threadId, {
        provider: "pi",
        threadId,
        cwd: options.cwd,
        runtimeMode: "full-access",
      }),
    );
    await logger.write(recordEnvelope("session.started", { session }));

    const persistedAfterStart = await readPersistedBinding();
    await logger.write(
      recordEnvelope("binding.after_start", {
        binding: Option.getOrNull(persistedAfterStart),
      }),
    );
    if (!Option.isSome(persistedAfterStart)) {
      throw new Error("ProviderService did not persist a Pi binding after startSession.");
    }
    if (persistedAfterStart.value.providerName !== "pi") {
      throw new Error(
        `Expected persisted provider 'pi' but received '${persistedAfterStart.value.providerName}'.`,
      );
    }
    if (!hasSessionFileResumeCursor(persistedAfterStart.value.resumeCursor)) {
      throw new Error(
        "Persisted Pi binding is missing resumeCursor.sessionFile after startSession.",
      );
    }

    const firstTurn = await run(
      provider.sendTurn({
        threadId,
        input: options.prompt,
      }),
    );
    await run(Effect.sleep(Duration.millis(options.eventSettleMs)));
    await logger.write(recordEnvelope("turn.sent", { label: "initial", turn: firstTurn }));

    const persistedAfterFirstTurn = await readPersistedBinding();
    await logger.write(
      recordEnvelope("binding.after_first_turn", {
        binding: Option.getOrNull(persistedAfterFirstTurn),
      }),
    );

    if (!options.skipResume) {
      await logger.write(recordEnvelope("session.stop_for_resume.requested", {}));
      await run(
        provider.stopSession({
          threadId,
        }),
      );
      const persistedAfterStop = await readPersistedBinding();
      await logger.write(
        recordEnvelope("binding.after_stop_for_resume", {
          binding: Option.getOrNull(persistedAfterStop),
        }),
      );

      const resumeTurn = await run(
        provider.sendTurn({
          threadId,
          input: options.resumePrompt,
        }),
      );
      await run(Effect.sleep(Duration.millis(options.eventSettleMs)));
      await logger.write(recordEnvelope("turn.sent", { label: "resume", turn: resumeTurn }));

      const persistedAfterResumeTurn = await readPersistedBinding();
      await logger.write(
        recordEnvelope("binding.after_resume_turn", {
          binding: Option.getOrNull(persistedAfterResumeTurn),
        }),
      );
      if (!Option.isSome(persistedAfterResumeTurn)) {
        throw new Error("ProviderService did not preserve a Pi binding after resume sendTurn.");
      }
      if (!hasSessionFileResumeCursor(persistedAfterResumeTurn.value.resumeCursor)) {
        throw new Error("Persisted Pi binding is missing resumeCursor.sessionFile after resume.");
      }
    }

    const summary = summarizeEvents(observedEvents);
    await logger.write(recordEnvelope("events.summary", summary));
    if (summary.turnStarts < 1 || summary.turnCompletions < 1) {
      throw new Error(
        `Expected at least one visible ProviderService turn lifecycle, observed ${summary.turnStarts} starts and ${summary.turnCompletions} completions.`,
      );
    }
    if (summary.runtimeErrors > 0) {
      throw new Error(`Observed ${summary.runtimeErrors} Pi runtime error event(s).`);
    }

    await run(
      provider.stopSession({
        threadId,
      }),
    );

    await logger.write(
      recordEnvelope("smoke.completed", {
        eventSummary: summary,
      }),
    );
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await runtime.dispose();
  }
}

async function main() {
  let parsed: ReturnType<typeof parseArgs>;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${toErrorMessage(error)}\n\n${USAGE}`);
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return;
  }

  const logger = await createLogger(parsed.eventsFile);

  try {
    await runSmoke(parsed, logger);
  } catch (error) {
    await logger.write(
      recordEnvelope("smoke.failed", {
        error: serializeError(error),
        prettyError: Cause.pretty(Cause.fail(error)),
      }),
    );
    process.exitCode = 1;
  }
}

await main();
