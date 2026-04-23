# Subplan: Pi Phase 2 Shared Contracts and Provider Status

Status: done

## Role of this document
This is the next focused execution slice after Phase 1 local bridge hardening.

Use it for:
1. introducing Pi into the shared provider contract surface
2. adding provider metadata and ordering so server and web can tolerate Pi as a first-class provider
3. adding a minimal Pi provider status path for install/version/auth and available inventory where the local bridge already has truth

If this file is linked directly in a new chat, also read [`pi-provider-progress.md`](./pi-provider-progress.md) first for current overall status and [`pi-provider-integration-daily-usable.md`](./pi-provider-integration-daily-usable.md) for the durable roadmap.

## Objective
Make Pi visible and contract-valid as a first-class provider without yet wiring the full provider runtime adapter into orchestration.

Phase 1 proved the local server-side Pi path enough to enter shared-contract work. This slice should add only the contract and status foundation needed before ProviderService and orchestration integration.

## In scope
1. Add `pi` to shared provider contract schemas and TypeScript provider unions.
2. Add Pi display metadata and provider ordering wherever providers are listed or rendered.
3. Add a minimal Pi provider status implementation for installed/version/auth state.
4. Surface Pi command and model inventory only where there is already a reliable server-side source, otherwise return explicit empty or unsupported fields.
5. Update server and web tests that assert provider lists, snapshots, or schema parsing.

## Explicitly out of scope
1. Building the real shared-contract Pi runtime adapter.
2. Registering Pi in `ProviderService` for real turn execution.
3. Persisting Pi session bindings in provider runtime state.
4. Composer slash-command UI work.
5. Web thread action gating beyond what shared provider metadata requires.

## Proposed work steps
### 1. Contract inventory
1. Find every shared provider enum/union/schema that currently excludes Pi.
2. Identify server and web call sites that assume the existing provider set is exhaustive.
3. Decide the smallest safe contract addition for `pi` without lying about unsupported capabilities.

### 2. Provider metadata and status
1. Add Pi metadata with conservative defaults.
2. Add status probing that can report Pi unavailable, installed, or ready without starting a full work session unnecessarily.
3. Keep model and command inventory honest if the status layer cannot load them reliably yet.

### 3. Compatibility pass
1. Run server and web contract tests.
2. Update provider snapshot expectations.
3. Verify existing Codex, Claude, Cursor, and OpenCode paths are unchanged.

## Stop criteria
Do not call this slice done until all of the following are true:

1. `pi` is accepted by shared provider contracts.
2. Provider lists and snapshots include or tolerate Pi without runtime crashes.
3. Unsupported Pi capabilities remain explicit instead of implied by metadata.
4. The progress document is updated at the slice stop point.
5. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` pass.

## Results
Implemented and verified on 2026-04-23:

1. `pi` is now accepted by the shared provider contract surface through `ProviderKind`, `ModelSelection`, model defaults, display names, and server settings schemas.
2. Pi has conservative model settings: default model slug `default`, empty model options, and no custom-model editing in the settings UI.
3. Server provider status now includes a Pi provider source. It can report disabled, SDK load failure, or SDK-ready status without starting a Pi work session.
4. Pi provider status reports auth as `unknown` and model, slash-command, and skill inventory as empty for this slice. Runtime inventory stays deferred until the ProviderService integration path owns real Pi sessions.
5. Server provider cache ordering includes Pi after currently executable providers.
6. Web provider metadata includes Pi as a known provider with a conservative `soon` picker entry, icon fallback, empty model list tolerance, and no runtime execution exposure.
7. Server text-generation settings do not select Pi yet. If Pi is manually enabled and selected there, the server falls back to the first supported text-generation provider instead of routing unsupported Pi model selections into Git text generation.
8. Existing Codex, Claude, Cursor, and OpenCode provider paths remain unchanged except for exhaustive provider maps tolerating Pi.
9. Targeted contract, shared model/settings, provider registry/cache, and web composer tests passed before the final full gate.
10. `bun fmt`, `bun lint`, `bun typecheck`, `bun run build`, and `bun run test` passed for the Phase 2 closure point.

Decision:

1. Phase 2 is complete.
2. The next slice is Phase 3 ProviderService and Orchestration Integration.
