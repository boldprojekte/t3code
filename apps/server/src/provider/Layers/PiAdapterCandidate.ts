import { Effect, Layer, PubSub, Stream } from "effect";
import type { ThreadId } from "@t3tools/contracts";

import {
  ProviderAdapterProcessError,
  ProviderAdapterSessionNotFoundError,
  ProviderAdapterValidationError,
} from "../Errors.ts";
import {
  createPiAdapterCandidate,
  type PiAdapterCandidate as PiAdapterCandidateRuntime,
  type PiProviderRuntimeEventCandidate,
} from "../piAdapterCandidate.ts";
import {
  PiAdapterCandidate,
  type PiAdapterCandidateSession,
  type PiAdapterCandidateShape,
  type PiAdapterCandidateStartInput,
} from "../Services/PiAdapterCandidate.ts";

const PROVIDER = "pi" as const;

type ManagedPiSession = {
  readonly runtime: PiAdapterCandidateRuntime;
  readonly startedAt: string;
};

function nowIso(): string {
  return new Date().toISOString();
}

function toProcessError(
  threadId: ThreadId,
  operation: string,
  cause: unknown,
): ProviderAdapterProcessError {
  return new ProviderAdapterProcessError({
    provider: PROVIDER,
    threadId,
    detail:
      cause instanceof Error && cause.message.trim().length > 0
        ? cause.message
        : `${operation} failed`,
    cause,
  });
}

function validateStartInput(
  input: PiAdapterCandidateStartInput,
): Effect.Effect<void, ProviderAdapterValidationError> {
  return input.cwd.trim().length > 0
    ? Effect.void
    : Effect.fail(
        new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: "cwd must not be empty.",
        }),
      );
}

function validatePrompt(prompt: string): Effect.Effect<void, ProviderAdapterValidationError> {
  return prompt.trim().length > 0
    ? Effect.void
    : Effect.fail(
        new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "sendTurn",
          issue: "prompt must not be empty.",
        }),
      );
}

function sessionNotFound(threadId: ThreadId): ProviderAdapterSessionNotFoundError {
  return new ProviderAdapterSessionNotFoundError({
    provider: PROVIDER,
    threadId,
  });
}

function toSessionRecord(threadId: ThreadId, session: ManagedPiSession): PiAdapterCandidateSession {
  const sessionInfo = session.runtime.getSessionInfo();
  return {
    provider: PROVIDER,
    threadId,
    cwd: session.runtime.cwd,
    agentDir: session.runtime.agentDir,
    sessionId: sessionInfo.sessionId,
    sessionFile: sessionInfo.sessionFile,
    startedAt: session.startedAt,
  };
}

