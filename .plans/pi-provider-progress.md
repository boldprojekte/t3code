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

## Current summary
Overall status: server-side Pi groundwork exists, the local real-thread exerciser is now in place, and shared-contract integration should wait until we account for the real Pi turn lifecycle.

Current position:
1. thin SDK host exists
2. runtime event mapping exists
3. thread-owned Pi session layer exists
4. provider-shaped local bridge exists outside shared contracts
5. a real-thread exerciser exists at `apps/server/scripts/pi-provider-exerciser.ts`
6. real Pi runs proved start, command discovery, abort, stop, stopAll, and session-file resume
7. shared-contract integration has not started yet because real Pi prompt lifecycles exposed one important mismatch

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

Next:
- [ ] Decide how the bridge should model Pi prompts that continue across multiple Pi `turn_start` and `turn_end` cycles after the first tool-use boundary
- [ ] Decide whether `sendTurn()` should return on first mapped turn completion or continue waiting for the entire Pi prompt lifecycle
- [ ] Re-check unsupported paths after that lifecycle decision, especially plan mode and future slash-command execution

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
Built and validated a real-thread Pi exerciser plus the adapter fixes it exposed:
- `apps/server/scripts/pi-provider-exerciser.ts`
- `apps/server/src/provider/piProviderExerciser.ts`
- `apps/server/src/provider/piProviderExerciser.test.ts`
- `apps/server/src/provider/piSdkSpike.ts`
- `apps/server/src/provider/piSdkSpike.test.ts`

Why it matters:
1. It replaced fake-session assumptions with observed behavior against a real Pi install and this repo.
2. It proved that command discovery must use the real `extensionRunner` path and that headless session ownership should not call `bindExtensions()` in Phase 1.
3. It surfaced the main remaining integration question: complex Pi prompts can keep running across multiple internal turns after the first mapped `turn.completed`, so the current `sendTurn()` boundary is not yet the final shared-contract seam.
