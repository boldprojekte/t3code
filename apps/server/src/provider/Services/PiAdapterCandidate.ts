import { Context } from "effect";
import type { Effect, Stream } from "effect";
import type { ThreadId, TurnId } from "@t3tools/contracts";

import type {
  CreatePiAdapterCandidateOptions,
  PiProviderRuntimeEventCandidate,
} from "../piAdapterCandidate.ts";
import type { PiDiscoveredCommand } from "../piSdkSpike.ts";
import type { ProviderAdapterError } from "../Errors.ts";

export interface PiAdapterCandidateSession {
  readonly provider: "pi";
  readonly threadId: ThreadId;
  readonly cwd: string;
  readonly agentDir: string;
  readonly sessionId: string;
  readonly sessionFile: string | null;
  readonly startedAt: string;
}

export interface PiAdapterCandidateStartInput extends Omit<
  CreatePiAdapterCandidateOptions,
  "threadId" | "onEvent"
> {
  readonly threadId: ThreadId;
}

export interface PiAdapterCandidateSendTurnInput {
  readonly threadId: ThreadId;
  readonly turnId: TurnId;
  readonly prompt: string;
}

export interface PiAdapterCandidateShape {
  readonly startSession: (
    input: PiAdapterCandidateStartInput,
  ) => Effect.Effect<PiAdapterCandidateSession, ProviderAdapterError>;
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;
  readonly getSession: (
    threadId: ThreadId,
  ) => Effect.Effect<PiAdapterCandidateSession, ProviderAdapterError>;
  readonly listSessions: () => Effect.Effect<ReadonlyArray<PiAdapterCandidateSession>>;
  readonly getCommands: (
    threadId: ThreadId,
  ) => Effect.Effect<ReadonlyArray<PiDiscoveredCommand>, ProviderAdapterError>;
  readonly sendTurn: (
    input: PiAdapterCandidateSendTurnInput,
  ) => Effect.Effect<void, ProviderAdapterError>;
  readonly abortTurn: (threadId: ThreadId) => Effect.Effect<void, ProviderAdapterError>;
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, ProviderAdapterError>;
  readonly stopAll: () => Effect.Effect<void>;
  readonly streamEvents: Stream.Stream<PiProviderRuntimeEventCandidate>;
}

export class PiAdapterCandidate extends Context.Service<
  PiAdapterCandidate,
  PiAdapterCandidateShape
>()("t3/provider/Services/PiAdapterCandidate") {}