const makePiAdapterCandidate = Effect.gen(function* () {
  const context = yield* Effect.context<never>();
  const runFork = Effect.runForkWith(context);
  const eventPubSub = yield* PubSub.unbounded<PiProviderRuntimeEventCandidate>();
  const sessions = new Map<ThreadId, ManagedPiSession>();

  const publishEvent = (event: PiProviderRuntimeEventCandidate) =>
    PubSub.publish(eventPubSub, event).pipe(Effect.asVoid);

  const publishEventBestEffort = (event: PiProviderRuntimeEventCandidate) => {
    runFork(publishEvent(event).pipe(Effect.ignoreCause({ log: false })));
  };

  const resolveSession = (
    threadId: ThreadId,
  ): Effect.Effect<ManagedPiSession, ProviderAdapterSessionNotFoundError> => {
    const session = sessions.get(threadId);
    return session ? Effect.succeed(session) : Effect.fail(sessionNotFound(threadId));
  };

  const stopManagedSession = (threadId: ThreadId, session: ManagedPiSession) =>
    Effect.tryPromise({
      try: async () => {
        await session.runtime.dispose();
      },
      catch: (cause) => toProcessError(threadId, "stopSession", cause),
    }).pipe(
      Effect.tap(() =>
        Effect.sync(() => {
          sessions.delete(threadId);
        }),
      ),
    );

  yield* Effect.addFinalizer(() =>
    Effect.forEach(
      [...sessions.entries()],
      ([threadId, session]) => stopManagedSession(threadId, session).pipe(Effect.ignore),
      {
        concurrency: "unbounded",
        discard: true,
      },
    ),
  );

  const startSession: PiAdapterCandidateShape["startSession"] = (input) =>
    Effect.gen(function* () {
      yield* validateStartInput(input);
      if (sessions.has(input.threadId)) {
        return yield* new ProviderAdapterValidationError({
          provider: PROVIDER,
          operation: "startSession",
          issue: `thread '${input.threadId}' already has an active Pi session.`,
        });
      }

      const runtime = yield* Effect.tryPromise({
        try: () =>
          createPiAdapterCandidate({
            ...input,
            threadId: input.threadId,
            onEvent: publishEventBestEffort,
          }),
        catch: (cause) => toProcessError(input.threadId, "startSession", cause),
      });
      const managedSession: ManagedPiSession = {
        runtime,
        startedAt: nowIso(),
      };
      sessions.set(input.threadId, managedSession);
      return toSessionRecord(input.threadId, managedSession);
    });

  const hasSession: PiAdapterCandidateShape["hasSession"] = (threadId) =>
    Effect.sync(() => sessions.has(threadId));

  const getSession: PiAdapterCandidateShape["getSession"] = (threadId) =>
    resolveSession(threadId).pipe(Effect.map((session) => toSessionRecord(threadId, session)));

  const listSessions: PiAdapterCandidateShape["listSessions"] = () =>
    Effect.sync(() =>
      [...sessions.entries()]
        .map(([threadId, session]) => toSessionRecord(threadId, session))
        .toSorted((left, right) => left.startedAt.localeCompare(right.startedAt)),
    );

  const getCommands: PiAdapterCandidateShape["getCommands"] = (threadId) =>
    resolveSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.tryPromise({
          try: () => session.runtime.getCommands(),
          catch: (cause) => toProcessError(threadId, "getCommands", cause),
        }),
      ),
    );

  const sendTurn: PiAdapterCandidateShape["sendTurn"] = (input) =>
    Effect.gen(function* () {
      yield* validatePrompt(input.prompt);
      const session = yield* resolveSession(input.threadId);
      yield* Effect.tryPromise({
        try: () => session.runtime.sendTurn({ turnId: input.turnId, prompt: input.prompt }),
        catch: (cause) => toProcessError(input.threadId, "sendTurn", cause),
      });
    });

  const abortTurn: PiAdapterCandidateShape["abortTurn"] = (threadId) =>
    resolveSession(threadId).pipe(
      Effect.flatMap((session) =>
        Effect.tryPromise({
          try: () => session.runtime.abort(),
          catch: (cause) => toProcessError(threadId, "abortTurn", cause),
        }),
      ),
    );

  const stopSession: PiAdapterCandidateShape["stopSession"] = (threadId) =>
    resolveSession(threadId).pipe(
      Effect.flatMap((session) => stopManagedSession(threadId, session)),
    );

  const stopAll: PiAdapterCandidateShape["stopAll"] = () =>
    Effect.forEach(
      [...sessions.entries()],
      ([threadId, session]) => stopManagedSession(threadId, session).pipe(Effect.ignore),
      {
        concurrency: "unbounded",
        discard: true,
      },
    );

  return {
    startSession,
    hasSession,
    getSession,
    listSessions,
    getCommands,
    sendTurn,
    abortTurn,
    stopSession,
    stopAll,
    streamEvents: Stream.fromPubSub(eventPubSub),
  } satisfies PiAdapterCandidateShape;
});

export const PiAdapterCandidateLive = Layer.effect(PiAdapterCandidate, makePiAdapterCandidate);
