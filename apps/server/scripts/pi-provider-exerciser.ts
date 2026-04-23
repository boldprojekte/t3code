#!/usr/bin/env bun
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Cause,
  Duration,
  Effect,
  Exit,
  Fiber,
  Layer,
  ManagedRuntime,
  Result,
  Scope,
  Stream,
} from "effect";
import { ThreadId } from "@t3tools/contracts";

import { PiProviderAdapterCandidateLive } from "../src/provider/Layers/PiProviderAdapterCandidate.ts";
import {
  PiProviderAdapterCandidate,
  type PiProviderAdapterCandidateShape,
} from "../src/provider/Services/PiProviderAdapterCandidate.ts";
import {
  PI_PROVIDER_EXERCISER_USAGE,
  formatPiProviderRuntimeEventSummary,
  parsePiProviderExerciserArgs,
  type PiProviderExerciserOptions,
  type PiProviderExerciserTurnPlan,
} from "../src/provider/piProviderExerciser.ts";
import type { PiProviderRuntimeEventCandidate } from "../src/provider/piAdapterCandidate.ts";

interface ExerciseLogger {
  write(record: unknown): Promise<void>;
}

interface TurnExerciseSummary {
  readonly label: string;
  readonly prompt: string;
  readonly abortAfterMs?: number;
  readonly elapsedMs: number;
  readonly outcome: "completed" | "failed" | "timed_out";
  readonly result?: unknown;
  readonly error?: string;
}

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

async function createLogger(eventsFile?: string): Promise<ExerciseLogger> {
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
  } satisfies ExerciseLogger;
}

function recordEnvelope(type: string, payload: Record<string, unknown>) {
  return {
    type,
    createdAt: new Date().toISOString(),
    ...payload,
  };
}

function summarizeThreadEvents(events: ReadonlyArray<PiProviderRuntimeEventCandidate>) {
  return events.map((event) => ({
    sessionSequence: event.sessionSequence,
    type: event.type,
    ...(event.turnId ? { turnId: event.turnId } : {}),
    ...(event.itemId ? { itemId: event.itemId } : {}),
    payload: event.payload,
  }));
}

async function exerciseTurn(options: {
  readonly adapter: PiProviderAdapterCandidateShape;
  readonly logger: ExerciseLogger;
  readonly run: <A, E, R>(effect: Effect.Effect<A, E, R>) => Promise<A>;
  readonly threadId: ReturnType<typeof ThreadId.make>;
  readonly turn: PiProviderExerciserTurnPlan;
  readonly turnTimeoutMs: number;
}): Promise<TurnExerciseSummary> {
  const { adapter, logger, run, threadId, turn, turnTimeoutMs } = options;
  const startedAt = Date.now();

  await logger.write(
    recordEnvelope("turn.exercise.started", {
      label: turn.label,
      prompt: turn.prompt,
      ...(turn.abortAfterMs !== undefined ? { abortAfterMs: turn.abortAfterMs } : {}),
    }),
  );

  const turnFiber = await run(
    adapter
      .sendTurn({
        threadId,
        input: turn.prompt,
      })
      .pipe(Effect.forkScoped),
  );

  const abortFiber =
    turn.abortAfterMs === undefined
      ? undefined
      : await run(
          Effect.sleep(Duration.millis(turn.abortAfterMs)).pipe(
            Effect.andThen(
              Effect.promise(() =>
                logger.write(
                  recordEnvelope("turn.exercise.abort.requested", {
                    label: turn.label,
                    abortAfterMs: turn.abortAfterMs,
                  }),
                ),
              ),
            ),
            Effect.andThen(adapter.interruptTurn(threadId)),
            Effect.catch((error) =>
              Effect.promise(() =>
                logger.write(
                  recordEnvelope("turn.exercise.abort.failed", {
                    label: turn.label,
                    error: serializeError(error),
                  }),
                ),
              ),
            ),
            Effect.forkScoped,
          ),
        );

  try {
    const outcome = await new Promise<
      | { readonly type: "timeout" }
      | { readonly type: "result"; readonly result: Result.Result<unknown, unknown> }
    >((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ type: "timeout" });
      }, turnTimeoutMs);

      void run(Effect.result(Fiber.join(turnFiber))).then((result) => {
        clearTimeout(timeout);
        resolve({ type: "result", result });
      });
    });
    const elapsedMs = Date.now() - startedAt;

    if (outcome.type === "timeout") {
      await logger.write(
        recordEnvelope("turn.exercise.timed_out", {
          label: turn.label,
          turnTimeoutMs,
        }),
      );
      await run(Fiber.interrupt(turnFiber));
      return {
        label: turn.label,
        prompt: turn.prompt,
        ...(turn.abortAfterMs !== undefined ? { abortAfterMs: turn.abortAfterMs } : {}),
        elapsedMs,
        outcome: "timed_out",
        error: `Timed out after ${turnTimeoutMs}ms.`,
      };
    }

    if (Result.isFailure(outcome.result)) {
      const error = Cause.pretty(Cause.fail(outcome.result.failure));
      await logger.write(
        recordEnvelope("turn.exercise.failed", {
          label: turn.label,
          error: { message: error },
        }),
      );
      return {
        label: turn.label,
        prompt: turn.prompt,
        ...(turn.abortAfterMs !== undefined ? { abortAfterMs: turn.abortAfterMs } : {}),
        elapsedMs,
        outcome: "failed",
        error,
      };
    }

    await logger.write(
      recordEnvelope("turn.exercise.completed", {
        label: turn.label,
        result: outcome.result.success,
      }),
    );
    return {
      label: turn.label,
      prompt: turn.prompt,
      ...(turn.abortAfterMs !== undefined ? { abortAfterMs: turn.abortAfterMs } : {}),
      elapsedMs,
      outcome: "completed",
      result: outcome.result.success,
    };
  } finally {
    if (abortFiber) {
      await run(Fiber.interrupt(abortFiber));
    }
  }
}

