import { randomUUID } from "node:crypto";

import {
  EventId,
  RuntimeItemId,
  ThreadId,
  TurnId,
  type ContentDeltaPayload,
  type ItemLifecyclePayload,
  type ProviderRefs,
  type RuntimeErrorPayload,
  type RuntimeWarningPayload,
  type SessionExitedPayload,
  type SessionStartedPayload,
  type SessionStateChangedPayload,
  type ThreadStartedPayload,
  type TurnCompletedPayload,
  type TurnStartedPayload,
} from "@t3tools/contracts";

import {
  createPiSessionSpike,
  type CreatePiSessionSpikeOptions,
  type PiDiscoveredCommand,
} from "./piSdkSpike.ts";

const PROVIDER = "pi" as const;
const RAW_SOURCE = "pi.sdk.session-event" as const;
const COMPACTION_ITEM_PREFIX = "pi:compaction";
const SYNTHETIC_TURN_PREFIX = "pi:turn";
const ASSISTANT_ITEM_PREFIX = "pi:assistant";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function stringifyDetail(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimDetail(trimmed) : undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null || value === undefined) {
    return undefined;
  }
  try {
    const serialized = JSON.stringify(value);
    return serialized && serialized !== "{}" && serialized !== "[]"
      ? trimDetail(serialized)
      : undefined;
  } catch {
    return undefined;
  }
}

