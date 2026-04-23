import path from "node:path";

import type { RuntimeMode } from "@t3tools/contracts";

import type { PiProviderRuntimeEventCandidate } from "./piAdapterCandidate.ts";

const ALLOWED_RUNTIME_MODES = new Set<RuntimeMode>([
  "approval-required",
  "auto-accept-edits",
  "full-access",
]);

const DEFAULT_PROMPT =
  "List the most relevant files in this repository, explain why they matter, and do not modify any files.";

export interface PiProviderExerciserTurnPlan {
  readonly label: string;
  readonly prompt: string;
  readonly abortAfterMs?: number;
}

export interface PiProviderExerciserOptions {
  readonly cwd: string;
  readonly threadId: string;
  readonly runtimeMode: RuntimeMode;
  readonly sessionFile?: string;
  readonly packageEntryPath?: string;
  readonly eventsFile?: string;
  readonly turnTimeoutMs: number;
  readonly stopAllAfter: boolean;
  readonly turns: ReadonlyArray<PiProviderExerciserTurnPlan>;
}

export const PI_PROVIDER_EXERCISER_USAGE = `Usage:
  bun apps/server/scripts/pi-provider-exerciser.ts [options]

Options:
  --cwd <path>                 Repository root to exercise. Defaults to process.cwd().
  --thread-id <id>             Thread id to use. Defaults to pi-exerciser-<timestamp>.
  --prompt <text>              Prompt for the main turn.
  --abort-prompt <text>        Optional second turn prompt to interrupt.
  --abort-after-ms <number>    Delay before interrupting the abort turn. If no abort turn is set,
                               the main turn will be interrupted instead.
  --runtime-mode <mode>        approval-required | auto-accept-edits | full-access.
  --session-file <path>        Existing Pi session file to reopen.
  --package-entry-path <path>  Explicit Pi package dist/index.js path.
  --events-file <path>         Optional JSONL output file for structured logs.
  --turn-timeout-ms <number>   Max wait per turn before timing out. Defaults to 120000.
  --no-stop-all                Skip the final stopAll() cleanup step.
  --help                       Print this help.
`;

function readRequiredValue(args: ReadonlyArray<string>, index: number, flag: string): string {
  const value = args[index + 1]?.trim();
  if (!value) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parsePositiveInteger(rawValue: string, flag: string): number {
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function resolveOptionalPath(processCwd: string, rawPath?: string): string | undefined {
  return rawPath ? path.resolve(processCwd, rawPath) : undefined;
}

function createDefaultThreadId(now: () => number): string {
  return `pi-exerciser-${now()}`;
}

export function parsePiProviderExerciserArgs(
  args: ReadonlyArray<string>,
  options?: {
    readonly processCwd?: string;
    readonly now?: () => number;
  },
): PiProviderExerciserOptions & { readonly help: boolean } {
  const processCwd = options?.processCwd ?? process.cwd();
  const now = options?.now ?? Date.now;

  let cwd = processCwd;
  let threadId = createDefaultThreadId(now);
  let prompt = DEFAULT_PROMPT;
  let abortPrompt: string | undefined;
  let abortAfterMs: number | undefined;
  let runtimeMode: RuntimeMode = "full-access";
  let sessionFile: string | undefined;
  let packageEntryPath: string | undefined;
  let eventsFile: string | undefined;
  let turnTimeoutMs = 120_000;
  let stopAllAfter = true;
  let help = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case "--help":
        help = true;
        break;
      case "--cwd":
        cwd = path.resolve(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--thread-id":
        threadId = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--prompt":
        prompt = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--abort-prompt":
        abortPrompt = readRequiredValue(args, index, arg);
        index += 1;
        break;
      case "--abort-after-ms":
        abortAfterMs = parsePositiveInteger(readRequiredValue(args, index, arg), arg);
        index += 1;
        break;
      case "--runtime-mode": {
        const nextMode = readRequiredValue(args, index, arg) as RuntimeMode;
        if (!ALLOWED_RUNTIME_MODES.has(nextMode)) {
          throw new Error(`${arg} must be one of: ${[...ALLOWED_RUNTIME_MODES].join(", ")}.`);
        }
        runtimeMode = nextMode;
        index += 1;
        break;
      }
      case "--session-file":
        sessionFile = resolveOptionalPath(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--package-entry-path":
        packageEntryPath = resolveOptionalPath(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--events-file":
        eventsFile = resolveOptionalPath(processCwd, readRequiredValue(args, index, arg));
        index += 1;
        break;
      case "--turn-timeout-ms":
        turnTimeoutMs = parsePositiveInteger(readRequiredValue(args, index, arg), arg);
        index += 1;
        break;
      case "--no-stop-all":
        stopAllAfter = false;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  const normalizedPrompt = prompt.trim();
  if (!help && normalizedPrompt.length === 0) {
    throw new Error("--prompt must not be empty.");
  }

  const turns: PiProviderExerciserTurnPlan[] = [
    {
      label: "main",
      prompt: normalizedPrompt,
      ...(abortAfterMs !== undefined && !abortPrompt ? { abortAfterMs } : {}),
    },
  ];

  const normalizedAbortPrompt = abortPrompt?.trim();
  if (normalizedAbortPrompt) {
    turns.push({
      label: "abort",
      prompt: normalizedAbortPrompt,
      ...(abortAfterMs !== undefined ? { abortAfterMs } : {}),
    });
  }

  return {
    help,
    cwd,
    threadId,
    runtimeMode,
    ...(sessionFile ? { sessionFile } : {}),
    ...(packageEntryPath ? { packageEntryPath } : {}),
    ...(eventsFile ? { eventsFile } : {}),
    turnTimeoutMs,
    stopAllAfter,
    turns,
  };
}

function truncate(value: string, maxLength = 80): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

function summarizePayload(event: PiProviderRuntimeEventCandidate): string {
  switch (event.type) {
    case "session.started":
      return truncate(event.payload.message ?? "Pi session started");
    case "session.state.changed":
      return `${event.payload.state}: ${truncate(event.payload.reason ?? "no reason provided")}`;
    case "session.exited":
      return `${event.payload.exitKind}: ${truncate(event.payload.reason ?? "no reason provided")}`;
    case "thread.started":
      return `providerThreadId=${event.payload.providerThreadId ?? "unknown"}`;
    case "turn.completed":
      return `${event.payload.state}${event.payload.stopReason ? ` (${event.payload.stopReason})` : ""}`;
    case "item.started":
    case "item.updated":
    case "item.completed":
      return `${event.payload.itemType}: ${truncate(event.payload.title ?? event.payload.itemType)}`;
    case "content.delta":
      return `${event.payload.streamKind}: ${truncate(event.payload.delta ?? "")}`;
    case "runtime.warning":
    case "runtime.error":
      return truncate(event.payload.message ?? "no message provided");
    case "turn.started":
      return "";
    default:
      return "";
  }
}

export function formatPiProviderRuntimeEventSummary(
  event: PiProviderRuntimeEventCandidate,
): string {
  const scopeParts = [
    `seq=${event.sessionSequence}`,
    event.turnId ? `turn=${event.turnId}` : undefined,
    event.itemId ? `item=${event.itemId}` : undefined,
  ].filter((value): value is string => value !== undefined);
  const payloadSummary = summarizePayload(event);
  return payloadSummary.length > 0
    ? `${scopeParts.join(" ")} ${event.type} ${payloadSummary}`
    : `${scopeParts.join(" ")} ${event.type}`;
}
