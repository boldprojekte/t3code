# Pi Provider Progress

## Role of this document
This file tracks current execution status for the Pi provider effort.

Use it for:
1. where we are now
2. what is done
3. what is next
4. which focused subplans exist

If a new chat needs context for the Pi effort, link this file first. It should be the single entrypoint. From here, the reader can find the durable product spec in [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) and the active execution slice in the focused subplans section.

Do not use this file as the durable product spec. The product roadmap and scope live in [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md).

## Truth model
- PRD: durable product truth and roadmap
- Progress: current execution state and the default new-chat entrypoint
- Subplans: focused implementation slices that can change more freely

## Execution discipline
- Keep this file stand der Wahrheit. Record only observed status, completed validation, and the actually active next slice.
- When a focused slice or roadmap phase reaches a stable stop point, update this progress file before starting the next slice.
- When a slice closes, also update the linked subplan status. If the next slice is different work, create or activate a new subplan here instead of silently continuing under an old one.

## Current summary
Overall status: Phase 1 server-only Pi hardening, Phase 2 shared provider contracts/status, Phase 3 ProviderService/orchestration integration, and the first Phase 4 provider-selection/gating slice are done. The next work is Phase 4 Pi command inventory.

Current position:
1. thin SDK host exists
2. runtime event mapping exists
3. thread-owned Pi session layer exists
4. provider-shaped local bridge exists outside shared contracts
5. a real-thread exerciser exists at `apps/server/scripts/pi-provider-exerciser.ts`
6. real Pi runs proved start, command discovery, abort, stop, stopAll, and session-file resume
7. the local bridge now treats one visible T3 turn as one full Pi prompt lifecycle, even when Pi crosses multiple internal `toolUse` turn boundaries
8. unsupported paths were re-checked against that lifecycle contract: plan mode remains an explicit hard failure and slash-command-shaped prompts are safe pass-through prompt text at this layer
9. shared-contract and provider-status integration is implemented: `pi` is accepted in contracts, appears in provider status, and is tolerated by server and web provider metadata; server-side ProviderService routing now exists behind explicit settings enablement
10. Pi is now resolvable through the normal provider adapter registry, routable through ProviderService, validated through runtime ingestion/projection tests, covered for session binding/resume with fake adapters, smoke-tested against real local Pi through ProviderService and PiAdapterLive, and selectable in the composer when provider status is ready

## Status by roadmap phase

### Phase 1: Local real-thread exerciser and server-only hardening
Status: done

Done:
- [x] Thin Pi SDK host exists in `apps/server/src/provider/piSdkSpike.ts`
- [x] Pi runtime mapping exists in `apps/server/src/provider/piAdapterCandidate.ts`
- [x] Session ownership layer exists in `apps/server/src/provider/Layers/PiAdapterCandidate.ts`
- [x] Provider-shaped local bridge exists in `apps/server/src/provider/Layers/PiProviderAdapterCandidate.ts`
- [x] Server-side tests cover SDK host, runtime mapping, session layer, and local provider-shaped bridge
- [x] Real-thread exerciser exists in `apps/server/scripts/pi-provider-exerciser.ts`
- [x] Real Pi runs verified start, command discovery, abort, stopSession, stopAll, and session-file resume
- [x] Headless bridge no longer depends on `bindExtensions()` for command inventory or event streaming
- [x] Turn-lifecycle contract chosen and tested: one visible T3 turn spans the full Pi prompt lifecycle, not each internal Pi `toolUse` turn boundary
- [x] Internal Pi `turn_end` with `stopReason: toolUse` no longer emits visible `turn.completed` or ready-state transitions in the local bridge
- [x] Plan mode re-checked: it remains an explicit `sendTurn` validation failure before any Pi prompt starts
- [x] Slash-command-shaped input re-checked: a real `/help` run completed as one visible prompt lifecycle, and the local bridge treats slash-shaped input as normal Pi prompt text

Closed decision:
- [x] Phase 1 is complete and does not add new blockers to Phase 2

### Phase 2: Shared provider contracts and provider status
Status: done

Done:
- [x] Added `pi` to shared provider contracts and model-selection schemas
- [x] Added Pi provider metadata, display name, default model, provider ordering, and status cache ordering
- [x] Added minimal Pi provider status that reports disabled, SDK load failure, or SDK-ready state without starting a work session
- [x] Kept Pi model, slash-command, skill, and auth inventory honest for this slice: empty inventory and `unknown` auth until the runtime integration path owns real sessions
- [x] Made server and web tolerate Pi as a first-class provider while keeping it unavailable for runtime execution in the picker
- [x] Kept server text generation on currently supported providers even if Pi is manually enabled in settings

