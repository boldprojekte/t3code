# Subplan: Pi Phase 3 ProviderService and Orchestration Integration

Status: planned

## Role of this document
This is the next focused execution slice after Phase 2 shared contracts and provider status.

Use it for:
1. wiring Pi into the real shared-contract provider adapter surface
2. registering Pi in provider adapter lookup and `ProviderService`
3. feeding Pi runtime events into normal orchestration/provider-runtime ingestion
4. persisting the T3 thread to Pi session binding in normal provider runtime state

If this file is linked directly in a new chat, also read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current overall status and [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) for the durable roadmap.

## Objective
Turn the proven local Pi bridge into a real T3 provider runtime path.

Phase 2 made `pi` contract-valid and visible to provider status paths, but deliberately did not make Pi executable through `ProviderService`. This slice should introduce that execution seam without adding composer command UI, full model selection, rollback, or Pi-specific UI bridging.

## In scope
1. Add a shared-contract Pi provider adapter implementation backed by the existing local Pi bridge.
2. Register Pi in provider adapter registry and `ProviderService` resolution.
3. Map the existing Pi provider-runtime-shaped candidate events into canonical provider runtime ingestion.
4. Persist Pi session identifiers and session-file resume cursors through the normal provider session runtime path.
5. Keep unsupported Pi paths explicit: attachments, plan mode, rollback, approval callbacks, user-input callbacks, and model switching.
6. Add tests that prove a Pi thread can start, receive one turn, stream events into the normal orchestration read model, and stop without affecting other providers.

## Explicitly out of scope
1. Composer slash-command search or autocomplete.
2. Full model inventory and model switching via Pi `ModelRegistry`.
3. Pi-specific confirm, select, and text input UI bridging.
4. Rollback or `/tree` support.
5. Web polish beyond whatever is required to prevent crashes when Pi is present.

## Focused execution slices
- [planned] [Pi Phase 3 Adapter and Registry Seam](./pi-provider-phase-3-adapter-registry-seam.md)

## Proposed work steps
### 1. Adapter seam
1. Review `ProviderAdapter` and `ProviderService` expectations.
2. Decide whether the current local `PiProviderAdapterCandidate` can be adapted directly or should be wrapped by a thin shared-contract adapter.
3. Preserve the chosen Phase 1 lifecycle contract: one visible T3 turn maps to one full Pi prompt lifecycle.

### 2. Runtime ingestion
1. Route Pi runtime events through the same provider runtime ingestion path used by other providers.
2. Verify turn, item, content, session-state, error, and interrupt events land in the orchestration projection with stable ids.
3. Keep Pi internal `toolUse` boundaries internal.

### 3. Persistence and resume
1. Persist Pi `sessionId` and `sessionFile` in normal provider session metadata.
2. Resume the same Pi session file when reopening a Pi-backed thread.
3. Verify server restart and thread switch assumptions with tests where possible.

### 4. Unsupported-path enforcement
1. Keep plan mode as an explicit validation failure.
2. Keep attachments, model switching, approval callbacks, user-input callbacks, and rollback as explicit unsupported paths.
3. Make sure the UI or service layer does not advertise those capabilities for Pi.

## Stop criteria
Do not call this slice done until all of the following are true:

1. `ProviderService` can start and run a Pi-backed thread through the shared provider surface.
2. Pi events are ingested into the normal orchestration read model.
3. Pi session binding and resume cursor persistence are tested.
4. Unsupported paths fail explicitly and predictably.
5. Existing Codex, Claude, Cursor, and OpenCode provider tests still pass.
6. The progress document is updated at the slice stop point.
7. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
