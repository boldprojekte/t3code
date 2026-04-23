# Subplan: Pi Phase 3 Runtime Ingestion and Projection Validation

Status: planned

## Role of this document
This is the next focused Phase 3 slice after the Pi adapter and registry seam.

Use it for:
1. proving Pi runtime events flow through the normal `ProviderService` event stream
2. validating provider runtime ingestion into orchestration projections
3. keeping Pi session binding updates stable across runtime events
4. preparing the later durable resume slice without mixing it into this one

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-phase-3-provider-service-orchestration.md`](./pi-provider-phase-3-provider-service-orchestration.md).

## Objective
Prove that Pi events emitted by the new real Pi adapter are ingested and projected through the same server pathways as existing providers.

The previous slice made Pi resolvable by `ProviderAdapterRegistry` and routable through `ProviderService`. This slice should validate the event path from `PiAdapter.streamEvents` through `ProviderService.streamEvents`, `ProviderRuntimeIngestionService`, and the orchestration read model.

## In scope
1. Verify `ProviderService.streamEvents` republishes Pi canonical runtime events.
2. Verify Pi `turn.started`, `item.started`, `content.delta`, `item.completed`, `turn.completed`, `session.state.changed`, and `runtime.error` events are accepted by runtime ingestion.
3. Verify the orchestration projection records a Pi-backed turn with stable turn and item ids.
4. Verify Pi internal `toolUse` boundaries stay internal and do not produce extra visible turn completions.
5. Verify provider session directory state remains coherent after Pi runtime events, especially active turn and final ready/stopped state.
6. Add tests using fake Pi adapter events first. Use real Pi only if a small exerciser run is needed to validate assumptions, not as a required automated test dependency.

## Explicitly out of scope
1. Server restart and durable Pi session resume.
2. Composer slash-command inventory or invocation UI.
3. Pi model inventory and model switching.
4. Approval or user-input UI bridging.
5. Rollback support.
6. Broad web UI polish.

## Proposed implementation steps
### 1. Event stream propagation
1. Add a ProviderService-level test with a fake Pi adapter that emits canonical Pi runtime events.
2. Assert `ProviderService.streamEvents` republishes those events with provider `pi` and unchanged ids.
3. Assert canonical event logging, if enabled in the test, receives the Pi thread segment.

### 2. Runtime ingestion path
1. Locate current `ProviderRuntimeIngestionService` tests for Codex/Claude-style events.
2. Add Pi event fixtures that mirror the existing Pi adapter event shapes.
3. Run ingestion workers in a test scope and drain them deterministically.
4. Assert projected orchestration events and thread snapshots match the existing provider-neutral behavior.

### 3. Lifecycle and session state
1. Test one normal Pi turn lifecycle:
   - `turn.started`
   - assistant item lifecycle
   - content delta
   - `turn.completed`
   - ready state
2. Test one Pi tool-use lifecycle with multiple internal Pi turns but one visible T3 turn completion.
3. Test one runtime error event and expected projection/session state.

### 4. Documentation handoff
1. Update this subplan with observed results.
2. Update [`pi-provider-progress.md`](./pi-provider-progress.md) when the slice reaches a stable stop point.
3. If the next work is durable session resume, create or activate a dedicated resume subplan.

## Tests to add or update
1. `apps/server/src/provider/Layers/ProviderService.test.ts`
   - Pi events are republished through `ProviderService.streamEvents`
   - canonical event logger receives Pi events with the correct thread id
2. `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts` or the current equivalent ingestion test file
   - Pi normal turn projects into the orchestration read model
   - Pi tool-use boundaries do not create multiple visible completions
   - Pi runtime error projects predictably
3. Existing Pi adapter and candidate tests should remain unchanged unless they expose a real mismatch.

## Validation commands
Run these before calling the slice complete:

```sh
bun run --cwd apps/server test \
  src/provider/Layers/ProviderService.test.ts \
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

1. Pi provider runtime events flow through `ProviderService.streamEvents`.
2. Pi runtime events are accepted by provider runtime ingestion.
3. The orchestration projection can show a Pi-backed turn from canonical runtime events.
4. Pi tool-use boundaries remain internal in projection tests.
5. Error events produce predictable projected state.
6. Existing providers remain green.
7. Progress docs are updated at the stable stop point.
8. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
9. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
