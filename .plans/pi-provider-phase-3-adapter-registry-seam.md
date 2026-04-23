# Subplan: Pi Phase 3 Adapter and Registry Seam

Status: planned

## Role of this document
This is the first concrete execution slice inside Phase 3 ProviderService and orchestration integration.

Use it for:
1. lifting the proven Pi provider candidate into the normal `ProviderAdapter` contract
2. registering Pi in `ProviderAdapterRegistry` behind the existing settings gate
3. proving `ProviderService.startSession`, `sendTurn`, `interruptTurn`, and `stopSession` can route to Pi through the shared provider surface
4. keeping runtime ingestion and durable resume hardening intentionally narrow unless required by the seam

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current status, then [`pi-provider-phase-3-provider-service-orchestration.md`](./pi-provider-phase-3-provider-service-orchestration.md) for the broader Phase 3 context.

## Objective
Make Pi executable through the same provider adapter lookup path as Codex, Claude, Cursor, and OpenCode, without yet claiming the full Phase 3 runtime-ingestion and resume story is complete.

The key deliverable is a real `ProviderAdapterShape<ProviderAdapterError>` implementation for Pi that wraps the existing `PiProviderAdapterCandidate` behavior and can be resolved by `ProviderAdapterRegistry`.

## Why this slice comes first
Phase 2 made `pi` contract-valid and visible in provider status, but `ProviderService` still cannot route a Pi thread because `ProviderAdapterRegistryLive` only registers Codex, Claude, OpenCode, and optional Cursor adapters.

Starting with the adapter/registry seam is the least risky path because:
1. the local Pi bridge already proved session start, turn send, interrupt, stop, and resume-cursor shape
2. `ProviderService` already handles settings gating, stale-session cleanup, session-directory upserts, and provider event stream subscription once an adapter is registered
3. keeping ingestion and persistence validation as follow-up slices prevents Phase 3 from turning into one huge unreviewable change

## In scope
1. Add a Pi adapter service/layer that satisfies `ProviderAdapterShape<ProviderAdapterError>`.
2. Reuse the existing `PiProviderAdapterCandidate` implementation where possible instead of duplicating Pi SDK/session lifecycle logic.
3. Register Pi in `ProviderAdapterRegistryLive` so `getByProvider("pi")` resolves when the Pi adapter layer is provided.
4. Keep `ProviderService.startSession` settings gating unchanged: disabled Pi must still fail before starting a runtime session.
5. Route `ProviderService.startSession`, `sendTurn`, `interruptTurn`, `stopSession`, `listSessions`, `readThread`, and `stopAll` through the Pi adapter in tests.
6. Preserve the Phase 1 lifecycle contract: one visible T3 turn maps to one full Pi prompt lifecycle, and internal Pi `toolUse` turn boundaries stay internal.
7. Keep unsupported Pi operations explicit and predictable:
   - attachments fail before a Pi prompt starts
   - plan mode fails before a Pi prompt starts
   - model switching remains unsupported
   - approval response remains unsupported
   - user-input response remains unsupported
   - rollback remains unsupported
8. Ensure Pi adapter `streamEvents` exposes canonical `ProviderRuntimeEvent` values, not candidate-only event shapes.
9. Add tests proving Pi can be registered and routed without changing existing provider behavior.

## Explicitly out of scope
1. Full orchestration projection validation for Pi events.
2. Durable Pi session binding and server-restart resume tests.
3. Composer slash-command discovery, search, or invocation UI.
4. Pi model inventory and model switching through `ModelRegistry`.
5. Pi confirm/select/text-input UI bridging.
6. Rollback support.
7. Real multi-thread load testing.
8. Any claim that Pi is daily-usable in the UI.

## Proposed implementation steps
### 1. Adapter contract fit
1. Read the current `ProviderAdapterShape` contract in `apps/server/src/provider/Services/ProviderAdapter.ts`.
2. Compare it against `PiProviderAdapterCandidateShape` in `apps/server/src/provider/Services/PiProviderAdapterCandidate.ts`.
3. Decide whether the Pi adapter can be a thin wrapper around `PiProviderAdapterCandidate` or whether the candidate should be renamed/refactored into the real adapter.
4. Prefer the thin wrapper if it avoids churn and keeps the proven local bridge stable.

Expected result:
- new `apps/server/src/provider/Services/PiAdapter.ts`
- new `apps/server/src/provider/Layers/PiAdapter.ts`
- no duplicated Pi SDK lifecycle logic

