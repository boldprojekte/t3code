import {
  ApprovalRequestId,
  EventId,
  ThreadId,
  TurnId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import { it, assert, vi } from "@effect/vitest";
import { Effect, Fiber, Layer, PubSub, Stream } from "effect";

import { ProviderAdapterValidationError } from "../Errors.ts";
import { PiAdapter } from "../Services/PiAdapter.ts";
import {
  PiProviderAdapterCandidate,
  type PiProviderAdapterCandidateSendTurnInput,
  type PiProviderAdapterCandidateSession,
  type PiProviderAdapterCandidateShape,
  type PiProviderAdapterCandidateStartInput,
} from "../Services/PiProviderAdapterCandidate.ts";
import type { PiProviderRuntimeEventCandidate } from "../piAdapterCandidate.ts";
import { PiAdapterFromCandidateLive } from "./PiAdapter.ts";

const threadId = ThreadId.make("thread-pi-adapter-test");
const turnId = TurnId.make("turn-pi-adapter-test");
const requestId = ApprovalRequestId.make("request-pi-adapter-test");

function makeFakeCandidate() {
  const eventPubSub = Effect.runSync(PubSub.unbounded<PiProviderRuntimeEventCandidate>());
  const now = "2026-04-23T20:00:00.000Z";

  const validationError = new ProviderAdapterValidationError({
    provider: "pi",
    operation: "sendTurn",
    issue: "Pi sendTurn does not support attachments yet.",
  });

  const startSession = vi.fn((input: PiProviderAdapterCandidateStartInput) => {
    const session: PiProviderAdapterCandidateSession = {
      provider: "pi",
      status: "ready",
      runtimeMode: input.runtimeMode,
      cwd: input.cwd,
      threadId: input.threadId,
      ...(input.resumeCursor ? { resumeCursor: input.resumeCursor } : {}),
      createdAt: now,
      updatedAt: now,
      agentDir: "/tmp/pi-agent",
      sessionId: "pi-session-1",
      sessionFile: input.resumeCursor?.sessionFile ?? "/tmp/pi-session-1.jsonl",
    };
    return Effect.succeed(session);
  });
  const sendTurn = vi.fn((input: PiProviderAdapterCandidateSendTurnInput) =>
    input.attachments && input.attachments.length > 0
      ? Effect.fail(validationError)
      : Effect.succeed({
          threadId: input.threadId,
          turnId,
          resumeCursor: { sessionFile: "/tmp/pi-session-1.jsonl" },
        }),
  );
  const interruptTurn = vi.fn(() => Effect.void);
  const respondToRequest = vi.fn(() =>
    Effect.fail(
      new ProviderAdapterValidationError({
        provider: "pi",
        operation: "respondToRequest",
        issue:
          "Pi respondToRequest is not supported because the Pi bridge does not map approval callbacks yet.",
      }),
    ),
  );
  const respondToUserInput = vi.fn(() => Effect.void);
  const stopSession = vi.fn(() => Effect.void);

  const candidate: PiProviderAdapterCandidateShape = {
    provider: "pi",
    capabilities: { sessionModelSwitch: "unsupported" },
    startSession,
    sendTurn,
    interruptTurn,
    respondToRequest,
    respondToUserInput,
    stopSession,
    listSessions: vi.fn(() => Effect.succeed([])),
    hasSession: vi.fn(() => Effect.succeed(true)),
    readThread: vi.fn((nextThreadId) =>
      Effect.succeed({
        threadId: nextThreadId,
        turns: [{ id: turnId, items: [] }],
      }),
    ),
    rollbackThread: vi.fn(() =>
      Effect.fail(
        new ProviderAdapterValidationError({
          provider: "pi",
          operation: "rollbackThread",
          issue:
            "Pi rollbackThread is not supported because the bridge does not own Pi history mutation yet.",
        }),
      ),
    ),
    stopAll: vi.fn(() => Effect.void),
    getCommands: vi.fn(() => Effect.succeed([])),
    get streamEvents() {
      return Stream.fromPubSub(eventPubSub);
    },
  };

  const emit = (event: PiProviderRuntimeEventCandidate) =>
    PubSub.publish(eventPubSub, event).pipe(Effect.asVoid);

  const layer = PiAdapterFromCandidateLive.pipe(
    Layer.provide(Layer.succeed(PiProviderAdapterCandidate, candidate)),
  );

  return {
    candidate,
    emit,
    interruptTurn,
    layer,
    respondToRequest,
    sendTurn,
    startSession,
    stopSession,
  };
}

it.effect("PiAdapter delegates lifecycle calls to the provider candidate", () => {
  const fake = makeFakeCandidate();
  return Effect.scoped(
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;

      const session = yield* adapter.startSession({
        provider: "pi",
        threadId,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        resumeCursor: { sessionFile: "/tmp/resume.jsonl" },
      });

      assert.equal(adapter.provider, "pi");
      assert.deepEqual(adapter.capabilities, { sessionModelSwitch: "unsupported" });
      assert.equal(session.provider, "pi");
      assert.deepEqual(session.resumeCursor, { sessionFile: "/tmp/resume.jsonl" });
      assert.equal(fake.startSession.mock.calls[0]?.[0].cwd, process.cwd());
      assert.deepEqual(fake.startSession.mock.calls[0]?.[0].resumeCursor, {
        sessionFile: "/tmp/resume.jsonl",
      });

      const turn = yield* adapter.sendTurn({
        threadId,
        input: "Hello Pi",
      });
      assert.deepEqual(turn, {
        threadId,
        turnId,
        resumeCursor: { sessionFile: "/tmp/pi-session-1.jsonl" },
      });

      yield* adapter.interruptTurn(threadId, turnId);
      yield* adapter.stopSession(threadId);
      yield* adapter.respondToRequest(threadId, requestId, "accept").pipe(Effect.flip);

      assert.equal(fake.sendTurn.mock.calls.length, 1);
      assert.equal(fake.interruptTurn.mock.calls.length, 1);
      assert.equal(fake.stopSession.mock.calls.length, 1);
      assert.equal(fake.respondToRequest.mock.calls.length, 1);
    }),
  ).pipe(Effect.provide(fake.layer));
});