### Phase 3: ProviderService and orchestration integration
Status: done

Done:
- [x] Built the real shared-contract Pi provider adapter
- [x] Registered Pi in provider adapter registry and server provider layer
- [x] Proved ProviderService start/send/interrupt/stop routing for enabled Pi in tests
- [x] Proved Pi runtime events flow through ProviderService stream/logging and ProviderRuntimeIngestion into orchestration projections
- [x] Proved Pi session-file resume cursor persistence, stale-session recovery, and restart-style recovery with fake adapters
- [x] Proved a real local Pi run through ProviderService and PiAdapterLive, including stop-and-resume through the persisted session file

Closed decision:
- [x] Phase 3 is complete and does not add new blockers to Phase 4

### Phase 4: Composer commands and thread UX
Status: active

Done:
- [x] Pi appears in the provider/model picker when provider status is ready
- [x] Pi uses one conservative `default` model option until runtime model inventory exists
- [x] Plan-mode controls and image attachments are gated off for Pi before dispatch

Next focused slice:
- [ ] Execute [Pi Phase 4 Command Inventory](./pi-provider-phase-4-command-inventory.md)

Planned:
- [ ] Surface Pi command inventory in the composer
- [ ] Support slash command invocation in Pi threads
- [ ] Verify prompt templates and skill commands are useful in practice

### Phase 5: Resume, multi-thread hardening, and minimal UI bridging
Status: not started

Planned:
- [ ] Resume Pi sessions after restart
- [ ] Validate many independent Pi-backed threads
- [ ] Ensure thread switching does not leak state
- [ ] Bridge only minimal confirm, select, and text input flows
- [ ] Keep unsupported extension UI failures explicit

### Phase 6: Hardening and release gate
Status: not started

Planned:
- [ ] Add Pi-path integration tests
- [ ] Manually validate real Pi workspaces and multi-thread behavior
- [ ] Pass `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test`

## Focused subplans
- [done] [Pi Phase 1 Local Real-Thread Exerciser](./pi-provider-phase-1-local-real-thread-exerciser.md)
- [done] [Pi Phase 1 Turn Lifecycle Contract](./pi-provider-phase-1-turn-lifecycle-contract.md)
- [done] [Pi Phase 1 Unsupported Path Recheck](./pi-provider-phase-1-unsupported-path-recheck.md)
- [done] [Pi Phase 2 Shared Contracts and Provider Status](./pi-provider-phase-2-shared-contracts-and-status.md)
- [done] [Pi Phase 3 ProviderService and Orchestration Integration](./pi-provider-phase-3-provider-service-orchestration.md)
- [done] [Pi Phase 3 Adapter and Registry Seam](./pi-provider-phase-3-adapter-registry-seam.md)
- [done] [Pi Phase 3 Runtime Ingestion and Projection Validation](./pi-provider-phase-3-runtime-ingestion-projection.md)
- [done] [Pi Phase 3 Session Binding and Resume](./pi-provider-phase-3-session-binding-resume.md)
- [done] [Pi Phase 3 Real ProviderService Smoke Validation](./pi-provider-phase-3-real-provider-service-smoke.md)
- [active] [Pi Phase 4 Composer Commands and Thread UX](./pi-provider-phase-4-composer-command-thread-ux.md)
- [done] [Pi Phase 4 Provider Selection and Conservative Composer Gating](./pi-provider-phase-4-provider-selection-and-gating.md)
- [planned] [Pi Phase 4 Command Inventory](./pi-provider-phase-4-command-inventory.md)

When a concrete execution slice starts, add it here with status:
- planned
- active
- blocked
- done

Suggested format:
- `[status] [subplan-name](./subplan-file.md)`

## Known guardrails right now
These are current intentional limitations, not accidents:

1. Pi appears in the provider/model picker only when the server provider snapshot is ready; command inventory is not surfaced yet.
2. Pi runtime ingestion/projection and session binding/resume are covered by tests, and the integrated ProviderService path has one real local Pi smoke pass.
3. No attachment support in the local Pi provider-shaped bridge or composer path.
4. No model selection support in the local Pi provider-shaped bridge.
5. No approval callback or user-input callback bridge yet.
6. No rollback support.
7. No Pi-specific TUI UI rendering.

