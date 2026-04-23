# Subplan: Pi Phase 1 Local Real-Thread Exerciser

Status: done

## Role of this document
This is a focused execution subplan for the current Pi integration slice.

Use it for:
1. the concrete implementation goal
2. the exact work steps for this slice
3. validation for this slice
4. what this slice explicitly does not do

If this file is linked directly in a new chat, also read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current overall status and [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) for the durable roadmap.

Do not use this file as the long-term roadmap. The durable roadmap lives in [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md). Current overall status lives in [`pi-provider-progress.md`](./pi-provider-progress.md).

## Objective
Exercise the existing local Pi provider-shaped bridge against real T3 thread inputs without introducing Pi into shared contracts yet.

The goal of this slice is not product completion. The goal is to replace remaining assumptions with observed behavior on real repositories and real Pi sessions.

## Why this slice is next
We already have the local stack:
1. `piSdkSpike.ts`
2. `piAdapterCandidate.ts`
3. `Layers/PiAdapterCandidate.ts`
4. `Layers/PiProviderAdapterCandidate.ts`

The next useful truth is whether this bridge behaves correctly against real thread-shaped usage. Until that is proven, moving into shared contracts or web UX is premature.

## In scope
1. Add a small server-side exerciser on top of `PiProviderAdapterCandidateLive`.
2. Use real `threadId` plus `cwd` inputs to start and drive Pi sessions.
3. Exercise start session, list sessions, get commands, send turn, abort, stop session, and stop all.
4. Capture enough runtime output to verify event ordering and session ownership assumptions.
5. Validate behavior on a real repository with an actual Pi install.
6. Add or adjust tests around the exerciser if shared helper logic is introduced.

## Explicitly out of scope
1. Adding `pi` to shared provider contracts.
2. Provider registry integration.
3. `ProviderService` integration.
4. Web provider picker or composer work.
5. Attachment support.
6. Model selection support.
7. Approval callback or user-input callback bridging.
8. Rollback support.
9. Full Pi provider status or model inventory work.

## Deliverable shape
A small local server-side entrypoint or script that can:
1. create a Pi session for a thread-like input
2. print or persist the observed event stream in a useful debug shape
3. send one or more turns through the local provider-shaped bridge
4. abort and stop the session cleanly
5. make failures obvious

This may be a script under `apps/server/scripts/` or a similarly local exercise harness. It should stay clearly outside the shared provider contract path.

## Proposed work steps
### 1. Choose the exerciser entrypoint
1. Prefer a small script in `apps/server/scripts/` unless a reusable local helper naturally falls out.
2. Keep the entrypoint narrow. It should exercise the bridge, not become a second provider architecture.

### 2. Bridge thread-like inputs into the local Pi provider-shaped service
1. Accept `threadId` and `cwd` as explicit inputs.
2. Start the session through `PiProviderAdapterCandidateLive`.
3. Print session identity and command inventory.

### 3. Exercise one full turn lifecycle
1. Send a prompt through `sendTurn()`.
2. Subscribe before sending so start events are not missed.
3. Capture event ordering through turn start, assistant output, tool activity, turn completion, and ready state.

### 4. Exercise control operations
1. Verify `interruptTurn()` reaches Pi abort.
2. Verify `stopSession()` removes ownership cleanly.
3. Verify `stopAll()` leaves no orphaned local session state.

### 5. Record what is still unsupported or surprising
1. Note any resume assumptions that do not hold.
2. Note any event ordering mismatches.
3. Note any command discovery edge cases.
4. Feed durable findings back into the PRD only if they change scope or roadmap.
5. Feed current-state findings into the progress document.

## Validation for this slice
This slice counts as done only when all of the following are true:

1. There is a local exerciser checked into the repo.
2. It runs against a real Pi install and a real repository.
3. It proves the local provider-shaped Pi bridge can start, send a turn, stream events, abort, and stop.
4. Any newly introduced helper logic has tests if it is non-trivial.
5. The progress document is updated with the result of the slice.
6. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.

## Results
Observed with the checked-in exerciser against the real `@mariozechner/pi-coding-agent` install and this repository:

1. `SessionManager` is exported as a class with static helpers, so the SDK shape check must accept object-like statics, not just plain objects.
2. Command discovery does not live on `runtime.session.getCommands()` in the current Pi build. The working source is `runtime.session.extensionRunner.getRegisteredCommands()`.
3. Headless server integration should not call `bindExtensions()` in this phase. Command inventory and event streaming work without it, and binding user extensions triggered stale UI errors on shutdown in Jan's local Pi setup.
4. Abort works cleanly. A prompt interrupted after 1s produced `turn.completed` with `state: interrupted` and `stopReason: aborted`, then `session.state.changed` back to `ready`.
5. Session-file resume works. Reopening the aborted session file and sending a trivial prompt returned the same Pi `sessionId` and completed normally.
6. Real event ordering revealed the main open issue for the next slice: a complex prompt can continue across multiple Pi `turn_start` and `turn_end` cycles after the first mapped `turn.completed` with `stopReason: toolUse`. In that case, the current `sendTurn()` call may remain pending much longer than the first projected turn suggests.

Local validation logs were captured under `apps/server/userdata/pi-provider-exerciser/` while running this slice, but they are disposable runtime artifacts rather than checked-in deliverables.

## Exit criteria for moving to the next subplan
Move on from this subplan when we can answer these with confidence:

1. Is the current local bridge shape the right seam for shared-contract integration?
2. Do real Pi event sequences fit the current projection assumptions closely enough?
3. Is the persisted session file enough for the next resume step, or do we need more metadata?
4. Which unsupported behaviors should remain hard failures in the next phase?

## Files likely involved
1. `apps/server/src/provider/Layers/PiProviderAdapterCandidate.ts`
2. `apps/server/src/provider/Services/PiProviderAdapterCandidate.ts`
3. `apps/server/scripts/`
4. possibly `apps/server/src/provider/*test.ts` if helper logic is extracted
