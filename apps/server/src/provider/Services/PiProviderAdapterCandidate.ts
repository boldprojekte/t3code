import { Context } from "effect";
import type { Effect, Stream } from "effect";
import type {
  ApprovalRequestId,
  ChatAttachment,
  ModelSelection,
  ProviderApprovalDecision,
  ProviderInteractionMode,
  ProviderUserInputAnswers,
  RuntimeMode,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";

import type { ProviderAdapterError } from "../Errors.ts";
import type { PiProviderRuntimeEventCandidate } from "../piAdapterCandidate.ts";
import type { PiDiscoveredCommand } from "../piSdkSpike.ts";
import type { ProviderAdapterCapabilities } from "./ProviderAdapter.ts";
import type { PiAdapterCandidateStartInput } from "./PiAdapterCandidate.ts";

export interface PiProviderAdapterCandidateResumeCursor {
  readonly sessionFile: string;
}

export interface PiProviderAdapterCandidateSession {
  readonly provider: "pi";
  readonly status: "connecting" | "ready" | "running" | "error" | "closed";
  readonly runtimeMode: RuntimeMode;
  readonly cwd: string;
  readonly threadId: ThreadId;
  readonly resumeCursor?: PiProviderAdapterCandidateResumeCursor;
  readonly activeTurnId?: TurnId;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastError?: string;
  readonly agentDir: string;
  readonly sessionId: string;
  readonly sessionFile: string | null;
}

export interface PiProviderAdapterCandidateStartInput extends PiAdapterCandidateStartInput {
  readonly provider?: "pi";
  readonly runtimeMode: RuntimeMode;
  readonly resumeCursor?: PiProviderAdapterCandidateResumeCursor;
  readonly modelSelection?: ModelSelection;
}

export interface PiProviderAdapterCandidateSendTurnInput {
  readonly threadId: ThreadId;
  readonly input?: string;
  readonly attachments?: ReadonlyArray<ChatAttachment>;
  readonly modelSelection?: ModelSelection;
  readonly interactionMode?: ProviderInteractionMode;
}

export interface PiProviderAdapterCandidateTurnStartResult {
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly resumeCursor?: PiProviderAdapterCandidateResumeCursor;
}

export interface PiProviderAdapterCandidateThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<PiProviderRuntimeEventCandidate>;
}

export interface PiProviderAdapterCandidateThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<PiProviderAdapterCandidateThreadTurnSnapshot>;
}

export interface PiProviderAdapterCandidateShape {
  readonly provider: "pi";
  readonly capabilities: ProviderAdapterCapabilities;
  readonly startSession: (
    input: PiProviderAdapterCandidateStartInput,
  ) => Effect.Effect<PiProviderAdapterCandidateSession, ProviderAdapterError>;
  readonly sendTurn: (
    input: PiProviderAdapterCandidateSendTurnInput,
  ) => Effect.Effect<PiProviderAdapterCandidateTurnStartResult, ProviderAdapterError>;
  readonly interruptTurn: (
    threadId: ThreadId,
    turnId?: TurnId,
  ) => Effect.Effect<void, ProviderAdapterError>;
  readonly respondToRequest: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, ProviderAdapterError>;
  readonly respondToUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, ProviderAdapterError>;
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, ProviderAdapterError>;
  readonly listSessions: () => Effect.Effect<ReadonlyArray<PiProviderAdapterCandidateSession>>;
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;
  readonly readThread: (
    threadId: ThreadId,
  ) => Effect.Effect<PiProviderAdapterCandidateThreadSnapshot, ProviderAdapterError>;
  readonly rollbackThread: (
    threadId: ThreadId,
    numTurns: number,
  ) => Effect.Effect<PiProviderAdapterCandidateThreadSnapshot, ProviderAdapterError>;
  readonly stopAll: () => Effect.Effect<void, ProviderAdapterError>;
  readonly getCommands: (
    threadId: ThreadId,
  ) => Effect.Effect<ReadonlyArray<PiDiscoveredCommand>, ProviderAdapterError>;
  readonly streamEvents: Stream.Stream<PiProviderRuntimeEventCandidate>;
}

export class PiProviderAdapterCandidate extends Context.Service<
  PiProviderAdapterCandidate,
  PiProviderAdapterCandidateShape
>()("t3/provider/Services/PiProviderAdapterCandidate") {}