function trimDetail(value: string, limit = 240): string {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createdAtFromPiEvent(event: Record<string, unknown>, fallback: () => string): string {
  const timestamp =
    readNumber(event.timestamp) ??
    readNumber(isRecord(event.message) ? event.message.timestamp : undefined) ??
    readNumber(isRecord(event.partial) ? event.partial.timestamp : undefined);
  return timestamp !== undefined ? new Date(timestamp).toISOString() : fallback();
}

function isAssistantMessage(message: unknown): message is {
  role: "assistant";
  stopReason?: unknown;
  errorMessage?: unknown;
} {
  return isRecord(message) && message.role === "assistant";
}

function toToolLifecycleItemType(toolName: string): ItemLifecyclePayload["itemType"] {
  const normalized = toolName.toLowerCase();
  if (normalized.includes("bash") || normalized.includes("command")) {
    return "command_execution";
  }
  if (
    normalized.includes("edit") ||
    normalized.includes("write") ||
    normalized.includes("patch") ||
    normalized.includes("multiedit")
  ) {
    return "file_change";
  }
  if (normalized.includes("web")) {
    return "web_search";
  }
  if (normalized.includes("mcp")) {
    return "mcp_tool_call";
  }
  if (normalized.includes("image")) {
    return "image_view";
  }
  if (
    normalized.includes("task") ||
    normalized.includes("agent") ||
    normalized.includes("subagent")
  ) {
    return "collab_agent_tool_call";
  }
  return "dynamic_tool_call";
}

function turnStateFromAssistantMessage(message: unknown): TurnCompletedPayload["state"] {
  if (!isAssistantMessage(message)) {
    return "completed";
  }
  switch (readString(message.stopReason)) {
    case "error":
      return "failed";
    case "aborted":
      return "interrupted";
    default:
      return "completed";
  }
}

function providerRefsFromIds(input: {
  readonly providerTurnId?: string;
  readonly providerItemId?: string;
}): ProviderRefs | undefined {
  const refs: Record<string, string> = {};
  if (input.providerTurnId) {
    refs.providerTurnId = input.providerTurnId;
  }
  if (input.providerItemId) {
    refs.providerItemId = input.providerItemId;
  }
  return Object.keys(refs).length > 0 ? (refs as ProviderRefs) : undefined;
}

export interface PiRuntimeEventRaw {
  readonly source: typeof RAW_SOURCE;
  readonly method?: string;
  readonly payload: unknown;
}

interface PiRuntimeEventCandidateBase {
  readonly eventId: ReturnType<typeof EventId.make>;
  readonly provider: typeof PROVIDER;
  readonly threadId: ThreadId;
  readonly createdAt: string;
  readonly turnId?: TurnId;
  readonly itemId?: ReturnType<typeof RuntimeItemId.make>;
  readonly providerRefs?: ProviderRefs;
  readonly raw?: PiRuntimeEventRaw;
  readonly sessionSequence: number;
}

export type PiProviderRuntimeEventCandidate =
  | (PiRuntimeEventCandidateBase & {
      readonly type: "session.started";
      readonly payload: SessionStartedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "session.state.changed";
      readonly payload: SessionStateChangedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "session.exited";
      readonly payload: SessionExitedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "thread.started";
      readonly payload: ThreadStartedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "turn.started";
      readonly payload: TurnStartedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "turn.completed";
      readonly payload: TurnCompletedPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "item.started" | "item.updated" | "item.completed";
      readonly payload: ItemLifecyclePayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "content.delta";
      readonly payload: ContentDeltaPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "runtime.warning";
      readonly payload: RuntimeWarningPayload;
    })
  | (PiRuntimeEventCandidateBase & {
      readonly type: "runtime.error";
      readonly payload: RuntimeErrorPayload;
    });

export interface CreatePiAdapterCandidateOptions extends Omit<
  CreatePiSessionSpikeOptions,
  "onEvent" | "onRawEvent"
> {
  readonly threadId: ThreadId;
  readonly onEvent?: (event: PiProviderRuntimeEventCandidate) => void;
  readonly now?: () => string;
  readonly createEventId?: () => string;
}

export interface PiAdapterCandidate {
  readonly cwd: string;
  readonly threadId: ThreadId;
  readonly agentDir: string;
  getSessionInfo(): {
    readonly sessionId: string;
    readonly sessionFile: string | null;
  };
  getCommands(): Promise<ReadonlyArray<PiDiscoveredCommand>>;
  sendTurn(input: { readonly turnId: TurnId; readonly prompt: string }): Promise<void>;
  abort(): Promise<void>;
  dispose(): Promise<void>;
}

class PiRuntimeEventMapper {
  private readonly threadId: ThreadId;
  private readonly onEvent: (event: PiProviderRuntimeEventCandidate) => void;
  private readonly now: () => string;
  private readonly createEventId: () => string;
  private sessionSequence = 0;
  private pendingTurnIds: TurnId[] = [];
  private activeTurnId: TurnId | undefined;
  private lastSessionState: SessionStateChangedPayload["state"] | undefined;
  private syntheticTurnCounter = 0;
  private assistantMessageCounter = 0;
  private activeAssistantItemId: ReturnType<typeof RuntimeItemId.make> | undefined;
  private compactionCounter = 0;
  private activeCompactionItemId: ReturnType<typeof RuntimeItemId.make> | undefined;

  constructor(options: {
    readonly threadId: ThreadId;
    readonly onEvent?: (event: PiProviderRuntimeEventCandidate) => void;
    readonly now?: () => string;
    readonly createEventId?: () => string;
  }) {
    this.threadId = options.threadId;
    this.onEvent = options.onEvent ?? (() => {});
    this.now = options.now ?? nowIso;
    this.createEventId = options.createEventId ?? (() => randomUUID());
  }

  queueTurn(turnId: TurnId): void {
    this.pendingTurnIds.push(turnId);
  }

  dequeueQueuedTurn(turnId: TurnId): void {
    this.pendingTurnIds = this.pendingTurnIds.filter((queued) => queued !== turnId);
  }

  emitSessionReady(input: {
    readonly cwd: string;
    readonly sessionId: string;
    readonly sessionFile: string | null;
    readonly diagnosticsCount: number;
  }): void {
    this.emit({
      type: "session.started",
      payload: {
        message: "Pi session ready",
        resume: {
          cwd: input.cwd,
          sessionId: input.sessionId,
          ...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
        },
      },
    });
    this.emit({
      type: "session.state.changed",
      payload: {
        state: "ready",
        reason: "Pi session ready",
        detail: {
          sessionId: input.sessionId,
          ...(input.sessionFile ? { sessionFile: input.sessionFile } : {}),
        },
      },
    });
    this.emit({
      type: "thread.started",
      payload: {
        providerThreadId: input.sessionId,
      },
    });
    if (input.diagnosticsCount > 0) {
      this.emit({
        type: "runtime.warning",
        payload: {
          message: `Pi session reported ${input.diagnosticsCount} startup diagnostic${input.diagnosticsCount === 1 ? "" : "s"}.`,
          detail: { diagnosticsCount: input.diagnosticsCount },
        },
      });
    }
  }

  emitSessionDisposed(): void {
    this.emit({
      type: "session.state.changed",
      payload: {
        state: "stopped",
        reason: "Pi session disposed",
      },
    });
    this.emit({
      type: "session.exited",
      payload: {
        reason: "Pi session disposed",
        exitKind: "graceful",
      },
    });
  }

  mapRawEvent(rawEvent: unknown): void {
    if (!isRecord(rawEvent)) {
      return;
    }

    const type = readString(rawEvent.type);
    if (!type) {
      return;
    }

    switch (type) {
      case "agent_start": {
        this.emit({
          type: "session.state.changed",
          payload: {
            state: "running",
            reason: "Pi agent loop started",
          },
          raw: rawEvent,
        });
        return;
      }

      case "agent_end": {
        if (!this.activeTurnId) {
          this.emit({
            type: "session.state.changed",
            payload: {
              state: "ready",
              reason: "Pi agent loop finished",
            },
            raw: rawEvent,
          });
        }
        return;
      }

      case "turn_start": {
        const providerTurnId = readNumber(rawEvent.turnIndex);
        const turnId = this.pendingTurnIds.shift() ?? this.makeSyntheticTurnId();
        this.activeTurnId = turnId;
        this.assistantMessageCounter = 0;
        this.activeAssistantItemId = undefined;
        this.emit({
          type: "turn.started",
          turnId,
          payload: {},
          raw: rawEvent,
          createdAt: createdAtFromPiEvent(rawEvent, this.now),
          providerRefs:
            providerTurnId !== undefined
              ? providerRefsFromIds({ providerTurnId: String(providerTurnId) })
              : undefined,
        });
        return;
      }

      case "turn_end": {
        const turnId =
          this.activeTurnId ?? this.pendingTurnIds.shift() ?? this.makeSyntheticTurnId();
        const providerTurnId = readNumber(rawEvent.turnIndex);
        const message = isRecord(rawEvent.message) ? rawEvent.message : undefined;
        const turnState = turnStateFromAssistantMessage(message);
        this.emit({
          type: "turn.completed",
          turnId,
          payload: {
            state: turnState,
            ...(readString(message?.errorMessage)
              ? { errorMessage: readString(message?.errorMessage) }
              : {}),
            ...(readString(message?.stopReason)
              ? { stopReason: readString(message?.stopReason) }
              : {}),
          },
          raw: rawEvent,
          createdAt: createdAtFromPiEvent(rawEvent, this.now),
          providerRefs:
            providerTurnId !== undefined
              ? providerRefsFromIds({ providerTurnId: String(providerTurnId) })
              : undefined,
        });
        this.emit({
          type: "session.state.changed",
          turnId,
          payload: {
            state: "ready",
            reason:
              turnState === "failed"
                ? "Pi turn failed"
                : turnState === "interrupted"
                  ? "Pi turn interrupted"
                  : "Pi turn completed",
          },
          raw: rawEvent,
        });
        this.activeTurnId = undefined;
        this.activeAssistantItemId = undefined;
        return;
      }

      case "message_start": {
        const message = isRecord(rawEvent.message) ? rawEvent.message : undefined;
        if (!isAssistantMessage(message)) {
          return;
        }
        const turnId = this.ensureActiveTurnId();
        const itemId = this.makeAssistantItemId(turnId);
        this.activeAssistantItemId = itemId;
        this.emit({
          type: "item.started",
          turnId,
          itemId,
          payload: {
            itemType: "assistant_message",
            status: "inProgress",
            title: "Assistant message",
          },
          raw: rawEvent,
          createdAt: createdAtFromPiEvent(rawEvent, this.now),
        });
        return;
      }

      case "message_update": {
        const message = isRecord(rawEvent.message) ? rawEvent.message : undefined;
        if (!isAssistantMessage(message)) {
          return;
        }
        const assistantMessageEvent = isRecord(rawEvent.assistantMessageEvent)
          ? rawEvent.assistantMessageEvent
          : undefined;
        if (!assistantMessageEvent) {
          return;
        }
        const deltaType = readString(assistantMessageEvent.type);
        const delta = readString(assistantMessageEvent.delta);
        if (!deltaType || delta === undefined) {
          return;
        }
        const streamKind =
          deltaType === "text_delta"
            ? "assistant_text"
            : deltaType === "thinking_delta"
              ? "reasoning_text"
              : undefined;
        if (!streamKind) {
          return;
        }
        const turnId = this.ensureActiveTurnId();
        const itemId = this.activeAssistantItemId ?? this.makeAssistantItemId(turnId);
        this.activeAssistantItemId = itemId;
        this.emit({
          type: "content.delta",
          turnId,
          itemId,
          payload: {
            streamKind,
            delta,
            ...(readNumber(assistantMessageEvent.contentIndex) !== undefined
              ? { contentIndex: readNumber(assistantMessageEvent.contentIndex) }
              : {}),
          },
          raw: rawEvent,
          createdAt: createdAtFromPiEvent(rawEvent, this.now),
        });
        return;
      }

      case "message_end": {
        const message = isRecord(rawEvent.message) ? rawEvent.message : undefined;
        if (!isAssistantMessage(message) || !this.activeAssistantItemId) {
          return;
        }
        const turnId = this.ensureActiveTurnId();
        const itemId = this.activeAssistantItemId;
        this.emit({
          type: "item.completed",
          turnId,
          itemId,
          payload: {
            itemType: "assistant_message",
            status: readString(message.stopReason) === "error" ? "failed" : "completed",
            title: "Assistant message",
            ...(readString(message.errorMessage)
              ? { detail: readString(message.errorMessage) }
              : {}),
          },
          raw: rawEvent,
          createdAt: createdAtFromPiEvent(rawEvent, this.now),
        });
        this.activeAssistantItemId = undefined;
        return;
      }

      case "tool_execution_start": {
        const toolName = readString(rawEvent.toolName) ?? "tool";
        const toolCallId = readString(rawEvent.toolCallId) ?? `${toolName}:${this.createEventId()}`;
        const turnId = this.ensureActiveTurnId();
        this.emit({
          type: "item.started",
          turnId,
          itemId: RuntimeItemId.make(toolCallId),
          payload: {
            itemType: toToolLifecycleItemType(toolName),
            status: "inProgress",
            title: toolName,
            ...(stringifyDetail(rawEvent.args) ? { detail: stringifyDetail(rawEvent.args) } : {}),
            data: {
              toolName,
              ...(rawEvent.args !== undefined ? { args: rawEvent.args } : {}),
            },
          },
          raw: rawEvent,
          providerRefs: providerRefsFromIds({ providerItemId: toolCallId }),
        });
        return;
      }

      case "tool_execution_update": {
        const toolName = readString(rawEvent.toolName) ?? "tool";
        const toolCallId = readString(rawEvent.toolCallId) ?? `${toolName}:${this.createEventId()}`;
        const turnId = this.ensureActiveTurnId();
        this.emit({
          type: "item.updated",
          turnId,
          itemId: RuntimeItemId.make(toolCallId),
          payload: {
            itemType: toToolLifecycleItemType(toolName),
            status: "inProgress",
            title: toolName,
            ...(stringifyDetail(rawEvent.partialResult)
              ? { detail: stringifyDetail(rawEvent.partialResult) }
              : {}),
            data: {
              toolName,
              ...(rawEvent.args !== undefined ? { args: rawEvent.args } : {}),
              ...(rawEvent.partialResult !== undefined
                ? { partialResult: rawEvent.partialResult }
                : {}),
            },
          },
          raw: rawEvent,
          providerRefs: providerRefsFromIds({ providerItemId: toolCallId }),
        });
        return;
      }

      case "tool_execution_end": {
        const toolName = readString(rawEvent.toolName) ?? "tool";
        const toolCallId = readString(rawEvent.toolCallId) ?? `${toolName}:${this.createEventId()}`;
        const turnId = this.ensureActiveTurnId();
        const isError = readBoolean(rawEvent.isError) ?? false;
        this.emit({
          type: "item.completed",
          turnId,
          itemId: RuntimeItemId.make(toolCallId),
          payload: {
            itemType: toToolLifecycleItemType(toolName),
            status: isError ? "failed" : "completed",
            title: toolName,
            ...(stringifyDetail(rawEvent.result)
              ? { detail: stringifyDetail(rawEvent.result) }
              : {}),
            data: {
              toolName,
              isError,
              ...(rawEvent.result !== undefined ? { result: rawEvent.result } : {}),
            },
          },
          raw: rawEvent,
          providerRefs: providerRefsFromIds({ providerItemId: toolCallId }),
        });
        return;
      }

      case "compaction_start": {
        const turnId = this.activeTurnId;
        const itemId = RuntimeItemId.make(`${COMPACTION_ITEM_PREFIX}:${++this.compactionCounter}`);
        this.activeCompactionItemId = itemId;
        this.emit({
          type: "item.started",
          ...(turnId ? { turnId } : {}),
          itemId,
          payload: {
            itemType: "context_compaction",
            status: "inProgress",
            title: "Context compaction",
            ...(readString(rawEvent.reason) ? { detail: readString(rawEvent.reason) } : {}),
          },
          raw: rawEvent,
        });
        return;
      }

      case "compaction_end": {
        const itemId =
          this.activeCompactionItemId ??
          RuntimeItemId.make(`${COMPACTION_ITEM_PREFIX}:${++this.compactionCounter}`);
        const turnId = this.activeTurnId;
        const isFailure =
          (readBoolean(rawEvent.aborted) ?? false) ||
          readString(rawEvent.errorMessage) !== undefined;
        this.emit({
          type: "item.completed",
          ...(turnId ? { turnId } : {}),
          itemId,
          payload: {
            itemType: "context_compaction",
            status: isFailure ? "failed" : "completed",
            title: "Context compaction",
            ...(readString(rawEvent.errorMessage)
              ? { detail: readString(rawEvent.errorMessage) }
              : readString(rawEvent.reason)
                ? { detail: readString(rawEvent.reason) }
                : {}),
            data: {
              ...(readBoolean(rawEvent.aborted) !== undefined
                ? { aborted: readBoolean(rawEvent.aborted) }
                : {}),
              ...(readBoolean(rawEvent.willRetry) !== undefined
                ? { willRetry: readBoolean(rawEvent.willRetry) }
                : {}),
            },
          },
          raw: rawEvent,
        });
        this.activeCompactionItemId = undefined;
        if (readBoolean(rawEvent.willRetry) ?? false) {
          this.emit({
            type: "runtime.warning",
            ...(turnId ? { turnId } : {}),
            payload: {
              message: "Pi context compaction will retry.",
              detail: rawEvent,
            },
            raw: rawEvent,
          });
        }
        return;
      }

      case "auto_retry_start": {
        const turnId = this.activeTurnId;
        const attempt = readNumber(rawEvent.attempt);
        const maxAttempts = readNumber(rawEvent.maxAttempts);
        this.emit({
          type: "runtime.warning",
          ...(turnId ? { turnId } : {}),
          payload: {
            message:
              attempt !== undefined && maxAttempts !== undefined
                ? `Pi auto-retry ${attempt}/${maxAttempts} started.`
                : "Pi auto-retry started.",
            detail: rawEvent,
          },
          raw: rawEvent,
        });
        return;
      }

      case "auto_retry_end": {
        if (readBoolean(rawEvent.success) ?? false) {
          return;
        }
        const turnId = this.activeTurnId;
        this.emit({
          type: "runtime.error",
          ...(turnId ? { turnId } : {}),
          payload: {
            message: readString(rawEvent.finalError) ?? "Pi auto-retry exhausted.",
            class: "provider_error",
            detail: rawEvent,
          },
          raw: rawEvent,
        });
        return;
      }

      default:
        return;
    }
  }

  private ensureActiveTurnId(): TurnId {
    if (this.activeTurnId) {
      return this.activeTurnId;
    }
    const queued = this.pendingTurnIds.shift();
    if (queued) {
      this.activeTurnId = queued;
      return queued;
    }
    const synthetic = this.makeSyntheticTurnId();
    this.activeTurnId = synthetic;
    return synthetic;
  }

  private makeSyntheticTurnId(): TurnId {
    this.syntheticTurnCounter += 1;
    return TurnId.make(`${SYNTHETIC_TURN_PREFIX}:${this.syntheticTurnCounter}`);
  }

  private makeAssistantItemId(turnId: TurnId): ReturnType<typeof RuntimeItemId.make> {
    this.assistantMessageCounter += 1;
    return RuntimeItemId.make(`${ASSISTANT_ITEM_PREFIX}:${turnId}:${this.assistantMessageCounter}`);
  }

  private emit(input: {
    readonly type: PiProviderRuntimeEventCandidate["type"];
    readonly payload: PiProviderRuntimeEventCandidate["payload"];
    readonly turnId?: TurnId;
    readonly itemId?: ReturnType<typeof RuntimeItemId.make>;
    readonly createdAt?: string;
    readonly raw?: unknown;
    readonly providerRefs?: ProviderRefs | undefined;
  }): void {
    if (input.type === "session.state.changed") {
      const nextState = (input.payload as SessionStateChangedPayload).state;
      if (this.lastSessionState === nextState) {
        return;
      }
      this.lastSessionState = nextState;
    }

    this.sessionSequence += 1;
    this.onEvent({
      eventId: EventId.make(this.createEventId()),
      provider: PROVIDER,
      threadId: this.threadId,
      createdAt: input.createdAt ?? this.now(),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      ...(input.itemId ? { itemId: input.itemId } : {}),
      ...(input.providerRefs ? { providerRefs: input.providerRefs } : {}),
      ...(input.raw !== undefined
        ? {
            raw: {
              source: RAW_SOURCE,
              method: readString(isRecord(input.raw) ? input.raw.type : undefined),
              payload: input.raw,
            },
          }
        : {}),
      sessionSequence: this.sessionSequence,
      type: input.type,
      payload: input.payload,
    } as PiProviderRuntimeEventCandidate);
  }
}

export async function createPiAdapterCandidate(
  options: CreatePiAdapterCandidateOptions,
): Promise<PiAdapterCandidate> {
  const mapper = new PiRuntimeEventMapper({
    threadId: options.threadId,
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
    ...(options.now ? { now: options.now } : {}),
    ...(options.createEventId ? { createEventId: options.createEventId } : {}),
  });

  const spike = await createPiSessionSpike({
    cwd: options.cwd,
    ...(options.agentDir !== undefined ? { agentDir: options.agentDir } : {}),
    ...(options.sessionFile !== undefined ? { sessionFile: options.sessionFile } : {}),
    ...(options.packageEntryPath !== undefined
      ? { packageEntryPath: options.packageEntryPath }
      : {}),
    ...(options.sdkLoader !== undefined ? { sdkLoader: options.sdkLoader } : {}),
    onRawEvent: (event) => {
      mapper.mapRawEvent(event);
    },
  });

  const runtimeInfo = spike.getRuntimeInfo();
  mapper.emitSessionReady({
    cwd: options.cwd,
    sessionId: runtimeInfo.sessionId,
    sessionFile: runtimeInfo.sessionFile,
    diagnosticsCount: runtimeInfo.diagnosticsCount,
  });

  let disposed = false;

  return {
    cwd: spike.cwd,
    threadId: options.threadId,
    agentDir: spike.agentDir,
    getSessionInfo() {
      return spike.getSessionInfo();
    },
    async getCommands() {
      return spike.getCommands();
    },
    async sendTurn(input) {
      mapper.queueTurn(input.turnId);
      try {
        await spike.prompt(input.prompt);
      } catch (error) {
        mapper.dequeueQueuedTurn(input.turnId);
        throw error;
      }
    },
    async abort() {
      await spike.abort();
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      await spike.dispose();
      mapper.emitSessionDisposed();
    },
  } satisfies PiAdapterCandidate;
}
