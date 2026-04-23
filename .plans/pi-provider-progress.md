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
Overall status: server-side Pi groundwork exists, the local real-thread exerciser and turn-lifecycle contract slices are done, and Phase 1 is now down to one last unsupported-path recheck before shared-contract integration.

Current position:
1. thin SDK host exists
2. runtime event mapping exists
3. thread-owned Pi session layer exists
4. provider-shaped local bridge exists outside shared contracts
5. a real-thread exerciser exists at `apps/server/scripts/pi-provider-exerciser.ts`
6. real Pi runs proved start, command discovery, abort, stop, stopAll, and session-file resume
7. the local bridge now treats one visible T3 turn as one full Pi prompt lifecycle, even when Pi crosses multiple internal `toolUse` turn boundaries
8. shared-contract integration has not started yet because we still need one last unsupported-path recheck against that lifecycle contract

## Status by roadmap phase

### Phase 1: Local real-thread exerciser and server-only hardening
Status: active

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

Next:
- [ ] Run the focused unsupported-path recheck slice in [`pi-provider-phase-1-unsupported-path-recheck.md`](./pi-provider-phase-1-unsupported-path-recheck.md)
- [ ] Re-check plan mode against the chosen lifecycle contract
- [ ] Re-check future slash-command execution behavior against the chosen lifecycle contract
- [ ] Decide whether anything from that recheck changes the Phase 2 shared-contract entry criteria

### Phase 2: Shared provider contracts and provider status
Status: not started

Planned:
- [ ] Add `pi` to shared provider contracts
- [ ] Add Pi provider metadata and ordering
- [ ] Add Pi status and model inventory service
- [ ] Make server and web tolerate Pi as a first-class provider

### Phase 3: ProviderService and orchestration integration
Status: not started

Planned:
- [ ] Build the real shared-contract Pi provider adapter
- [ ] Register Pi in provider registry and provider service
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
- [planned] [Pi Phase 1 Unsupported Path Recheck](./pi-provider-phase-1-unsupported-path-recheck.md)

When a concrete execution slice starts, add it here with status:
- planned
- active
- blocked
- done

Suggested format:
- `[status] [subplan-name](./subplan-file.md)`

## Known guardrails right now
These are current intentional limitations, not accidents:

1. No shared-contract `pi` provider yet.
2. No provider registry or `ProviderService` integration yet.
3. No attachment support in the local Pi provider-shaped bridge.
4. No model selection support in the local Pi provider-shaped bridge.
5. No approval callback or user-input callback bridge yet.
6. No rollback support.
7. No Pi-specific TUI UI rendering.

## Last meaningful completed slice
Chose and hardened the local turn-lifecycle contract for Pi prompts that cross internal `toolUse` boundaries:
- `apps/server/src/provider/piAdapterCandidate.ts`
- `apps/server/src/provider/piAdapterCandidate.test.ts`
- `apps/server/src/provider/Layers/PiProviderAdapterCandidate.test.ts`

Why it matters:
1. A fresh real trace on 2026-04-23 showed one prompt continuing across at least ten internal Pi turns with repeated `turn.completed (toolUse)` boundaries and no final completion before the exerciser timeout.
2. That proved the old projection was wrong for shared-contract work because it created multiple visible completions for what is externally still one prompt lifecycle.
3. The local bridge now keeps one visible turn open across internal Pi `toolUse` boundaries and only emits visible `turn.completed` when the full Pi prompt lifecycle actually finishes.