### 2. Canonical event stream boundary
1. Verify the candidate stream event type against `ProviderRuntimeEvent` from `@t3tools/contracts`.
2. If the existing candidate events are already canonical in shape, encode that with types/tests instead of remapping unnecessarily.
3. If there are candidate-only differences, add a small mapper at the Pi adapter boundary.
4. Add regression coverage for `turn.started`, `item.started`, `content.delta`, `item.completed`, `turn.completed`, session state, and error events that the Pi adapter exposes.

Expected result:
- `PiAdapter.streamEvents` is safe for `ProviderService` subscription
- no visible completion is emitted for internal Pi `toolUse` boundaries

### 3. Registry integration
1. Import `PiAdapter` into `ProviderAdapterRegistryLive`.
2. Resolve it with `Effect.serviceOption(PiAdapter)` like Cursor, or provide it unconditionally if all dependencies are safe.
3. Add Pi to the default adapter list only when the Pi adapter service is available.
4. Update `ProviderAdapterRegistryLive` tests to prove:
   - existing provider order remains stable
   - Pi resolves when the fake Pi adapter is provided
   - unsupported provider behavior remains unchanged

Expected result:
- `ProviderAdapterRegistry.getByProvider("pi")` can resolve Pi in server runtime layers
- tests do not require a real Pi install

### 4. ProviderService routing tests
1. Add or extend `ProviderService` tests with a fake Pi adapter through the registry options path.
2. Verify disabled Pi fails through the existing settings gate before the adapter starts a session.
3. Verify enabled Pi can:
   - start a session
   - upsert provider session binding with provider `pi`
   - send one turn
   - interrupt a turn
   - stop the session
4. Verify unsupported Pi send paths fail before invoking the underlying Pi prompt path.
5. Confirm existing Codex, Claude, Cursor, and OpenCode routing tests still pass.

Expected result:
- `ProviderService` can route to Pi at the shared provider layer in tests
- runtime execution is still settings-gated and not accidentally advertised as generally available in the web picker

### 5. Documentation handoff
1. Update this plan with actual results and changed decisions.
2. Update [`pi-provider-progress.md`](./pi-provider-progress.md) only when the slice reaches a stable stop point.
3. If the next slice is runtime ingestion/projection validation, create or activate a separate Phase 3 subplan instead of continuing under this one.

## Tests to add or update
1. `apps/server/src/provider/Layers/PiAdapter.test.ts`
   - adapter delegates start/session lifecycle to the candidate
   - unsupported operations fail explicitly
   - stream event shape is canonical
2. `apps/server/src/provider/Layers/ProviderAdapterRegistry.test.ts`
   - Pi can be registered and resolved
   - provider list includes Pi only when the Pi adapter is provided, if optional registration is chosen
3. `apps/server/src/provider/Layers/ProviderService.test.ts`
   - Pi disabled settings gate fails before adapter session start
   - Pi enabled routes start/send/interrupt/stop through `ProviderService`
   - Pi binding is persisted with provider `pi`
4. Existing Pi candidate tests should remain intact and should not be rewritten unless the candidate is intentionally renamed.

## Validation commands
Run these before calling the slice complete:

```sh
bun run --cwd apps/server test \
  src/provider/Layers/PiAdapter.test.ts \
  src/provider/Layers/ProviderAdapterRegistry.test.ts \
  src/provider/Layers/ProviderService.test.ts \
  src/provider/Layers/PiProviderAdapterCandidate.test.ts \
  src/provider/piAdapterCandidate.test.ts

bun fmt
bun lint
bun typecheck
bun run build
bun run test
```

Do not use `bun test`; this repo requires `bun run test`.

## Stop criteria
Do not mark this slice done until all of the following are true:

1. Pi has a real adapter service/layer satisfying `ProviderAdapterShape<ProviderAdapterError>`.
2. The adapter uses the existing proven Pi bridge or an intentionally renamed version of it without duplicating lifecycle logic.
3. `ProviderAdapterRegistry` can resolve Pi in tests.
4. `ProviderService` can route start/send/interrupt/stop to Pi in tests when Pi is enabled.
5. Disabled Pi still fails before any Pi runtime session starts.
6. Unsupported Pi operations fail explicitly and predictably.
7. Canonical event stream compatibility is tested at the adapter boundary.
8. Existing provider tests remain green.
9. Progress docs are updated at the stable stop point.
10. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
11. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.

## Risks and guardrails
1. Do not let Pi become silently selected by default provider flows. It should only run when explicitly requested and enabled.
2. Do not start real Pi sessions in status or registry tests. Use fakes and the existing candidate test seams.
3. Do not weaken the Phase 1 lifecycle contract to make ProviderService tests easier.
4. Do not swallow unsupported paths. Explicit errors are safer than pretending Pi supports more than it does.
5. Do not mix this slice with command UI, model inventory, or full resume hardening. Those are separate slices.
