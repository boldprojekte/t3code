import { ThreadId, TurnId } from "@t3tools/contracts";
import { it, assert } from "@effect/vitest";
import { Effect, Fiber, Ref, Stream } from "effect";
import { describe, vi } from "vitest";

import { ProviderAdapterSessionNotFoundError, ProviderAdapterValidationError } from "../Errors.ts";
import { PiAdapterCandidate } from "../Services/PiAdapterCandidate.ts";
import type { PiProviderRuntimeEventCandidate } from "../piAdapterCandidate.ts";
import { PiAdapterCandidateLive } from "./PiAdapterCandidate.ts";

function createFakeSession() {
  let listener: ((event: unknown) => void) | undefined;

  const session = {
    sessionId: "pi-session-1",
    sessionFile: "/tmp/pi-session-1.jsonl",
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
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: "tool-1",
        args: { filePath: "README.md" },
      });
      listener?.({
        type: "tool_execution_end",
        toolName: "read",
        toolCallId: "tool-1",
        isError: false,
        result: { summary: "Finished reading" },
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

describe("PiAdapterCandidateLive", () => {
  const layer = it.layer(PiAdapterCandidateLive);

  layer("PiAdapterCandidateLive", (it) => {
    it.effect(
      "starts a Pi session, proxies commands and turns, and publishes candidate runtime events",
      () =>
        Effect.scoped(
          Effect.gen(function* () {
            const adapter = yield* PiAdapterCandidate;
            const fakeSession = createFakeSession();
            const eventsRef = yield* Ref.make<Array<PiProviderRuntimeEventCandidate>>([]);
            const streamFiber = yield* adapter.streamEvents.pipe(
              Stream.runForEach((event) => Ref.update(eventsRef, (events) => [...events, event])),
              Effect.forkScoped,
            );
            yield* Effect.yieldNow;

            const threadId = ThreadId.make("thread-pi-service-1");
            const session = yield* adapter.startSession({
              threadId,
              cwd: process.cwd(),
              sessionFile: "/tmp/pi-session-1.jsonl",
              now: () => "2026-04-22T12:00:00.000Z",
              createEventId: (() => {
                let index = 0;
                return () => `event-${++index}`;
              })(),
              sdkLoader: async () => ({
                getAgentDir: () => "/tmp/pi-agent",
                SessionManager: {
                  create: vi.fn((cwd: string) => ({ cwd })),
                  open: vi.fn((sessionFile: string) => ({ sessionFile })),
                },
                createAgentSessionServices: vi.fn(async ({ cwd, agentDir }) => ({
                  cwd,
                  agentDir,
                  diagnostics: ["resource warning"],
                })),
                createAgentSessionFromServices: vi.fn(async ({ services }) => ({
                  session: fakeSession.session,
                  diagnostics: services.diagnostics,
                })),
                createAgentSessionRuntime: vi.fn(async (createRuntime, options) => {
                  await createRuntime({
                    cwd: options.cwd,
                    agentDir: options.agentDir,
                    sessionManager: options.sessionManager,
                  });

                  return {
                    session: fakeSession.session,
                    diagnostics: ["resource warning"],
                    dispose: vi.fn(async () => {}),
                  };
                }),
              }),
            });

            assert.equal(session.provider, "pi");
            assert.equal(session.threadId, threadId);
            assert.equal(session.cwd, process.cwd());
            assert.equal(session.agentDir, "/tmp/pi-agent");
            assert.equal(session.sessionId, "pi-session-1");
            assert.equal(session.sessionFile, "/tmp/pi-session-1.jsonl");
            assert.equal(typeof session.startedAt, "string");
            assert.equal(yield* adapter.hasSession(threadId), true);
            assert.deepEqual(yield* adapter.getSession(threadId), session);
            assert.deepEqual(yield* adapter.listSessions(), [session]);
            assert.deepEqual(yield* adapter.getCommands(threadId), [
              {
                name: "review",
                description: "Review changes",
                source: "prompt",
                path: "/prompts/review.md",
              },
            ]);

            yield* adapter.sendTurn({
              threadId,
              turnId: TurnId.make("turn-pi-service-1"),
              prompt: "Bitte lies die wichtigsten Dateien.",
            });
            yield* adapter.abortTurn(threadId);
            yield* adapter.stopSession(threadId);
            yield* Effect.yieldNow;
            yield* Effect.yieldNow;
            yield* Effect.yieldNow;
            yield* Effect.yieldNow;
            yield* Effect.yieldNow;

            const events = yield* Ref.get(eventsRef);
            assert.deepEqual(
              events.map((event) => event.type),
              [
                "session.started",
                "session.state.changed",
                "thread.started",
                "runtime.warning",
                "session.state.changed",
                "turn.started",
                "item.started",
                "content.delta",
                "item.started",
                "item.completed",
                "item.completed",
                "turn.completed",
                "session.state.changed",
                "session.state.changed",
                "session.exited",
              ],
            );
            assert.equal(
              events.every((event, index) => event.sessionSequence === index + 1),
              true,
            );
            assert.equal(yield* adapter.hasSession(threadId), false);
            assert.deepEqual(yield* adapter.listSessions(), []);
            assert.equal(
              fakeSession.session.prompt.mock.calls[0]?.[0],
              "Bitte lies die wichtigsten Dateien.",
            );
            assert.equal(fakeSession.session.abort.mock.calls.length, 1);

            yield* Fiber.interrupt(streamFiber);
          }),
        ),
    );

    it.effect("fails unknown-thread operations with ProviderAdapterSessionNotFoundError", () =>
      Effect.gen(function* () {
        const adapter = yield* PiAdapterCandidate;
        const threadId = ThreadId.make("thread-pi-missing");

        const getSessionError = yield* adapter.getSession(threadId).pipe(Effect.flip);
        const commandsError = yield* adapter.getCommands(threadId).pipe(Effect.flip);
        const sendTurnError = yield* adapter
          .sendTurn({
            threadId,
            turnId: TurnId.make("turn-pi-missing"),
            prompt: "Hello",
          })
          .pipe(Effect.flip);

        assert.deepEqual(
          getSessionError,
          new ProviderAdapterSessionNotFoundError({ provider: "pi", threadId }),
        );
        assert.deepEqual(
          commandsError,
          new ProviderAdapterSessionNotFoundError({ provider: "pi", threadId }),
        );
        assert.deepEqual(
          sendTurnError,
          new ProviderAdapterSessionNotFoundError({ provider: "pi", threadId }),
        );
      }),
    );

    it.effect(
      "rejects duplicate sessions and empty prompts with ProviderAdapterValidationError",
      () =>
        Effect.gen(function* () {
          const adapter = yield* PiAdapterCandidate;
          const fakeSession = createFakeSession();
          const threadId = ThreadId.make("thread-pi-validation");

          yield* adapter.startSession({
            threadId,
            cwd: process.cwd(),
            sdkLoader: async () => ({
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
            }),
          });

          const duplicateError = yield* adapter
            .startSession({
              threadId,
              cwd: process.cwd(),
              sdkLoader: async () => ({
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
              }),
            })
            .pipe(Effect.flip);
          const promptError = yield* adapter
            .sendTurn({
              threadId,
              turnId: TurnId.make("turn-pi-validation"),
              prompt: "   ",
            })
            .pipe(Effect.flip);

          assert.deepEqual(
            duplicateError,
            new ProviderAdapterValidationError({
              provider: "pi",
              operation: "startSession",
              issue: `thread '${threadId}' already has an active Pi session.`,
            }),
          );
          assert.deepEqual(
            promptError,
            new ProviderAdapterValidationError({
              provider: "pi",
              operation: "sendTurn",
              issue: "prompt must not be empty.",
            }),
          );

          yield* adapter.stopAll();
        }),
    );
  });
});