it.effect("PiAdapter validates shared start input before delegating", () => {
  const fake = makeFakeCandidate();
  return Effect.gen(function* () {
    const adapter = yield* PiAdapter;

    const missingCwd = yield* adapter
      .startSession({
        provider: "pi",
        threadId,
        runtimeMode: "full-access",
      })
      .pipe(Effect.flip);
    const malformedResumeCursor = yield* adapter
      .startSession({
        provider: "pi",
        threadId,
        cwd: process.cwd(),
        runtimeMode: "full-access",
        resumeCursor: { opaque: "bad" },
      })
      .pipe(Effect.flip);

    assert.deepEqual(
      missingCwd,
      new ProviderAdapterValidationError({
        provider: "pi",
        operation: "startSession",
        issue: "Pi startSession requires cwd.",
      }),
    );
    assert.deepEqual(
      malformedResumeCursor,
      new ProviderAdapterValidationError({
        provider: "pi",
        operation: "startSession",
        issue: "Pi resumeCursor must be an object with a non-empty sessionFile string.",
      }),
    );
    assert.equal(fake.startSession.mock.calls.length, 0);
  }).pipe(Effect.provide(fake.layer));
});

it.effect("PiAdapter exposes canonical runtime events", () => {
  const fake = makeFakeCandidate();
  return Effect.scoped(
    Effect.gen(function* () {
      const adapter = yield* PiAdapter;
      const event: PiProviderRuntimeEventCandidate = {
        type: "session.state.changed",
        eventId: EventId.make("event-pi-adapter-1"),
        provider: "pi",
        threadId,
        createdAt: "2026-04-23T20:00:00.000Z",
        sessionSequence: 1,
        payload: { state: "ready" },
        raw: {
          source: "pi.sdk.session-event",
          method: "agent_end",
          payload: { type: "agent_end" },
        },
      };

      const fiber = yield* adapter.streamEvents.pipe(
        Stream.take(1),
        Stream.runCollect,
        Effect.forkScoped,
      );
      yield* Effect.yieldNow;
      yield* fake.emit(event);
      const events = yield* Fiber.join(fiber);
      const canonical = Array.from(events) as ReadonlyArray<ProviderRuntimeEvent>;

      assert.equal(canonical.length, 1);
      assert.equal(canonical[0]?.provider, "pi");
      assert.equal(canonical[0]?.type, "session.state.changed");
      assert.equal(canonical[0]?.raw?.source, "pi.sdk.session-event");
    }),
  ).pipe(Effect.provide(fake.layer));
});
