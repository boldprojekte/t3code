import { EventId, RuntimeItemId, ThreadId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vitest";

import {
  formatPiProviderRuntimeEventSummary,
  parsePiProviderExerciserArgs,
} from "./piProviderExerciser.ts";

describe("parsePiProviderExerciserArgs", () => {
  it("parses defaults and resolves paths", () => {
    const parsed = parsePiProviderExerciserArgs(["--cwd", "./apps/server"], {
      processCwd: "/repo",
      now: () => 123,
    });

    expect(parsed).toEqual({
      help: false,
      cwd: "/repo/apps/server",
      threadId: "pi-exerciser-123",
      runtimeMode: "full-access",
      turnTimeoutMs: 120_000,
      stopAllAfter: true,
      turns: [
        {
          label: "main",
          prompt:
            "List the most relevant files in this repository, explain why they matter, and do not modify any files.",
        },
      ],
    });
  });

  it("creates a second abort turn when abort prompt is provided", () => {
    const parsed = parsePiProviderExerciserArgs(
      [
        "--prompt",
        "Inspect the repository.",
        "--abort-prompt",
        "Keep exploring until interrupted.",
        "--abort-after-ms",
        "750",
        "--session-file",
        "./tmp/session.jsonl",
        "--events-file",
        "./logs/pi.jsonl",
        "--runtime-mode",
        "approval-required",
        "--no-stop-all",
      ],
      {
        processCwd: "/repo",
        now: () => 5,
      },
    );

    expect(parsed).toEqual({
      help: false,
      cwd: "/repo",
      threadId: "pi-exerciser-5",
      runtimeMode: "approval-required",
      sessionFile: "/repo/tmp/session.jsonl",
      eventsFile: "/repo/logs/pi.jsonl",
      turnTimeoutMs: 120_000,
      stopAllAfter: false,
      turns: [
        {
          label: "main",
          prompt: "Inspect the repository.",
        },
        {
          label: "abort",
          prompt: "Keep exploring until interrupted.",
          abortAfterMs: 750,
        },
      ],
    });
  });
});

describe("formatPiProviderRuntimeEventSummary", () => {
  it("summarizes content delta events compactly", () => {
    expect(
      formatPiProviderRuntimeEventSummary({
        eventId: EventId.make("event-1"),
        provider: "pi",
        threadId: ThreadId.make("thread-1"),
        createdAt: "2026-04-23T12:00:00.000Z",
        turnId: TurnId.make("turn-1"),
        itemId: RuntimeItemId.make("item-1"),
        sessionSequence: 7,
        type: "content.delta",
        payload: {
          streamKind: "assistant_text",
          delta: "Hello from Pi",
        },
      }),
    ).toBe("seq=7 turn=turn-1 item=item-1 content.delta assistant_text: Hello from Pi");
  });

  it("summarizes session state changes with reason", () => {
    expect(
      formatPiProviderRuntimeEventSummary({
        eventId: EventId.make("event-2"),
        provider: "pi",
        threadId: ThreadId.make("thread-1"),
        createdAt: "2026-04-23T12:00:00.000Z",
        sessionSequence: 2,
        type: "session.state.changed",
        payload: {
          state: "ready",
          reason: "Pi session ready",
        },
      }),
    ).toBe("seq=2 session.state.changed ready: Pi session ready");
  });
});
