import { describe, expect, it, vi } from "vitest";

import {
  createPiSessionSpike,
  loadPiSdkModule,
  normalizePiSlashCommands,
  PiSdkShapeError,
  type PiSessionSpikeEvent,
} from "./piSdkSpike.ts";

function createFakeSession(overrides?: {
  sessionId?: string;
  sessionFile?: string;
  commands?: ReadonlyArray<{
    name: string;
    description?: string;
    source?: string;
    sourceInfo?: { path?: string };
  }>;
}) {
  let listener: ((event: unknown) => void) | undefined;

  const session = {
    sessionId: overrides?.sessionId ?? "pi-session-1",
    sessionFile: overrides?.sessionFile ?? "/tmp/pi-session-1.jsonl",
    bindExtensions: vi.fn(async () => {}),
    subscribe: vi.fn((nextListener: (event: unknown) => void) => {
      listener = nextListener;
      return () => {
        listener = undefined;
      };
    }),
    getCommands: vi.fn(
      () =>
        overrides?.commands ?? [
          {
            name: "skill:refactor",
            description: "Refactor the current code",
            source: "skill",
            sourceInfo: { path: "/skills/refactor/SKILL.md" },
          },
          {
            name: "review",
            description: "Review changes",
            source: "prompt",
            sourceInfo: { path: "/prompts/review.md" },
          },
        ],
    ),
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

  return {
    session,
    emit(event: unknown) {
      listener?.(event);
    },
  };
}

describe("normalizePiSlashCommands", () => {
  it("normalizes, deduplicates, and sorts slash commands", () => {
    const commands = normalizePiSlashCommands([
      {
        name: "review",
        description: "Review code",
        source: "prompt",
        sourceInfo: { path: "/prompts/review.md" },
      },
      {
        name: "review",
        description: "Duplicate",
        source: "prompt",
        sourceInfo: { path: "/prompts/review-2.md" },
      },
      {
        name: "deploy",
        source: "extension",
      },
      {
        name: "mystery",
        source: "something-else",
      },
    ]);

    expect(commands).toEqual([
      {
        name: "deploy",
        description: null,
        source: "extension",
        path: null,
      },
      {
        name: "review",
        description: "Review code",
        source: "prompt",
        path: "/prompts/review.md",
      },
      {
        name: "mystery",
        description: null,
        source: "unknown",
        path: null,
      },
    ]);
  });
});

describe("loadPiSdkModule", () => {
  it("rejects invalid module shapes early", async () => {
    await expect(
      loadPiSdkModule({
        packageEntryPath: "/fake/pi/index.js",
        loader: async () => ({ getAgentDir: () => "/tmp/pi" }),
      }),
    ).rejects.toBeInstanceOf(PiSdkShapeError);
  });
});

describe("createPiSessionSpike", () => {
  it("creates a spike host, binds extensions, normalizes commands, and maps runtime events", async () => {
    const fakeSession = createFakeSession();
    const dispose = vi.fn(async () => {});
    let rebindSession: ((session: typeof fakeSession.session) => Promise<void>) | undefined;

    const events: PiSessionSpikeEvent[] = [];
    const rawEvents: unknown[] = [];
    const spike = await createPiSessionSpike({
      cwd: process.cwd(),
      sessionFile: "/tmp/pi-session-1.jsonl",
      onEvent: (event) => {
        events.push(event);
      },
      onRawEvent: (event) => {
        rawEvents.push(event);
      },
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
            setRebindSession: (
              nextRebindSession?: (session: typeof fakeSession.session) => Promise<void>,
            ) => {
              rebindSession = nextRebindSession;
            },
          };
        }),
      }),
    });

    expect(fakeSession.session.bindExtensions).toHaveBeenCalledWith({});
    expect(rebindSession).toBeTypeOf("function");
    expect(spike.agentDir).toBe("/tmp/pi-agent");
    expect(spike.getSessionInfo()).toEqual({
      sessionId: "pi-session-1",
      sessionFile: "/tmp/pi-session-1.jsonl",
    });
    expect(spike.getRuntimeInfo()).toEqual({
      sessionId: "pi-session-1",
      sessionFile: "/tmp/pi-session-1.jsonl",
      diagnosticsCount: 1,
    });

    await expect(spike.getCommands()).resolves.toEqual([
      {
        name: "review",
        description: "Review changes",
        source: "prompt",
        path: "/prompts/review.md",
      },
      {
        name: "skill:refactor",
        description: "Refactor the current code",
        source: "skill",
        path: "/skills/refactor/SKILL.md",
      },
    ]);

    await spike.prompt("Bitte lies die wichtigsten Dateien.");
    await spike.abort();
    await spike.dispose();

    expect(fakeSession.session.prompt).toHaveBeenCalledWith("Bitte lies die wichtigsten Dateien.");
    expect(fakeSession.session.abort).toHaveBeenCalledTimes(1);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(events).toEqual([
      {
        type: "session.ready",
        cwd: process.cwd(),
        sessionId: "pi-session-1",
        sessionFile: "/tmp/pi-session-1.jsonl",
        diagnosticsCount: 1,
      },
      { type: "agent.started" },
      { type: "turn.started" },
      { type: "assistant.message.started" },
      { type: "assistant.text.delta", delta: "Hallo" },
      {
        type: "tool.started",
        toolName: "read",
        toolCallId: "tool-1",
        summary: '{"filePath":"README.md"}',
      },
      {
        type: "tool.updated",
        toolName: "read",
        toolCallId: "tool-1",
        summary: "Reading README.md",
      },
      {
        type: "tool.ended",
        toolName: "read",
        toolCallId: "tool-1",
        isError: false,
        summary: '{"summary":"Finished reading"}',
      },
      { type: "assistant.message.ended" },
      { type: "turn.ended" },
      { type: "agent.ended" },
    ]);
    expect(rawEvents).toHaveLength(10);
  });
});
