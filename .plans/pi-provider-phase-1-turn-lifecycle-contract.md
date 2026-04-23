# Subplan: Pi Phase 1 Turn Lifecycle Contract

Status: active

## Role of this document
This is the focused execution subplan for the remaining Phase 1 work after the real-thread exerciser.

Use it for:
1. the concrete lifecycle question we still need to answer
2. the exact work steps for this slice
3. the validation needed before moving into shared contracts
4. the boundary of what this slice explicitly does not do

If this file is linked directly in a new chat, also read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current overall status and [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) for the durable roadmap.

Do not use this file as the long-term roadmap. The durable roadmap lives in [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md). Current overall status lives in [`pi-provider-progress.md`](./pi-provider-progress.md).

## Objective
Decide and harden the local bridge contract for Pi prompts that continue across multiple internal Pi turns after the first projected `turn.completed` event.

The goal of this slice is to remove the biggest remaining ambiguity in Phase 1: what a single T3 `sendTurn()` means when Pi keeps working after a tool-use boundary.

## Why this slice is next
The real-thread exerciser proved the local bridge against a real Pi install, but it also exposed a contract mismatch:

1. a complex Pi prompt can emit `turn.completed` with `stopReason: toolUse`
2. Pi can then continue across later `turn_start` and `turn_end` cycles for the same user request
3. the current local seam does not yet state whether T3 should treat that first completion as the end of the turn or only as an intermediate boundary

Until that is decided, Phase 2 would bake an unstable seam into shared contracts, provider state, and web UX.

## In scope
1. Capture representative real traces for prompts that cross one or more tool-use boundaries.
2. Decide the external meaning of one local `sendTurn()` call.
3. Decide how projected events should identify the user-visible turn when Pi creates multiple internal turns.
4. Adjust the local Pi adapter candidate and provider-shaped bridge if the chosen contract requires changes.
5. Add or update tests for the chosen lifecycle behavior.
6. Update the progress document with the observed result when this slice stops.

## Explicitly out of scope
1. Adding `pi` to shared provider contracts.
2. Provider registry integration.
3. `ProviderService` integration.
4. Web provider picker or composer work.
5. Full plan-mode support.
6. Full slash-command support.
7. Minimal UI bridging for extension prompts.

## Deliverable shape
This slice should end with all of the following:

1. a written lifecycle decision grounded in observed Pi behavior
2. a local adapter behavior that matches that decision
3. tests that lock the decision in place
4. progress and subplan docs updated to match the actual stop point

## Files most likely involved
1. `apps/server/src/provider/piAdapterCandidate.ts`
2. `apps/server/src/provider/piAdapterCandidate.test.ts`
3. `apps/server/src/provider/Layers/PiProviderAdapterCandidate.ts`
4. `apps/server/src/provider/Layers/PiProviderAdapterCandidate.test.ts`
5. `apps/server/src/provider/piProviderExerciser.ts`
6. `apps/server/scripts/pi-provider-exerciser.ts`

## Proposed work steps
### 1. Capture the real lifecycle cases
1. Use the checked-in exerciser against a real Pi install and this repository.
2. Record at least one prompt where Pi clearly continues after the first `toolUse` completion.
3. Distinguish between Pi-internal turns and the T3-visible user request.

### 2. Choose the local contract
1. Decide whether the T3-visible turn maps to the first projected Pi turn or to the full prompt lifecycle.
2. Decide what `sendTurn()` should resolve on.
3. Decide whether later Pi-internal turns should reuse the original visible turn id, create child turns, or remain internal-only.
4. Keep the decision boring and provider-neutral where possible.

### 3. Align the local bridge with that contract
1. Change event projection or provider-layer behavior only where necessary.
2. Keep unsupported paths explicit instead of pretending they work.
3. Do not leak ad hoc Pi-only exceptions into shared layers.

### 4. Lock it in with tests
1. Add fixtures or synthetic raw-event tests for the multi-turn-after-tool-use case.
2. Verify `sendTurn()` resolution behavior matches the chosen contract.
3. Re-check abort and session-ready transitions if the lifecycle handling changes them.

### 5. Close the slice cleanly
1. Update `pi-provider-progress.md` with the actual outcome.
2. Update this subplan status before moving to the next slice.
3. Run `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` before calling the slice done.

## Exit criteria for Phase 1 completion
Do not call Phase 1 done until all of the following are true:

1. the turn-lifecycle contract is written down and tested
2. the local bridge behavior matches that contract
3. unsupported paths have been re-checked against the chosen contract
4. the progress document has been updated at the phase stop point
5. the repo quality gates pass
