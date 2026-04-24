# Subplan: Pi Phase 4 Command Inventory

Status: planned

## Role of this document
This is the next focused Phase 4 slice after provider selection and conservative composer gating.

Use it for:
1. surfacing Pi commands in the composer for active Pi-backed threads
2. keeping command discovery lazy and session-scoped
3. preserving slash-shaped prompt pass-through where no explicit command selection is made
4. avoiding unsupported Pi extension UI callbacks

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-phase-4-composer-command-thread-ux.md`](./pi-provider-phase-4-composer-command-thread-ux.md).

## Objective
Expose Pi command inventory through the existing composer command menu without turning this into a Pi TUI clone.

Phase 4 provider selection made Pi selectable when the server reports it ready and blocked unsupported composer actions. This slice should add command inventory for active Pi sessions only.

## In scope
1. Inspect the current server APIs that expose provider slash commands and skills.
2. Decide whether Pi commands can fit the existing `ServerProvider.slashCommands` shape or need a thread-scoped API.
3. Prefer lazy, active-thread command loading because Pi command inventory comes from a live session runtime.
4. Show Pi command suggestions only for Pi-backed active threads with a live or resumable Pi session.
5. Keep raw slash-shaped prompt text safe when no menu command is selected.
6. Add tests for server command inventory shape and web composer filtering.

## Explicitly out of scope
1. Full model inventory and model switching.
2. Approval or user-input callback UI bridging.
3. General Pi extension UI rendering.
4. Multi-thread stress testing beyond command lookup basics.
5. Prompt template or skill quality evaluation.

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

1. Pi command inventory is available for active Pi threads or explicitly deferred with an observed blocker.
2. The web composer shows Pi command suggestions only when the active thread/provider can support them.
3. Selecting a Pi command produces the intended prompt/command text without triggering unsupported extension UI flows.
4. Raw slash-shaped prompt text remains pass-through for Pi when no command is selected.
5. Existing non-Pi command behavior remains unchanged.
6. Progress docs are updated with observed results.
7. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.
8. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
