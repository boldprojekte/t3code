# Subplan: Pi Phase 3 Real ProviderService Smoke Validation

Status: planned

## Role of this document
This is the final Phase 3 confidence slice after adapter routing, runtime ingestion/projection, and session binding/resume tests.

Use it for:
1. validating the full `ProviderService` path against a real local Pi install
2. proving the server-layer `PiAdapterLive` wiring works beyond fakes
3. confirming real Pi events still match the canonical runtime projections after the ProviderService integration
4. deciding whether Phase 3 can close before moving to composer command UX

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-phase-3-provider-service-orchestration.md`](./pi-provider-phase-3-provider-service-orchestration.md).

## Objective
Run a small real-Pi smoke validation through the actual shared ProviderService path.

Phase 1 validated the lower-level local Pi bridge against real Pi. Phase 3 then wired that bridge through `PiAdapter`, `ProviderAdapterRegistry`, `ProviderService`, runtime ingestion, and session persistence mostly with deterministic fakes. Before moving to Phase 4 UI and command work, validate that the real installed Pi package still behaves through the integrated ProviderService seam.

## In scope
1. Add a small server-side script or exerciser mode that uses `ProviderService` with `PiAdapterLive`, not `PiProviderAdapterCandidate` directly.
2. Run a real Pi session in this repo through:
   - `ProviderService.startSession`
   - `ProviderService.sendTurn`
   - `ProviderService.streamEvents`
   - `ProviderRuntimeIngestionService`, if feasible without turning the script into a full app boot
   - `ProviderService.stopSession`
3. Verify at least one simple prompt completes as one visible T3 turn.
4. Verify persisted binding contains provider `pi` and `resumeCursor.sessionFile`.
5. Verify session-file resume works through ProviderService if the script can do so without excessive complexity.
6. Document observed results and decide whether Phase 3 is done.

## Explicitly out of scope
1. Composer slash-command inventory or invocation UI.
2. Pi model inventory and model switching.
3. Approval or user-input UI bridging.
4. Rollback support.
5. Multi-thread stress testing.
6. Long-running real workloads.

## Proposed implementation steps
### 1. Choose the smoke path
1. Review existing `apps/server/scripts/pi-provider-exerciser.ts`.
2. Decide whether to extend it with a ProviderService mode or create a small separate script.
3. Prefer a separate script only if it keeps the existing lower-level exerciser simple.

### 2. Wire real ProviderService layers
1. Build the minimal layer stack needed for `ProviderService`, `ProviderAdapterRegistry`, `PiAdapterLive`, `ProviderSessionDirectory`, settings, analytics test/no-op layer, and persistence.
2. Enable Pi in test settings for the script only.
3. Avoid touching web UI or normal user settings.

### 3. Run and observe
1. Start a Pi session for a deterministic thread id in this repo.
2. Subscribe to `ProviderService.streamEvents` and summarize event counts.
3. Send a small prompt that should not require risky tool use.
4. Stop the session cleanly.
5. Inspect persisted binding and, if practical, resume with the stored session file.

### 4. Documentation handoff
1. Update this subplan with observed real behavior.
2. Update [`pi-provider-progress.md`](./pi-provider-progress.md).
3. If the smoke passes, mark Phase 3 done and create/activate the first Phase 4 composer command/thread UX subplan.
4. If the smoke fails, keep Phase 3 active and create a focused remediation subplan.

## Validation commands
Run these before calling the slice complete:

```sh
bun run --cwd apps/server typecheck
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

If a real smoke script is added, run it against this repository and record the exact command and observed result in this document.

Do not use `bun test`; this repo requires `bun run test`.

## Stop criteria
Do not mark this slice done until all of the following are true:

1. A real local Pi install has been exercised through `ProviderService`, not only through the lower-level candidate bridge.
2. At least one real prompt completes as one visible T3 turn.
3. Real ProviderService events are observed and summarized.
4. Persisted Pi binding with `resumeCursor.sessionFile` is verified.
5. Resume through ProviderService is either verified or explicitly deferred with a concrete reason.
6. Progress docs are updated with observed results.
7. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
8. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
