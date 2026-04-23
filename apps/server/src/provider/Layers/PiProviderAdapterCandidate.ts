import { randomUUID } from "node:crypto";

import { Effect, Layer, Stream } from "effect";
import {
  TurnId,
  type RuntimeMode,
  type ThreadId,
  type TurnId as TurnIdType,
} from "@t3tools/contracts";

import { ProviderAdapterSessionNotFoundError, ProviderAdapterValidationError } from "../Errors.ts";
import type { PiProviderRuntimeEventCandidate } from "../piAdapterCandidate.ts";
import { PiAdapterCandidate } from "../Services/PiAdapterCandidate.ts";
import type { PiAdapterCandidateSession } from "../Services/PiAdapterCandidate.ts";
import {
  PiProviderAdapterCandidate,
  type PiProviderAdapterCandidateResumeCursor,
  type PiProviderAdapterCandidateSession,
  type PiProviderAdapterCandidateShape,
  type PiProviderAdapterCandidateThreadSnapshot,
} from "../Services/PiProviderAdapterCandidate.ts";
import { PiAdapterCandidateLive } from "./PiAdapterCandidate.ts";

const PROVIDER = "pi" as const;

interface SessionProjection {
  readonly runtimeMode: RuntimeMode;
  readonly status: PiProviderAdapterCandidateSession["status"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeTurnId?: TurnIdType;
  readonly lastError?: string;
}

interface TurnProjection {
  readonly id: TurnIdType;
  readonly items: Array<PiProviderRuntimeEventCandidate>;
}

function resumeCursorFromSessionFile(
  sessionFile: string | null,
): PiProviderAdapterCandidateResumeCursor | undefined {
  return sessionFile ? { sessionFile } : undefined;
}

function toValidationError(issue: string, operation: string): ProviderAdapterValidationError {
  return new ProviderAdapterValidationError({
    provider: PROVIDER,
    operation,
    issue,
  });
}

function toSessionState(
  state: "starting" | "ready" | "running" | "waiting" | "stopped" | "error",
): PiProviderAdapterCandidateSession["status"] {
  switch (state) {
    case "starting":
      return "connecting";
    case "running":
    case "waiting":
      return "running";
    case "stopped":
      return "closed";
    case "error":
      return "error";
    case "ready":
    default:
      return "ready";
  }
}

function buildSessionProjection(input: {
  readonly runtimeMode: RuntimeMode;
  readonly status: PiProviderAdapterCandidateSession["status"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activeTurnId?: TurnIdType;
  readonly lastError?: string;
}): SessionProjection {
  return {
    runtimeMode: input.runtimeMode,
    status: input.status,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    ...(input.activeTurnId ? { activeTurnId: input.activeTurnId } : {}),
    ...(input.lastError ? { lastError: input.lastError } : {}),
  };
}

const makePiProviderAdapterCandidate = Effect.gen(function* () {
  const piAdapter = yield* PiAdapterCandidate;
  const sessionProjections = new Map<ThreadId, SessionProjection>();
  const turnProjections = new Map<ThreadId, Map<TurnIdType, TurnProjection>>();

  const ensureTurnProjection = (threadId: ThreadId, turnId: TurnIdType): TurnProjection => {
    const threadTurns = turnProjections.get(threadId) ?? new Map<TurnIdType, TurnProjection>();
    turnProjections.set(threadId, threadTurns);
    const existing = threadTurns.get(turnId);
    if (existing) {
      return existing;
    }
    const created: TurnProjection = {
      id: turnId,
      items: [],
    };
    threadTurns.set(turnId, created);
    return created;
  };

  const projectEvent = (event: PiProviderRuntimeEventCandidate) =>
    Effect.sync(() => {
      if (event.turnId) {
        ensureTurnProjection(event.threadId, event.turnId).items.push(event);
      }

      const existing = sessionProjections.get(event.threadId);
      if (!existing) {
        return;
      }

      switch (event.type) {
        case "session.started":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: "ready",
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(existing.lastError ? { lastError: existing.lastError } : {}),
            }),
          );
          return;
        case "session.state.changed":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: toSessionState(event.payload.state),
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(event.payload.state === "ready" ? {} : { activeTurnId: existing.activeTurnId }),
              ...(event.payload.state === "error"
                ? { lastError: event.payload.reason ?? existing.lastError }
                : existing.lastError
                  ? { lastError: existing.lastError }
                  : {}),
            }),
          );
          return;
        case "turn.started":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: "running",
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(event.turnId ? { activeTurnId: event.turnId } : {}),
              ...(existing.lastError ? { lastError: existing.lastError } : {}),
            }),
          );
          return;
        case "turn.completed":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: event.payload.state === "failed" ? "error" : "ready",
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(event.payload.state === "failed"
                ? { lastError: event.payload.errorMessage ?? existing.lastError }
                : existing.lastError
                  ? { lastError: existing.lastError }
                  : {}),
            }),
          );
          return;
        case "runtime.error":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: "error",
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(existing.activeTurnId ? { activeTurnId: existing.activeTurnId } : {}),
              lastError: event.payload.message,
            }),
          );
          return;
        case "session.exited":
          sessionProjections.set(
            event.threadId,
            buildSessionProjection({
              runtimeMode: existing.runtimeMode,
              status: "closed",
              createdAt: existing.createdAt,
              updatedAt: event.createdAt,
              ...(existing.lastError ? { lastError: existing.lastError } : {}),
            }),
          );
          return;
        default:
          return;
      }
    });

  yield* Stream.runForEach(piAdapter.streamEvents, projectEvent).pipe(Effect.forkScoped);

  const toProviderSession = (
    session: PiAdapterCandidateSession,
    projection?: SessionProjection,
  ): PiProviderAdapterCandidateSession => {
    const resumeCursor = resumeCursorFromSessionFile(session.sessionFile);
    return {
      provider: PROVIDER,
      status: projection?.status ?? "ready",
      runtimeMode: projection?.runtimeMode ?? "full-access",
      cwd: session.cwd,
      threadId: session.threadId,
      ...(resumeCursor ? { resumeCursor } : {}),
      ...(projection?.activeTurnId ? { activeTurnId: projection.activeTurnId } : {}),
      createdAt: projection?.createdAt ?? session.startedAt,
      updatedAt: projection?.updatedAt ?? session.startedAt,
      ...(projection?.lastError ? { lastError: projection.lastError } : {}),
      agentDir: session.agentDir,
      sessionId: session.sessionId,
      sessionFile: session.sessionFile,
    };
  };

  const requireSession = (threadId: ThreadId) =>
    piAdapter.hasSession(threadId).pipe(
      Effect.flatMap((hasSession) =>
        hasSession
          ? Effect.void
          : Effect.fail(
              new ProviderAdapterSessionNotFoundError({
                provider: PROVIDER,
                threadId,
              }),
            ),
      ),
    );

  const startSession: PiProviderAdapterCandidateShape["startSession"] = (input) =>
    Effect.gen(function* () {
      if (input.provider !== undefined && input.provider !== PROVIDER) {
        return yield* toValidationError(
          `Expected provider '${PROVIDER}' but received '${input.provider}'.`,
          "startSession",
        );
      }
      if (input.modelSelection !== undefined) {
        return yield* toValidationError(
          "Pi startSession does not support modelSelection yet.",
          "startSession",
        );
      }

      const resumeSessionFile = input.resumeCursor?.sessionFile?.trim();
      const explicitSessionFile = input.sessionFile?.trim();
      if (resumeSessionFile && explicitSessionFile && resumeSessionFile !== explicitSessionFile) {
        return yield* toValidationError(
          "sessionFile and resumeCursor.sessionFile must match when both are provided.",
          "startSession",
        );
      }

      const alreadyStarted = yield* piAdapter.hasSession(input.threadId);
      if (alreadyStarted) {
        yield* piAdapter.stopSession(input.threadId);
        sessionProjections.delete(input.threadId);
        turnProjections.delete(input.threadId);
      }

      const sessionFile = explicitSessionFile ?? resumeSessionFile;
      const adapterStartInput: Parameters<typeof piAdapter.startSession>[0] = {
        threadId: input.threadId,
        cwd: input.cwd,
        ...(input.agentDir ? { agentDir: input.agentDir } : {}),
        ...(input.packageEntryPath ? { packageEntryPath: input.packageEntryPath } : {}),
        ...(input.sdkLoader ? { sdkLoader: input.sdkLoader } : {}),
        ...(input.now ? { now: input.now } : {}),
        ...(input.createEventId ? { createEventId: input.createEventId } : {}),
        ...(sessionFile ? { sessionFile } : {}),
      };

      const session = yield* piAdapter.startSession(adapterStartInput);

      turnProjections.set(input.threadId, new Map());
      const projection = buildSessionProjection({
        runtimeMode: input.runtimeMode,
        status: "ready",
        createdAt: session.startedAt,
        updatedAt: session.startedAt,
      });
      sessionProjections.set(input.threadId, projection);

      return toProviderSession(session, projection);
    });

  const listSessions: PiProviderAdapterCandidateShape["listSessions"] = () =>
    piAdapter
      .listSessions()
      .pipe(
        Effect.map((sessions) =>
          sessions.map((session) =>
            toProviderSession(session, sessionProjections.get(session.threadId)),
          ),
        ),
      );

  const sendTurn: PiProviderAdapterCandidateShape["sendTurn"] = (input) =>
    Effect.gen(function* () {
      const prompt = input.input?.trim();
      if (!prompt) {
        return yield* toValidationError("input must not be empty.", "sendTurn");
      }
      if ((input.attachments?.length ?? 0) > 0) {
        return yield* toValidationError(
          "Pi sendTurn does not support attachments yet.",
          "sendTurn",
        );
      }
      if (input.modelSelection !== undefined) {
        return yield* toValidationError(
          "Pi sendTurn does not support modelSelection yet.",
          "sendTurn",
        );
      }
      if (input.interactionMode === "plan") {
        return yield* toValidationError(
          "Pi sendTurn does not support interactionMode 'plan' yet.",
          "sendTurn",
        );
      }

      yield* requireSession(input.threadId);
      const turnId = TurnId.make(`pi-turn:${randomUUID()}`);
      yield* piAdapter.sendTurn({
        threadId: input.threadId,
        turnId,
        prompt,
      });
      const session = yield* piAdapter.getSession(input.threadId);

      const resumeCursor = resumeCursorFromSessionFile(session.sessionFile);
      return {
        threadId: input.threadId,
        turnId,
        ...(resumeCursor ? { resumeCursor } : {}),
      };
    });

  const interruptTurn: PiProviderAdapterCandidateShape["interruptTurn"] = (threadId, _turnId) =>
    requireSession(threadId).pipe(Effect.flatMap(() => piAdapter.abortTurn(threadId)));

  const respondToRequest: PiProviderAdapterCandidateShape["respondToRequest"] = (
    _threadId,
    _requestId,
    _decision,
  ) =>
    Effect.fail(
      toValidationError(
        "Pi respondToRequest is not supported because the Pi bridge does not map approval callbacks yet.",
        "respondToRequest",
      ),
    );

  const respondToUserInput: PiProviderAdapterCandidateShape["respondToUserInput"] = (
    _threadId,
    _requestId,
    _answers,
  ) =>
    Effect.fail(
      toValidationError(
        "Pi respondToUserInput is not supported because the Pi bridge does not map user-input callbacks yet.",
        "respondToUserInput",
      ),
    );

  const stopSession: PiProviderAdapterCandidateShape["stopSession"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.flatMap(() => piAdapter.stopSession(threadId)),
      Effect.tap(() =>
        Effect.sync(() => {
          sessionProjections.delete(threadId);
          turnProjections.delete(threadId);
        }),
      ),
    );

  const readThread: PiProviderAdapterCandidateShape["readThread"] = (threadId) =>
    requireSession(threadId).pipe(
      Effect.map((): PiProviderAdapterCandidateThreadSnapshot => {
        const turns = [...(turnProjections.get(threadId)?.values() ?? [])].map((turn) => ({
          id: turn.id,
          items: [...turn.items],
        }));
        return {
          threadId,
          turns,
        };
      }),
    );

  const rollbackThread: PiProviderAdapterCandidateShape["rollbackThread"] = (
    _threadId,
    _numTurns,
  ) =>
    Effect.fail(
      toValidationError(
        "Pi rollbackThread is not supported because the bridge does not own Pi history mutation yet.",
        "rollbackThread",
      ),
    );

  const stopAll: PiProviderAdapterCandidateShape["stopAll"] = () =>
    piAdapter.stopAll().pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          sessionProjections.clear();
          turnProjections.clear();
        }),
      ),
    );

  const getCommands: PiProviderAdapterCandidateShape["getCommands"] = (threadId) =>
    requireSession(threadId).pipe(Effect.flatMap(() => piAdapter.getCommands(threadId)));

  const hasSession: PiProviderAdapterCandidateShape["hasSession"] = (threadId) =>
    piAdapter.hasSession(threadId);

  return {
    provider: PROVIDER,
    capabilities: {
      sessionModelSwitch: "unsupported",
    },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions,
    hasSession,
    readThread,
    rollbackThread,
    stopAll,
    getCommands,
    get streamEvents() {
      return piAdapter.streamEvents;
    },
  } satisfies PiProviderAdapterCandidateShape;
});

export const PiProviderAdapterCandidateLive = Layer.effect(
  PiProviderAdapterCandidate,
  makePiProviderAdapterCandidate,
).pipe(Layer.provide(PiAdapterCandidateLive));
