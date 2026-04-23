# Subplan: Pi Phase 4 Composer Commands and Thread UX

Status: planned

## Role of this document
This is the first planned Phase 4 slice after Phase 3 ProviderService integration is closed.

Use it for:
1. making Pi useful from the normal T3 composer flow
2. surfacing Pi command inventory without pretending unsupported UI paths are ready
3. gating thread actions that Pi cannot support yet
4. keeping Phase 4 focused on command/thread UX instead of provider runtime wiring

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md).

## Objective
Expose Pi-backed threads through the existing composer and thread UX in a conservative way.

Phase 3 proved Pi can run through `ProviderService`, stream canonical provider events, persist session-file bindings, and resume through the normal provider runtime path. Phase 4 should now make that usable from the web app without overclaiming unsupported Pi capabilities.

## In scope
1. Decide the minimal UI entrypoint for creating or selecting a Pi-backed thread.
2. Surface Pi command inventory for the active Pi session, likely lazily per active thread.
3. Support slash-command-shaped invocation where the bridge can safely treat it as prompt text or a command selection result.
4. Hide or disable unsupported Pi thread actions:
   - attachments
   - model switching
   - plan mode
   - rollback
   - approval callback UI
   - structured user-input callback UI
5. Keep the UI honest when Pi is disabled, unavailable, or has no active session command inventory yet.
6. Add server and web tests around provider selection, composer metadata, and unsupported action gating.

## Explicitly out of scope
1. Full Pi TUI parity.
2. General Pi extension UI rendering.
3. Model inventory and model switching.
4. Approval or user-input callback bridging.
5. Multi-thread stress testing beyond what is necessary for the UI slice.
6. Release polish.

## Proposed implementation steps
### 1. Inventory current composer/provider flows
1. Review provider picker and model picker behavior for unavailable providers.
2. Review composer slash-command infrastructure and draft persistence.
3. Review thread action capability gates.
4. Decide whether Pi should appear as selectable, experimental, or hidden behind settings for this slice.

### 2. Server command inventory seam
1. Reuse the existing Pi adapter command discovery path where possible.
2. Add a provider-neutral API only if the existing API shape cannot safely carry Pi commands.
3. Keep command inventory lazy and scoped to the active thread/session.
4. Return empty inventory or explicit unavailable status when no Pi session exists.

### 3. Web composer integration
1. Show Pi command suggestions only for Pi-backed active threads.
2. Avoid invoking unsupported extension UI callbacks.
3. Keep slash-shaped raw prompts safe.
4. Make disabled or unavailable Pi states clear without breaking existing provider flows.

### 4. Unsupported action gating
1. Ensure attachments cannot be sent to Pi.
2. Ensure plan mode cannot be selected for Pi.
3. Ensure model switching is hidden or disabled for Pi.
4. Ensure rollback actions are hidden or fail predictably.

## Validation commands
Run these before calling the slice complete:

```sh
bun fmt
bun lint
bun typecheck
bun run build
bun run test
```

Do not use `bun test`; this repo requires `bun run test`.

## Stop criteria
Do not mark this slice done until all of the following are true:

1. The chosen Pi composer entrypoint is implemented and tested.
2. Pi command inventory is either surfaced for active Pi threads or explicitly deferred with a narrower follow-up subplan.
3. Unsupported Pi actions are hidden, disabled, or explicitly rejected with tests.
4. Existing non-Pi composer/provider behavior remains unchanged.
5. Progress docs are updated with observed results.
6. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
7. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
