import { ProviderRuntimeEvent, type ProviderSessionStartInput } from "@t3tools/contracts";
import { Effect, Layer, Schema, Stream } from "effect";

import { ProviderAdapterValidationError } from "../Errors.ts";
import { PiAdapter, type PiAdapterShape } from "../Services/PiAdapter.ts";
import {
  PiProviderAdapterCandidate,
  type PiProviderAdapterCandidateResumeCursor,
} from "../Services/PiProviderAdapterCandidate.ts";
import { PiProviderAdapterCandidateLive } from "./PiProviderAdapterCandidate.ts";

const PROVIDER = "pi" as const;

function toValidationError(issue: string, operation: string): ProviderAdapterValidationError {
  return new ProviderAdapterValidationError({
    provider: PROVIDER,
    operation,
    issue,
  });
}

function readPiResumeCursor(
  resumeCursor: ProviderSessionStartInput["resumeCursor"],
): PiProviderAdapterCandidateResumeCursor | ProviderAdapterValidationError | undefined {
  if (resumeCursor === undefined || resumeCursor === null) {
    return undefined;
  }
  if (
    typeof resumeCursor === "object" &&
    !Array.isArray(resumeCursor) &&
    "sessionFile" in resumeCursor &&
    typeof resumeCursor.sessionFile === "string" &&
    resumeCursor.sessionFile.trim().length > 0
  ) {
    return { sessionFile: resumeCursor.sessionFile };
  }
  return toValidationError(
    "Pi resumeCursor must be an object with a non-empty sessionFile string.",
    "startSession",
  );
}

const makePiAdapter = Effect.gen(function* () {
  const candidate = yield* PiProviderAdapterCandidate;

  const startSession: PiAdapterShape["startSession"] = (input) =>
    Effect.gen(function* () {
      const cwd = input.cwd?.trim();
      if (!cwd) {
        return yield* toValidationError("Pi startSession requires cwd.", "startSession");
      }

      const resumeCursor = readPiResumeCursor(input.resumeCursor);
      if (Schema.is(ProviderAdapterValidationError)(resumeCursor)) {
        return yield* resumeCursor;
      }
      return yield* candidate.startSession({
        threadId: input.threadId,
        provider: PROVIDER,
        cwd,
        runtimeMode: input.runtimeMode,
        ...(input.modelSelection !== undefined ? { modelSelection: input.modelSelection } : {}),
        ...(resumeCursor !== undefined ? { resumeCursor } : {}),
      });
    });

  const sendTurn: PiAdapterShape["sendTurn"] = (input) =>
    candidate.sendTurn({
      threadId: input.threadId,
      ...(input.input !== undefined ? { input: input.input } : {}),
      ...(input.attachments !== undefined ? { attachments: input.attachments } : {}),
      ...(input.modelSelection !== undefined ? { modelSelection: input.modelSelection } : {}),
      ...(input.interactionMode !== undefined ? { interactionMode: input.interactionMode } : {}),
    });

  const adapter: PiAdapterShape = {
    provider: PROVIDER,
    capabilities: candidate.capabilities,
    startSession,
    sendTurn,
    interruptTurn: candidate.interruptTurn,
    respondToRequest: candidate.respondToRequest,
    respondToUserInput: candidate.respondToUserInput,
    stopSession: candidate.stopSession,
    listSessions: candidate.listSessions,
    hasSession: candidate.hasSession,
    readThread: candidate.readThread,
    rollbackThread: candidate.rollbackThread,
    stopAll: candidate.stopAll,
    get streamEvents() {
      return candidate.streamEvents.pipe(
        Stream.map((event) => Schema.decodeUnknownSync(ProviderRuntimeEvent)(event)),
      );
    },
  };
  return adapter;
});

export const PiAdapterFromCandidateLive = Layer.effect(PiAdapter, makePiAdapter);

export const PiAdapterLive = PiAdapterFromCandidateLive.pipe(
  Layer.provide(PiProviderAdapterCandidateLive),
);
