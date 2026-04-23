import { describe, expect, it, vi } from "vitest";
import { ThreadId, TurnId } from "@t3tools/contracts";

import {
  createPiAdapterCandidate,
  type PiProviderRuntimeEventCandidate,
} from "./piAdapterCandidate.ts";

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
    prompt: vi.fn(async () => {
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
        type: "message_update",
        message: { role: "assistant", timestamp: 1710000000001 },
        assistantMessageEvent: { type: "thinking_delta", contentIndex: 1, delta: "Denke" },
      });
      listener?.({
        type: "tool_execution_start",
        toolName: "read",
        toolCallId: "tool-1",
        args: { filePath: "README.md" },
      });
      listener?.({
        type: "tool_execution_update",
        toolName: "read",
        toolCallId: "tool-1",
        args: { filePath: "README.md" },
        partialResult: "Reading README.md",
      });
      listener?.({
        type: "tool_execution_end",
        toolName: "read",
        toolCallId: "tool-1",
        isError: false,
        result: { summary: "Finished reading" },
      });
      listener?.({ type: "compaction_start", reason: "threshold" });
      listener?.({
        type: "compaction_end",
        reason: "threshold",
        aborted: false,
        willRetry: true,
        errorMessage: "Compaction output too large",
      });
      listener?.({
        type: "auto_retry_start",
        attempt: 1,
        maxAttempts: 2,
        delayMs: 500,
        errorMessage: "Rate limited",
      });
      listener?.({
        type: "auto_retry_end",
        success: false,
        attempt: 2,
        finalError: "Still rate limited",
      });
      listener?.({
        type: "message_end",
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "Model exploded",
          timestamp: 1710000000002,
        },
      });
      listener?.({
        type: "turn_end",
        turnIndex: 1,
        message: {
          role: "assistant",
          stopReason: "error",
          errorMessage: "Model exploded",
          timestamp: 1710000000002,
        },
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
    sessionId: "pi-session-multi-turn-1",
    sessionFile: "/tmp/pi-session-multi-turn-1.jsonl",
    bindExtensions: vi.fn(async () => {}),
    subscribe: vi.fn((nextListener: (event: unknown) => void) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
    getCommands: vi.fn(() => []),
    prompt: vi.fn(async () => {
      listener?.({ type: "agent_start" });

      listener?.({ type: "turn_start", turnIndex: 1, timestamp: 1710000000000 });
      listener?.({
        type: "message_start",
        message: { role: "assistant", timestamp: 1710000000000 },
      });
      listener?.({
        type: "message_update",
        message: { role: "assistant", timestamp: 1710000000001 },
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Ich prüfe erst." },
      });
      listener?.({
        type: "message_end",
        message: { role: "assistant", stopReason: "toolUse", timestamp: 1710000000002 },
      });
      listener?.({
        type: "tool_execution_start",
        toolName: "find",
        toolCallId: "tool-find-1",
        args: { path: ".plans" },
      });
      listener?.({
        type: "tool_execution_end",
        toolName: "find",
        toolCallId: "tool-find-1",
        isError: false,
        result: [".plans/pi-provider-progress.md"],
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
        assistantMessageEvent: { type: "text_delta", contentIndex: 0, delta: "Jetzt die Antwort." },
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

describe("createPiAdapterCandidate", () => {
  it("maps Pi session events into provider-runtime-shaped candidate events", async () => {
    const fakeSession = createFakeSession();
    const dispose = vi.fn(async () => {});
    const events: PiProviderRuntimeEventCandidate[] = [];

    const candidate = await createPiAdapterCandidate({
      cwd: process.cwd(),
      threadId: ThreadId.make("thread-pi-1"),
      sessionFile: "/tmp/pi-session-1.jsonl",
      onEvent: (event) => {
        events.push(event);
      },
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
            dispose,
          };
        }),
      }),
    });

    const turnId = TurnId.make("turn-pi-1");

    await expect(candidate.getCommands()).resolves.toEqual([
      {
        name: "review",
        description: "Review changes",
        source: "prompt",
        path: "/prompts/review.md",
      },
    ]);

    await candidate.sendTurn({
      turnId,
      prompt: "Bitte lies die wichtigsten Dateien.",
    });
    await candidate.abort();
    await candidate.dispose();

    expect(candidate.agentDir).toBe("/tmp/pi-agent");
    expect(candidate.getSessionInfo()).toEqual({
      sessionId: "pi-session-1",
      sessionFile: "/tmp/pi-session-1.jsonl",
    });
    expect(fakeSession.session.prompt).toHaveBeenCalledWith("Bitte lies die wichtigsten Dateien.");
    expect(fakeSession.session.abort).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);

    expect(events.map((event) => event.type)).toEqual([
      "session.started",
      "session.state.changed",
      "thread.started",
      "runtime.warning",
      "session.state.changed",
      "turn.started",
      "item.started",
      "content.delta",
      "content.delta",
      "item.started",
      "item.updated",
      "item.completed",
      "item.started",
      "item.completed",
      "runtime.warning",
      "runtime.warning",
      "runtime.error",
      "item.completed",
      "turn.completed",
      "session.state.changed",
      "session.state.changed",
      "session.exited",
    ]);

    expect(events.every((event, index) => event.sessionSequence === index + 1)).toBe(true);

    expect(events[0]).toMatchObject({
      provider: "pi",
      threadId: ThreadId.make("thread-pi-1"),
      type: "session.started",
      payload: {
        message: "Pi session ready",
        resume: {
          cwd: process.cwd(),
          sessionId: "pi-session-1",
          sessionFile: "/tmp/pi-session-1.jsonl",
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: "session.state.changed",
      payload: { state: "ready", reason: "Pi session ready" },
    });
    expect(events[3]).toMatchObject({
      type: "runtime.warning",
      payload: {
        message: "Pi session reported 1 startup diagnostic.",
        detail: { diagnosticsCount: 1 },
      },
    });
    expect(events[5]).toMatchObject({
      type: "turn.started",
      turnId,
      providerRefs: { providerTurnId: "1" },
    });
    expect(events[6]).toMatchObject({
      type: "item.started",
      turnId,
      payload: {
        itemType: "assistant_message",
        status: "inProgress",
        title: "Assistant message",
      },
    });
    expect(events[7]).toMatchObject({
      type: "content.delta",
      turnId,
      payload: {
        streamKind: "assistant_text",
        delta: "Hallo",
        contentIndex: 0,
      },
    });
    expect(events[8]).toMatchObject({
      type: "content.delta",
      turnId,
      payload: {
        streamKind: "reasoning_text",
        delta: "Denke",
        contentIndex: 1,
      },
    });
    expect(events[9]).toMatchObject({
      type: "item.started",
      turnId,
      itemId: "tool-1",
      providerRefs: { providerItemId: "tool-1" },
      payload: {
        itemType: "dynamic_tool_call",
        status: "inProgress",
        title: "read",
        detail: '{"filePath":"README.md"}',
      },
    });
    expect(events[10]).toMatchObject({
      type: "item.updated",
      turnId,
      itemId: "tool-1",
      payload: {
        itemType: "dynamic_tool_call",
        status: "inProgress",
        title: "read",
        detail: "Reading README.md",
      },
    });
    expect(events[11]).toMatchObject({
      type: "item.completed",
      turnId,
      itemId: "tool-1",
      payload: {
        itemType: "dynamic_tool_call",
        status: "completed",
        title: "read",
        detail: '{"summary":"Finished reading"}',
      },
    });
    expect(events[12]).toMatchObject({
      type: "item.started",
      turnId,
      payload: {
        itemType: "context_compaction",
        status: "inProgress",
        title: "Context compaction",
        detail: "threshold",
      },
    });
    expect(events[13]).toMatchObject({
      type: "item.completed",
      turnId,
      payload: {
        itemType: "context_compaction",
        status: "failed",
        title: "Context compaction",
        detail: "Compaction output too large",
      },
    });
    expect(events[14]).toMatchObject({
      type: "runtime.warning",
      turnId,
      payload: {
        message: "Pi context compaction will retry.",
      },
    });
    expect(events[15]).toMatchObject({
      type: "runtime.warning",
      turnId,
      payload: {
        message: "Pi auto-retry 1/2 started.",
      },
    });
    expect(events[16]).toMatchObject({
      type: "runtime.error",
      turnId,
      payload: {
        message: "Still rate limited",
        class: "provider_error",
      },
    });
    expect(events[17]).toMatchObject({
      type: "item.completed",
      turnId,
      payload: {
        itemType: "assistant_message",
        status: "failed",
        title: "Assistant message",
        detail: "Model exploded",
      },
    });
    expect(events[18]).toMatchObject({
      type: "turn.completed",
      turnId,
      providerRefs: { providerTurnId: "1" },
      payload: {
        state: "failed",
        stopReason: "error",
        errorMessage: "Model exploded",
      },
    });
    expect(events[19]).toMatchObject({
      type: "session.state.changed",
      turnId,
      payload: {
        state: "ready",
        reason: "Pi turn failed",
      },
    });
    expect(events[20]).toMatchObject({
      type: "session.state.changed",
      payload: {
        state: "stopped",
        reason: "Pi session disposed",
      },
    });
    expect(events[21]).toMatchObject({
      type: "session.exited",
      payload: {
        reason: "Pi session disposed",
        exitKind: "graceful",
      },
    });
  });

  it("keeps one visible turn across internal Pi tool-use boundaries", async () => {
    const fakeSession = createMultiTurnToolUseSession();
    const events: PiProviderRuntimeEventCandidate[] = [];

    const candidate = await createPiAdapterCandidate({
      cwd: process.cwd(),
      threadId: ThreadId.make("thread-pi-multi-turn-1"),
      sessionFile: "/tmp/pi-session-multi-turn-1.jsonl",
      onEvent: (event) => {
        events.push(event);
      },
      now: () => "2026-04-23T12:00:00.000Z",
      createEventId: (() => {
        let index = 0;
        return () => `event-multi-${++index}`;
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
          diagnostics: [],
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
            diagnostics: [],
            dispose: vi.fn(async () => {}),
          };
        }),
      }),
    });

    const turnId = TurnId.make("turn-pi-multi-turn-1");

    await candidate.sendTurn({
      turnId,
      prompt: "Please inspect the plan docs and then answer.",
    });

    const turnStartedEvents = events.filter((event) => event.type === "turn.started");
    const turnCompletedEvents = events.filter((event) => event.type === "turn.completed");
    const readyEvents = events.filter(
      (event) => event.type === "session.state.changed" && event.payload.state === "ready",
    );
    const assistantMessageStarts = events.filter(
      (event) => event.type === "item.started" && event.payload.itemType === "assistant_message",
    );

    expect(turnStartedEvents).toHaveLength(1);
    expect(turnStartedEvents[0]).toMatchObject({
      turnId,
      providerRefs: { providerTurnId: "1" },
    });

    expect(turnCompletedEvents).toHaveLength(1);
    expect(turnCompletedEvents[0]).toMatchObject({
      turnId,
      providerRefs: { providerTurnId: "2" },
      payload: {
        state: "completed",
        stopReason: "stop",
      },
    });

    expect(readyEvents).toHaveLength(2);
    expect(readyEvents[0]).toMatchObject({
      payload: { state: "ready", reason: "Pi session ready" },
    });
    expect(readyEvents[1]).toMatchObject({
      turnId,
      payload: { state: "ready", reason: "Pi turn completed" },
    });

    expect(assistantMessageStarts).toHaveLength(2);
    expect(assistantMessageStarts[0]?.turnId).toBe(turnId);
    expect(assistantMessageStarts[0]?.itemId).toBe(`pi:assistant:${turnId}:1`);
    expect(assistantMessageStarts[1]?.turnId).toBe(turnId);
    expect(assistantMessageStarts[1]?.itemId).toBe(`pi:assistant:${turnId}:2`);

    expect(events.some((event) => event.turnId === TurnId.make("pi:turn:1"))).toBe(false);
  });
});