## Last meaningful completed slice
Completed Phase 4 provider selection and conservative composer gating:
- `apps/web/src/session-logic.ts`
- `apps/web/src/modelSelection.ts`
- `apps/web/src/components/chat/ChatComposer.tsx`
- `apps/web/src/components/ChatView.tsx`
- `apps/web/src/components/chat/ProviderModelPicker.browser.tsx`
- `apps/web/src/components/chat/composerProviderRegistry.tsx`

Why it matters:
1. Pi can now be selected from the normal provider/model picker when the server reports Pi ready.
2. The composer keeps Pi conservative: default model only, no plan-mode switching, no standalone slash-command mode switching, and no image attachments.
3. The next Phase 4 gap is real Pi command inventory for active Pi threads.

Previous meaningful completed slice:
Completed Phase 3 real ProviderService smoke validation:
- `apps/server/scripts/pi-provider-service-smoke.ts`
- `apps/server/package.json`

Why it matters:
1. The real local Pi install now runs through `ProviderService`, `ProviderAdapterRegistry`, `PiAdapterLive`, `ProviderSessionDirectory`, and normal provider runtime persistence.
2. A real smoke pass observed 2 visible T3 turn lifecycles, 0 runtime errors, persisted provider `pi`, and `resumeCursor.sessionFile`.
3. Stop then `ProviderService.sendTurn` resumed successfully through the persisted Pi session file.

Previous meaningful completed slice:
Completed Phase 3 session binding and resume tests:
- `apps/server/src/provider/Layers/ProviderService.test.ts`

Why it matters:
1. Pi `resumeCursor.sessionFile` is now covered after start and send.
2. ProviderService stale-session recovery and restart-style recovery are covered with Pi-shaped fake adapters.
3. This prepared the real local Pi smoke through the integrated ProviderService seam.

Previous meaningful completed slice:
Completed Phase 3 runtime ingestion and projection validation:
- `apps/server/src/provider/Layers/ProviderService.test.ts`
- `apps/server/src/orchestration/Layers/ProviderRuntimeIngestion.test.ts`

Why it matters:
1. Pi canonical runtime events now have test coverage through `ProviderService.streamEvents` and canonical event logging.
2. Pi normal turn lifecycle, tool-use activity inside one visible turn, and runtime error events are validated through provider runtime ingestion into orchestration projections.
3. This prepared the persisted Pi session binding and resume slice.

Previous meaningful completed slice:
Completed Phase 3 adapter and registry seam:
- `apps/server/src/provider/Services/PiAdapter.ts`
- `apps/server/src/provider/Layers/PiAdapter.ts`
- `apps/server/src/provider/Layers/ProviderAdapterRegistry.ts`
- `apps/server/src/provider/Layers/ProviderService.test.ts`
- `apps/server/src/server.ts`
- `packages/contracts/src/providerRuntime.ts`

Why it matters:
1. Pi now has a real shared provider adapter surface backed by the already-tested local Pi bridge.
2. Pi can be resolved through `ProviderAdapterRegistry` and routed through `ProviderService` for start/send/interrupt/stop in tests when explicitly enabled.
3. Runtime ingestion and projection validation was the next focused slice before claiming broader orchestration integration.

Earlier meaningful completed slice:
Completed Phase 2 shared provider contracts and provider status:
- `packages/contracts/src/orchestration.ts`
- `packages/contracts/src/model.ts`
- `packages/contracts/src/settings.ts`
- `packages/shared/src/model.ts`
- `packages/shared/src/serverSettings.ts`
- `apps/server/src/provider/Layers/PiProvider.ts`
- `apps/server/src/provider/Services/PiProvider.ts`
- `apps/server/src/provider/Layers/ProviderRegistry.ts`
- `apps/server/src/provider/providerStatusCache.ts`
- web provider metadata and model-selection tolerance files

Why it matters:
1. `pi` is now a shared-contract provider and can appear in server provider status without crashing server or web provider maps.
2. The Pi status path is conservative: it validates SDK availability without starting a Pi work session, reports auth as `unknown`, and leaves model, slash-command, and skill inventory empty until runtime integration owns real sessions.
3. Phase 2 closed with `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` passing. Runtime execution was intentionally deferred until Phase 3.
