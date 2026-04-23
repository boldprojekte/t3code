# Subplan: Pi Phase 1 Unsupported Path Recheck

Status: planned

## Role of this document
This is the next focused execution slice after the turn-lifecycle contract decision.

Use it for:
1. re-checking the still unsupported Phase 1 paths against the chosen lifecycle contract
2. deciding whether any of those paths block Phase 2 shared-contract work
3. documenting the verified stop point before Phase 2 starts

If this file is linked directly in a new chat, also read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current overall status and [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) for the durable roadmap.

## Objective
Verify that the remaining unsupported local bridge paths still behave honestly after the turn-lifecycle contract change.

The goal is not to add those features yet. The goal is to confirm which ones remain explicit hard failures, which ones are safe to leave for later phases, and whether any of them change the entry criteria for Phase 2.

## Why this slice is next
The local lifecycle contract is now chosen and tested:

1. one visible T3 turn spans the full Pi prompt lifecycle
2. internal Pi `toolUse` boundaries stay internal
3. visible `turn.completed` only fires when the prompt lifecycle actually finishes

That removes the biggest ambiguity from Phase 1. The last Phase 1 question is whether still unsupported paths such as plan mode and future slash-command execution need any lifecycle-driven adjustments before shared-contract work begins.

## In scope
1. Re-check explicit plan-mode rejection against the chosen lifecycle contract.
2. Re-check likely slash-command execution behavior in the local bridge, even if it remains out of scope for product wiring.
3. Confirm that session status, thread snapshots, and turn completion semantics stay coherent under those paths.
4. Update the progress document with the observed result.

## Explicitly out of scope
1. Adding `pi` to shared provider contracts.
2. Provider registry integration.
3. `ProviderService` integration.
4. Web composer command UI.
5. Full slash-command product support.
6. Minimal extension UI bridging.

## Proposed work steps
### 1. Re-check plan mode
1. Confirm the local bridge still rejects `interactionMode: "plan"` explicitly.
2. Decide whether that rejection remains the right behavior for Phase 1 and early Phase 2.

### 2. Re-check slash-command execution shape
1. Exercise one or two representative slash-command prompts through the existing local bridge.
2. Check whether the chosen lifecycle contract keeps turn ownership and completion behavior coherent.
3. Record only observed behavior, not desired future behavior.

### 3. Close Phase 1 cleanly
1. Decide whether Phase 1 can now be called done.
2. If yes, update `pi-provider-progress.md` before starting Phase 2.
3. Run `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` before closing the slice.
