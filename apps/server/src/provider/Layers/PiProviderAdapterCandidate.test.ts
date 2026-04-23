import { ApprovalRequestId, ThreadId, TurnId } from "@t3tools/contracts";
import { it, assert } from "@effect/vitest";
import { Effect, Fiber, Ref, Stream } from "effect";
import { describe, vi } from "vitest";

import { ProviderAdapterValidationError } from "../Errors.ts";
import { PiProviderAdapterCandidate } from "../Services/PiProviderAdapterCandidate.ts";
import type { PiProviderRuntimeEventCandidate } from "../piAdapterCandidate.ts";
import { PiProviderAdapterCandidateLive } from "./PiProviderAdapterCandidate.ts";

function createFakeSession() {
  let listener: ((event: unknown) => void) | undefined;

  const session = {
    sessionId: "pi-session-bridge-1",
    sessionFile: "/tmp/pi-session-bridge-1.jsonl",
    bindExtensions: vi.fn(async () => {}),
    subscribe: vi.fn((nextListener: (event: unknown) => void) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
    getCommands: vi.fn(() => [
      {
        name: "review",
        description: "Review changes",
        source: "prompt",
        sourceInfo: { path: "/prompts/review.md" },
      },
    ]),
    prompt: vi.fn(async (_text: string) => {
      listener?.({ type: "agent_start" });
      listener?.({ type: "turn_start", turnIndex: 1, timestamp: 1710000000000 });
      listener?.({
        type: "message_start",
        message: { role: "assistant", timestamp: 1710000000000 },
      });
      listener?.({
        type: "message_update",
        message: { role: "assistant", timestamp: 1710000000001 },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Hallo" },
      });
      listener?.({
        type: "message_end",
        message: { role: "assistant", stopReason: "stop", timestamp: 1710000000002 },
      });
      listener?.({
        type: "turn_end",
        turnIndex: 1,
        message: { role: "assistant", stopReason: "stop", timestamp: 1710000000002 },
        toolResults: [],
      });
      listener?.({ type: "agent_end", messages: [] });
    }),
    abort: vi.fn(async () => {}),
  };

  return { session };
}

function createMultiTurnToolUseSession() {
  let listener: ((event: unknown) => void) | undefined;

  const session = {
    sessionId: "pi-session-bridge-multi-1",
    sessionFile: "/tmp/pi-session-bridge-multi-1.jsonl",
    bindExtensions: vi.fn(async () => {}),
    subscribe: vi.fn((nextListener: (event: unknown) => void) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
    getCommands: vi.fn(() => []),
    prompt: vi.fn(async (_text: string) => {
      listener?.({ type: "agent_start" });

      listener?.({ type: "turn_start", turnIndex: 1, timestamp: 1710000000000 });
      listener?.({
        type: "message_start",
        message: { role: "assistant", timestamp: 1710000000000 },
      });
      listener?.({
        type: "message_update",
        message: { role: "assistant", timestamp: 1710000000001 },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Erst prüfen." },
      });
      listener?.({
        type: "message_end",
        message: { role: "assistant", stopReason: "toolUse", timestamp: 1710000000002 },
      });
      listener?.({
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: "tool-read-1",
        args: { filePath: ".plans/pi-provider-progress.md" },
      });
      listener?.({
        type: "tool_execution_end",
        toolName: "read",
        toolCallId: "tool-read-1",
        isError: false,
        result: "done",
      });
      listener?.({
        type: "turn_end",
        turnIndex: 1,
        message: { role: "assistant", stopReason: "toolUse", timestamp: 1710000000002 },
        toolResults: [],
      });

      listener?.({ type: "turn_start", turnIndex: 2, timestamp: 1710000001000 });
      listener?.({
        type: "message_start",
        message: { role: "assistant", timestamp: 1710000001000 },
      });
      listener?.({
        type: "message_update",
        message: { role: "assistant", timestamp: 1710000001001 },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Dann antworten." },
      });
      listener?.({
        type: "message_end",
        message: { role: "assistant", stopReason: "stop", timestamp: 1710000001002 },
      });
      listener?.({
        type: "turn_end",
        turnIndex: 2,
        message: { role: "assistant", stopReason: "stop", timestamp: 1710000001002 },
        toolResults: [],
      });

      listener?.({ type: "agent_end", messages: [] });
    }),
    abort: vi.fn(async () => {}),
  };

  return { session };
}

function createSdkLoader(fakeSession: ReturnType<typeof createFakeSession>) {
  return async () => ({
    getAgentDir: () => "/tmp/pi-agent",
    SessionManager: {
      create: vi.fn((cwd: string) => ({ cwd })),
      open: vi.fn((sessionFile: string) => ({ sessionFile })),
    },
    createAgentSessionServices: vi.fn(async () => ({ diagnostics: [] })),
    createAgentSessionFromServices: vi.fn(async () => ({
      session: fakeSession.session,
      diagnostics: [],
    })),
    createAgentSessionRuntime: vi.fn(async () => ({
      session: fakeSession.session,
      diagnostics: [],
      dispose: vi.fn(async () => {}),
    })),
  });
}

describe("PiProviderAdapterCandidateLive", () => {
  const layer = it.layer(PiProviderAdapterCandidateLive);

  layer("PiProviderAdapterCandidateLive", (it) => {
    it.effect("bridges Pi sessions into a provider-adapter-shaped local service", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const adapter = yield* PiProviderAdapterCandidate;
          const fakeSession = createFakeSession();
          const threadId = ThreadId.make("thread-pi-bridge-1");
          const eventsRef = yield* Ref.make<Array<PiProviderRuntimeEventCandidate>>([]);
          const streamFiber = yield* adapter.streamEvents.pipe(
            Stream.runForEach((event) => Ref.update(eventsRef, (events) => [...events, event])),
            Effect.forkScoped,
          );
          yield* Effect.yieldNow;

          const started = yield* adapter.startSession({
            provider: "pi",
            threadId,
            cwd: process.cwd(),
            runtimeMode: "full-access",
            sdkLoader: createSdkLoader(fakeSession),
          });

          assert.deepEqual(started, {
            provider: "pi",
            status: "ready",
            runtimeMode: "full-access",
            cwd: process.cwd(),
            threadId,
            resumeCursor: { sessionFile: "/tmp/pi-session-bridge-1.jsonl" },
            createdAt: started.createdAt,
            updatedAt: started.updatedAt,
            agentDir: "/tmp/pi-agent",
            sessionId: "pi-session-bridge-1",
            sessionFile: "/tmp/pi-session-bridge-1.jsonl",
          });
          assert.equal(yield* adapter.hasSession(threadId), true);
          assert.deepEqual(yield* adapter.getCommands(threadId), [
            {
              name: "review",
              description: "Review changes",
              source: "prompt",
              path: "/prompts/review.md",
            },
          ]);

          const listedBeforeTurn = yield* adapter.listSessions();
          assert.deepEqual(listedBeforeTurn, [started]);

          const turn = yield* adapter.sendTurn({
            threadId,
            input: "Bitte lies die wichtigsten Dateien.",
          });
          assert.equal(turn.threadId, threadId);
          assert.equal(typeof turn.turnId, "string");
          assert.deepEqual(turn.resumeCursor, {
            sessionFile: "/tmp/pi-session-bridge-1.jsonl",
          });
          assert.equal(
            fakeSession.session.prompt.mock.calls[0]?.[0],
            "Bitte lies die wichtigsten Dateien.",
          );

          yield* Effect.yieldNow;
          yield* Effect.yieldNow;
          yield* Effect.yieldNow;

          const threadSnapshot = yield* adapter.readThread(threadId);
          assert.equal(threadSnapshot.threadId, threadId);
          assert.equal(threadSnapshot.turns.length, 1);
          assert.equal(threadSnapshot.turns[0]?.id, turn.turnId);
          assert.deepEqual(
            threadSnapshot.turns[0]?.items.map((event) => event.type),
            [
              "turn.started",
              "item.started",
              "content.delta",
              "item.completed",
              "turn.completed",
              "session.state.changed",
            ],
          );

          const listedAfterTurn = yield* adapter.listSessions();
          assert.equal(listedAfterTurn.length, 1);
          assert.equal(listedAfterTurn[0]?.status, "ready");
          assert.equal(listedAfterTurn[0]?.activeTurnId, undefined);

          const seenEvents = yield* Ref.get(eventsRef);
          assert.equal(
            seenEvents.some((event) => event.type === "turn.started"),
            true,
          );
          assert.equal(
            seenEvents.some(
              (event) => event.type === "content.delta" && event.turnId === turn.turnId,
            ),
            true,
          );

          yield* adapter.interruptTurn(threadId, TurnId.make("ignored-turn-id"));
          assert.equal(fakeSession.session.abort.mock.calls.length, 1);

          yield* adapter.stopSession(threadId);
          assert.equal(yield* adapter.hasSession(threadId), false);
          assert.deepEqual(yield* adapter.listSessions(), []);

          yield* Fiber.interrupt(streamFiber);
        }),
      ),
    );

    it.effect("rejects unsupported provider-bridge features explicitly", () =>
      Effect.gen(function* () {
        const adapter = yield* PiProviderAdapterCandidate;
        const fakeSession = createFakeSession();
        const threadId = ThreadId.make("thread-pi-bridge-unsupported");

        yield* adapter.startSession({
          provider: "pi",
          threadId,
          cwd: process.cwd(),
          runtimeMode: "full-access",
          sdkLoader: createSdkLoader(fakeSession),
        });

        const startProviderMismatch = yield* adapter
          .startSession({
            provider: "pi",
            threadId: ThreadId.make("thread-pi-bridge-provider-mismatch"),
            cwd: process.cwd(),
            runtimeMode: "full-access",
            sessionFile: "/tmp/one.jsonl",
            resumeCursor: { sessionFile: "/tmp/two.jsonl" },
            sdkLoader: createSdkLoader(fakeSession),
          })
          .pipe(Effect.flip);
        const sendAttachmentsError = yield* adapter
          .sendTurn({
            threadId,
            input: "Hello",
            attachments: [
              {
                type: "image",
                id: "img-1",
                name: "image.png",
                mimeType: "image/png",
                sizeBytes: 12,
              },
            ],
          })
          .pipe(Effect.flip);
        const sendPlanModeError = yield* adapter
          .sendTurn({
            threadId,
            input: "Hello",
            interactionMode: "plan",
          })
          .pipe(Effect.flip);
        const requestId = ApprovalRequestId.make("request-1");
        const respondToRequestError = yield* adapter
          .respondToRequest(threadId, requestId, "accept")
          .pipe(Effect.flip);
        const respondToUserInputError = yield* adapter
          .respondToUserInput(threadId, requestId, { question: "answer" })
          .pipe(Effect.flip);
        const rollbackError = yield* adapter.rollbackThread(threadId, 1).pipe(Effect.flip);

        assert.deepEqual(
          startProviderMismatch,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "startSession",
            issue: "sessionFile and resumeCursor.sessionFile must match when both are provided.",
          }),
        );
        assert.deepEqual(
          sendAttachmentsError,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "sendTurn",
            issue: "Pi sendTurn does not support attachments yet.",
          }),
        );
        assert.deepEqual(
          sendPlanModeError,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "sendTurn",
            issue: "Pi sendTurn does not support interactionMode 'plan' yet.",
          }),
        );
        assert.deepEqual(
          respondToRequestError,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "respondToRequest",
            issue:
              "Pi respondToRequest is not supported because the Pi bridge does not map approval callbacks yet.",
          }),
        );
        assert.deepEqual(
          respondToUserInputError,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "respondToUserInput",
            issue:
              "Pi respondToUserInput is not supported because the Pi bridge does not map user-input callbacks yet.",
          }),
        );
        assert.deepEqual(
          rollbackError,
          new ProviderAdapterValidationError({
            provider: "pi",
            operation: "rollbackThread",
            issue:
              "Pi rollbackThread is not supported because the bridge does not own Pi history mutation yet.",
          }),
        );

        yield* adapter.stopAll();
      }),
    );

    it.effect("keeps one thread turn snapshot across internal Pi tool-use turns", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const adapter = yield* PiProviderAdapterCandidate;
          const fakeSession = createMultiTurnToolUseSession();
          const threadId = ThreadId.make("thread-pi-bridge-multi-turn");

          yield* adapter.startSession({
            provider: "pi",
            threadId,
            cwd: process.cwd(),
            runtimeMode: "full-access",
            sdkLoader: createSdkLoader(fakeSession),
          });

          const turn = yield* adapter.sendTurn({
            threadId,
            input: "Inspect first, then answer.",
          });

          const threadSnapshot = yield* adapter.readThread(threadId);
          assert.equal(threadSnapshot.turns.length, 1);
          assert.equal(threadSnapshot.turns[0]?.id, turn.turnId);
          assert.deepEqual(
            threadSnapshot.turns[0]?.items.map((event) => event.type),
            [
              "turn.started",
              "item.started",
              "content.delta",
              "item.completed",
              "item.started",
              "item.completed",
              "item.started",
              "content.delta",
              "item.completed",
              "turn.completed",
              "session.state.changed",
            ],
          );

          const completed = threadSnapshot.turns[0]?.items.find(
            (event) => event.type === "turn.completed",
          );
          assert.equal(completed?.type, "turn.completed");
          if (completed?.type === "turn.completed") {
            assert.equal(completed.turnId, turn.turnId);
            assert.deepEqual(completed.payload, {
              state: "completed",
              stopReason: "stop",
            });
          }

          yield* adapter.stopAll();
        }),
      ),
    );
  });
});
