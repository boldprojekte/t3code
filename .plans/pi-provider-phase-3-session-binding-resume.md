# Subplan: Pi Phase 3 Session Binding and Resume

Status: planned

## Role of this document
This is the next focused Phase 3 slice after runtime ingestion and projection validation.

Use it for:
1. validating how Pi `sessionId` and `sessionFile` resume state is persisted through normal provider runtime state
2. proving ProviderService recovery reopens the correct Pi session file
3. hardening server restart and thread switch assumptions for Pi-backed threads
4. keeping composer slash commands, model inventory, UI bridging, and rollback out of scope

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-phase-3-provider-service-orchestration.md`](./pi-provider-phase-3-provider-service-orchestration.md).

## Objective
Make Pi session binding and resume behavior reliable through the same provider runtime persistence path used by other providers.

The previous slices made Pi routable through `ProviderService` and proved Pi runtime events project through orchestration. This slice should close the remaining Phase 3 persistence gap: a Pi-backed thread should persist enough resume state to recover the correct Pi `sessionFile` after adapter/session loss or server restart.

## In scope
1. Verify `ProviderService.startSession` persists Pi `resumeCursor.sessionFile` in `ProviderSessionDirectory`.
2. Verify `ProviderService.sendTurn` preserves or updates Pi `resumeCursor.sessionFile` after a turn.
3. Verify recovery uses persisted Pi `resumeCursor` when an active adapter session is missing.
4. Verify `cwd`, `runtimeMode`, and model-selection payloads do not corrupt Pi resume.
5. Add tests with fake Pi adapter first. Use real Pi exerciser only if fake tests expose an assumption that needs real runtime confirmation.
6. Keep unsupported paths explicit during recovery: model switching, attachments, plan mode, approvals, user-input callbacks, rollback.

## Explicitly out of scope
1. Composer slash-command inventory or invocation UI.
2. Pi model inventory and model switching.
3. Approval or user-input UI bridging.
4. Rollback support.
5. Multi-window or browser reconnect UX.
6. Long-running real Pi stress tests.

## Proposed implementation steps
### 1. Inspect current persistence path
1. Review `ProviderService` recovery logic and `ProviderSessionDirectory` persistence.
2. Confirm the persisted runtime binding shape for Pi after start/send/stop.
3. Identify whether Pi-specific metadata beyond `resumeCursor.sessionFile` is needed now.

### 2. Add ProviderService recovery tests
1. Start a Pi session with a fake Pi adapter returning `{ sessionFile }` in `resumeCursor`.
2. Drop active adapter session state while preserving persisted directory state.
3. Call a routable operation such as `sendTurn` and verify ProviderService calls `adapter.startSession` with the persisted Pi resume cursor.
4. Verify the recovered session remains provider `pi` and keeps the expected cwd/runtime mode.

### 3. Restart-style persistence test
1. Use a persistent test database like existing ProviderService restart tests.
2. Start Pi in a first ProviderService runtime and persist a binding.
3. Dispose first runtime.
4. Start a second ProviderService runtime with a fresh fake Pi adapter.
5. Verify the second runtime resumes using the persisted Pi session file.

### 4. Documentation handoff
1. Update this subplan with observed results.
2. Update [`pi-provider-progress.md`](./pi-provider-progress.md) when the slice reaches a stable stop point.
3. If the next work is composer commands/thread UX, create or activate a Phase 4 subplan instead of extending this one.

## Tests to add or update
1. `apps/server/src/provider/Layers/ProviderService.test.ts`
   - Pi start persists `resumeCursor.sessionFile`
   - Pi send preserves/updates `resumeCursor.sessionFile`
   - Pi recovery calls adapter `startSession` with persisted resume cursor
   - restart-style Pi recovery uses persisted session file with a fresh adapter
2. Existing Pi adapter, ingestion, and provider registry tests should remain green.

## Validation commands
Run these before calling the slice complete:

```sh
bun run --cwd apps/server test \
  src/provider/Layers/ProviderService.test.ts \
  src/provider/Layers/PiAdapter.test.ts \
  src/orchestration/Layers/ProviderRuntimeIngestion.test.ts

bun fmt
bun lint
bun typecheck
bun run build
bun run test
```

Do not use `bun test`; this repo requires `bun run test`.

## Stop criteria
Do not mark this slice done until all of the following are true:

1. Pi resume cursor persistence is tested after start and send.
2. ProviderService recovery reopens Pi with persisted `resumeCursor.sessionFile` when no active session exists.
3. Restart-style recovery with a fresh adapter is tested.
4. Unsupported Pi paths remain explicit and predictable.
5. Existing provider tests remain green.
6. Progress docs are updated at the stable stop point.
7. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
8. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