async function runExercise(
  options: PiProviderExerciserOptions,
  logger: ExerciseLogger,
): Promise<void> {
  const runtime = ManagedRuntime.make(
    Layer.mergeAll(NodeServices.layer, PiProviderAdapterCandidateLive),
  );
  const scope = await Effect.runPromise(Scope.make("sequential"));
  const threadId = ThreadId.make(options.threadId);
  const observedEvents: PiProviderRuntimeEventCandidate[] = [];

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    runtime.runPromise(effect.pipe(Scope.provide(scope)) as Effect.Effect<A, E, never>);

  try {
    await logger.write(recordEnvelope("exercise.started", { options }));

    const adapter = await run(Effect.service(PiProviderAdapterCandidate));

    await run(
      adapter.streamEvents.pipe(
        Stream.filter((event) => event.threadId === threadId),
        Stream.runForEach((event) =>
          Effect.promise(async () => {
            observedEvents.push(event);
            await logger.write(
              recordEnvelope("provider.event", {
                summary: formatPiProviderRuntimeEventSummary(event),
                event,
              }),
            );
          }),
        ),
        Effect.forkScoped,
      ),
    );

    await logger.write(recordEnvelope("session.start.requested", {}));
    const session = await run(
      adapter.startSession({
        provider: "pi",
        threadId,
        cwd: options.cwd,
        runtimeMode: options.runtimeMode,
        ...(options.sessionFile ? { sessionFile: options.sessionFile } : {}),
        ...(options.packageEntryPath ? { packageEntryPath: options.packageEntryPath } : {}),
      }),
    );

    await logger.write(
      recordEnvelope("session.started", {
        session,
      }),
    );

    const sessionsAfterStart = await run(adapter.listSessions());
    const commands = await run(adapter.getCommands(threadId));
    await logger.write(
      recordEnvelope("session.observed", {
        sessionsAfterStart,
        commands,
      }),
    );

    const turnResults: TurnExerciseSummary[] = [];
    for (const turn of options.turns) {
      turnResults.push(
        await exerciseTurn({
          adapter,
          logger,
          run,
          threadId,
          turn,
          turnTimeoutMs: options.turnTimeoutMs,
        }),
      );
    }

    const threadSnapshot = await run(adapter.readThread(threadId));
    const sessionsBeforeStop = await run(adapter.listSessions());
    await logger.write(
      recordEnvelope("thread.snapshot", {
        threadSnapshot: {
          threadId: threadSnapshot.threadId,
          turns: threadSnapshot.turns.map((turn) => ({
            id: turn.id,
            items: summarizeThreadEvents(turn.items),
          })),
        },
        sessionsBeforeStop,
        turnResults,
      }),
    );

    await run(adapter.stopSession(threadId));
    const hasSessionAfterStop = await run(adapter.hasSession(threadId));
    const sessionsAfterStop = await run(adapter.listSessions());
    await logger.write(
      recordEnvelope("session.stopped", {
        hasSessionAfterStop,
        sessionsAfterStop,
      }),
    );

    if (options.stopAllAfter) {
      await run(adapter.stopAll());
      const sessionsAfterStopAll = await run(adapter.listSessions());
      await logger.write(
        recordEnvelope("session.stop_all.completed", {
          sessionsAfterStopAll,
        }),
      );
    }

    await logger.write(
      recordEnvelope("exercise.completed", {
        observedEventCount: observedEvents.length,
      }),
    );
  } finally {
    await Effect.runPromise(Scope.close(scope, Exit.void));
    await runtime.dispose();
  }
}

async function main() {
  let parsed: ReturnType<typeof parsePiProviderExerciserArgs>;

  try {
    parsed = parsePiProviderExerciserArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${toErrorMessage(error)}\n\n${PI_PROVIDER_EXERCISER_USAGE}`);
    process.exitCode = 1;
    return;
  }

  if (parsed.help) {
    process.stdout.write(PI_PROVIDER_EXERCISER_USAGE);
    return;
  }

  const logger = await createLogger(parsed.eventsFile);

  try {
    await runExercise(parsed, logger);
  } catch (error) {
    await logger.write(
      recordEnvelope("exercise.failed", {
        error: serializeError(error),
      }),
    );
    process.exitCode = 1;
  }
}

await main();
