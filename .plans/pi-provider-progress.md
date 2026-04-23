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
Overall status: Phase 1 server-only Pi hardening and Phase 2 shared provider contracts/status are done. The next work is the first Phase 3 slice: Pi adapter and registry seam.

Current position:
1. thin SDK host exists
2. runtime event mapping exists
3. thread-owned Pi session layer exists
4. provider-shaped local bridge exists outside shared contracts
5. a real-thread exerciser exists at `apps/server/scripts/pi-provider-exerciser.ts`
6. real Pi runs proved start, command discovery, abort, stop, stopAll, and session-file resume
7. the local bridge now treats one visible T3 turn as one full Pi prompt lifecycle, even when Pi crosses multiple internal `toolUse` turn boundaries
8. unsupported paths were re-checked against that lifecycle contract: plan mode remains an explicit hard failure and slash-command-shaped prompts are safe pass-through prompt text at this layer
9. shared-contract and provider-status integration is implemented: `pi` is accepted in contracts, appears in provider status, and is tolerated by server and web provider metadata without enabling runtime execution yet
10. ProviderService and orchestration integration has not started yet; the first concrete Phase 3 slice is the Pi adapter and registry seam

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
Status: next

Next focused slice:
- [ ] Execute [Pi Phase 3 Adapter and Registry Seam](./pi-provider-phase-3-adapter-registry-seam.md)

Planned after that:
- [ ] Feed canonical Pi runtime events into provider runtime ingestion
- [ ] Persist Pi session bindings in normal provider runtime state

### Phase 4: Composer commands and thread UX
Status: not started

Planned:
- [ ] Surface Pi command inventory in the composer
- [ ] Support slash command invocation in Pi threads
- [ ] Hide or disable unsupported Pi thread actions
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
- [planned] [Pi Phase 3 ProviderService and Orchestration Integration](./pi-provider-phase-3-provider-service-orchestration.md)
- [planned] [Pi Phase 3 Adapter and Registry Seam](./pi-provider-phase-3-adapter-registry-seam.md)

When a concrete execution slice starts, add it here with status:
- planned
- active
- blocked
- done

Suggested format:
- `[status] [subplan-name](./subplan-file.md)`

## Known guardrails right now
These are current intentional limitations, not accidents:

1. No ProviderService runtime execution for Pi yet.
2. No orchestration ingestion for Pi runtime events yet.
3. No attachment support in the local Pi provider-shaped bridge.
4. No model selection support in the local Pi provider-shaped bridge.
5. No approval callback or user-input callback bridge yet.
6. No rollback support.
7. No Pi-specific TUI UI rendering.

## Last meaningful completed slice
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
3. Phase 2 is closed with `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` passing. Runtime execution remains intentionally disabled until Phase 3 wires Pi through `ProviderService` and orchestration ingestion.
