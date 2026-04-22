# PRD: Pi Provider Integration for Daily-Usable Multi-Thread Workflows

## Summary
Integrate Pi into T3 Code as a first-class provider with a deliberately scoped goal: daily-usable multi-thread work in the T3 UI while keeping Pi's real agent power under the hood.

This is not a Pi TUI port. The product outcome is simpler and more useful: Jan can choose Pi inside T3 Code, open many threads, let Pi work in each thread with its normal tools and extensions, use skills and slash commands where possible, and keep the experience stable enough for real project work.

## Problem
Pi already has the agent power we want: strong local tooling, extensions, skills, prompt templates, MCP, web tools, subagents, custom providers, and project-local behavior. T3 Code already has the UI shape we want: multiple threads, browser UI, provider picker, model picker, and a cleaner chat workflow for parallel work.

Right now those strengths are split across two products:

1. Pi has the engine power but not the multi-thread web UI we want.
2. T3 Code has the UI shell but no Pi runtime.

The goal is to combine them without chasing full feature parity with Pi's native TUI.

## User Outcome
After this work, Jan should be able to:

1. Open T3 Code and select `Pi` as a provider.
2. Create many threads that each run against an isolated Pi session.
3. Use Pi models, tools, skills, prompt templates, MCP integrations, subagents, and project-local Pi config from within T3.
4. See slash commands and skills in the composer when available.
5. Let Pi work on real repositories inside T3 without feeling like Pi was reduced to a toy text backend.

## Product Principles
1. Keep Pi powerful. Do not flatten Pi into plain text in, text out.
2. Keep T3 predictable. Do not leak Pi-specific runtime quirks through ad hoc UI exceptions.
3. Prefer code-level integration over prompt hacks.
4. Prefer provider-neutral server architecture over one-off bypasses.
5. Favor daily usability over perfect parity with Pi's TUI.

## Goals
1. Add Pi as a first-class T3 provider.
2. Preserve Pi's real runtime capabilities under the hood.
3. Support many concurrent threads backed by isolated Pi sessions.
4. Expose Pi slash commands, prompt templates, and skills where possible.
5. Persist and resume Pi-backed threads cleanly.
6. Keep the first release intentionally scoped and boring in the best sense.

## Non-goals
1. Full parity with Pi's interactive TUI.
2. Rendering Pi-specific TUI concepts such as `/tree`, `/settings`, `/resume`, or other built-in interactive commands.
3. Exact rollback parity with native T3 providers.
4. Rendering arbitrary `ctx.ui.custom()` TUI components from Pi extensions.
5. Rebuilding T3's orchestration model around Pi's session tree.
6. Supporting every extension UI edge case on day one.

## Scope Definition
### In scope for v1
1. Pi provider in provider picker, model picker, and thread creation flows.
2. Pi-backed prompt execution with streaming assistant text.
3. Pi tool execution with visible activity and results.
4. Pi abort support.
5. Per-thread Pi session persistence and resume.
6. Multiple concurrent Pi-backed threads.
7. Pi command discovery for extension commands, prompt templates, and skills.
8. Invocation of Pi slash commands by sending `/command` through the active Pi session.
9. Project-local and user-level Pi resources: skills, prompts, extensions, packages, AGENTS files, MCP.
10. Clean degradation for unsupported Pi UI-specific features.

### Explicitly out of scope for v1
1. `/tree` support.
2. Pi-native branch navigation UX.
3. Checkpoint revert for Pi threads.
4. Full support for Pi custom widgets, overlays, footer UI, or editor replacement.
5. One-to-one visual parity for Pi reasoning and compaction UI.

## Architecture Decision
### Use the Pi SDK, not `pi --mode rpc`, as the primary integration path
The server integration should use Pi's Node SDK directly.

Reasons:
1. T3 server is already TypeScript and long-lived.
2. SDK gives direct access to `createAgentSessionRuntime()`, `AgentSession`, `ModelRegistry`, `AuthStorage`, resource loading, and session lifecycle without subprocess framing overhead.
3. SDK keeps session control, model switching, abort, and persistence cleaner than an RPC sidecar.
4. SDK makes it easier to preserve Pi behavior instead of reimplementing it over JSONL.

RPC can remain a fallback or debugging path, but it should not be the main product architecture.

## Core Product Requirements
### 1. Provider identity and lifecycle
T3 must recognize `Pi` as a first-class provider.

Requirements:
1. Add `pi` to the provider contract surface.
2. Show Pi in the provider picker and provider status lists.
3. Surface installed, version, and auth state in a way that matches T3's existing provider UX closely enough.
4. Keep provider-neutral abstractions intact. Pi-specific logic stays inside Pi adapter and provider layers.

### 2. Model inventory and selection
Users must be able to choose models for Pi-backed threads.

Requirements:
1. Read available Pi models from `ModelRegistry`.
2. Respect built-in models, custom models, and dynamic providers registered by Pi extensions.
3. Surface model capabilities as far as T3's picker needs them.
4. Persist selected model per thread.
5. Restore the model on resume when possible.

### 3. Per-thread session mapping
Each T3 thread must map to an isolated Pi session.

Requirements:
1. A T3 thread owns one Pi `AgentSessionRuntime` or equivalent persisted Pi session context.
2. Pi session file and session id must be persisted in T3's thread-side runtime metadata.
3. Multiple Pi-backed threads can exist concurrently without shared conversation state.
4. Server restart or app reload must not destroy Pi thread history.
5. Reopening a thread should resume the same Pi session where possible.

### 4. Prompting, streaming, and abort
The baseline chat loop must feel native.

Requirements:
1. T3 composer sends prompts into the active Pi session.
2. Streaming assistant text appears incrementally.
3. Tool execution activity appears while Pi is working.
4. Abort stops the active Pi turn.
5. Follow-up turns continue inside the same Pi session.

### 5. Preserve Pi power under the hood
Pi must retain the capabilities that make it worth integrating.

Requirements:
1. Keep Pi's default resource loading behavior unless T3 has a concrete reason to override it.
2. Respect user-level and project-level Pi resources.
3. Preserve Pi tools, custom tools, MCP integrations, extensions, skills, and prompt templates.
4. Preserve Pi subagents and web tools through the normal Pi runtime path.
5. Avoid reducing Pi to a custom text completion provider.

### 6. Slash command, prompt template, and skill discovery
Jan explicitly wants slash commands and skills if possible.

Requirements:
1. Use Pi command discovery to fetch invokable commands from the active Pi runtime.
2. Surface extension commands, prompt templates, and skills in T3 composer search or autocomplete.
3. Invoking a command should send the corresponding `/command` prompt to Pi.
4. Command discovery must refresh on new Pi sessions and after resource reload when possible.
5. Built-in Pi TUI-only commands should not be shown when they do not make sense in T3.

Implementation note:
Pi exposes `pi.getCommands()` for extension, prompt, and skill command discovery. Prefer this SDK path over building a separate command index.

### 7. UI boundary for Pi-specific interactions
Pi extensions can request UI interactions. We need a clear supported boundary.

Requirements:
1. Support the smallest useful subset first: confirm, select, and text input flows that can map to T3 dialogs.
2. Treat unsupported Pi UI features as unsupported, not half-working magic.
3. Do not attempt to render arbitrary Pi TUI components in the first release.
4. If an extension requires unsupported UI, fail clearly and visibly.

### 8. Unsupported feature handling
We need honest degradation, not hidden breakage.

Requirements:
1. Pi threads should not expose T3 rollback or revert actions until a real Pi-compatible strategy exists.
2. T3 should disable or hide unsupported actions for Pi threads instead of pretending they work.
3. Missing parity items should be documented inside the code and the product notes.

## Product Behavior Decisions
### Decision 1: Do not implement `/tree`
We will not map Pi's session tree into T3 for v1.

Reason:
1. Jan does not need it.
2. It adds a large amount of session semantics work for little product value.
3. It risks dragging the whole project into parity work instead of usable integration.

### Decision 2: Do not implement rollback in v1
For Pi-backed threads, rollback and checkpoint revert are out of scope.

Reason:
1. T3's current rollback model assumes provider turn rollback semantics.
2. Pi's equivalent concept is session tree navigation, not provider-native rollback.
3. A fake rollback would be dangerous and confusing.

### Decision 3: Preserve Pi resources by default
The first release should use Pi's normal resource loading behavior.

Reason:
1. That is how we keep the full Pi power.
2. It ensures existing skills, prompts, extensions, AGENTS files, packages, and MCP setups continue to work.
3. It avoids building a second Pi config system inside T3.

## Likely Technical Shape
### Server side
Likely new or changed areas:
1. `packages/contracts/src/orchestration.ts`
2. `packages/contracts/src/provider.ts`
3. `packages/contracts/src/providerRuntime.ts`
4. `packages/contracts/src/server.ts`
5. `packages/contracts/src/model.ts`
6. `apps/server/src/provider/Services/*`
7. `apps/server/src/provider/Layers/*`
8. `apps/server/src/orchestration/*` where provider commands and runtime ingestion meet the canonical event stream

### Web side
Likely new or changed areas:
1. provider picker and provider model picker
2. composer command search and slash command suggestion UI
3. thread actions and unsupported-feature gating for Pi threads
4. message and activity rendering for mapped Pi runtime events

### Pi integration layer
Likely responsibilities:
1. create and own Pi session runtime instances
2. map `AgentSessionEvent` into canonical `ProviderRuntimeEvent`
3. expose Pi model and auth snapshots to T3 provider status APIs
4. fetch Pi commands for the active session
5. persist T3 thread to Pi session bindings

## Phased Delivery
### Phase 0: Spike and contract confirmation
1. Verify SDK-first integration in a thin server-only prototype.
2. Confirm command discovery through `pi.getCommands()`.
3. Confirm that project-local Pi resources load correctly inside a non-TUI runtime.
4. Confirm what subset of Pi extension UI interactions can be bridged sanely.

### Phase 1: Provider contracts and picker support
1. Add `pi` to provider contracts and model selection contracts.
2. Add Pi display metadata and provider ordering.
3. Make the web app tolerate Pi as a provider without runtime work yet.

### Phase 2: Pi provider status and model inventory
1. Add a Pi provider snapshot service.
2. Surface version, auth, and model inventory.
3. Wire Pi into provider settings and picker UX.

### Phase 3: Session runtime and core prompt loop
1. Create Pi adapter and runtime owner in `apps/server`.
2. Map T3 thread start to Pi session creation.
3. Support prompt, stream, tool activity, and abort.
4. Persist the Pi session binding.

### Phase 4: Command and skill discovery
1. Fetch command inventory from Pi.
2. Surface commands in the composer.
3. Allow slash command invocation in active Pi threads.
4. Verify prompt templates and skill commands execute correctly.

### Phase 5: Resume and multi-thread hardening
1. Resume Pi sessions after restart.
2. Validate many independent Pi-backed threads.
3. Ensure thread switching does not leak state across sessions.
4. Harden provider session cleanup and stale session recovery.

### Phase 6: UI boundary and unsupported-action gating
1. Add clear unsupported behavior for rollback and Pi TUI-specific actions.
2. Bridge minimal confirm, select, and input dialogs.
3. Add visible errors for unsupported extension UI.

### Phase 7: Hardening and release gate
1. Add integration tests for prompt loop, tool activity, commands, and resume.
2. Run format, lint, typecheck, and targeted tests.
3. Validate multi-thread behavior manually with a real Pi-configured workspace.

## Risks
1. Pi command discovery may depend on extension/runtime binding details that are less documented than RPC.
2. Some Pi extensions may assume TUI-only UI methods and fail in T3 unless explicitly bridged.
3. Thread-to-session persistence bugs could leak history or break resume.
4. Provider-neutral runtime mapping may get messy if we let Pi-specific shortcuts leak into shared layers.
5. Auth state may not map one-to-one with T3's current provider status expectations.

## Mitigations
1. Prove command discovery in Phase 0 before committing to UX details.
2. Keep a strict supported UI subset for Pi extension interactions.
3. Persist explicit Pi session metadata instead of inferring resume state.
4. Keep event mapping inside the Pi adapter boundary.
5. Disable unsupported thread actions rather than shipping misleading UI.

## Open Questions
1. Should Pi provider status be based on import availability alone, or also on whether a usable model is configured?
2. How much of Pi thinking and compaction state should be visible in T3 UI?
3. Do we need one long-lived Pi runtime service plus per-thread sessions, or a tighter per-thread runtime owner?
4. Which Pi extension UI methods can be cleanly bridged without pulling T3 toward a Pi TUI clone?
5. Should command inventory be fetched lazily per active thread or cached per environment?

## Validation
Minimum validation for the plan to count as delivered:
1. The fork exists at `~/Projects/t3code` and tracks both origin and upstream.
2. This PRD lives inside the repo under `.plans/`.
3. The plan is explicit about goals, non-goals, risks, phased delivery, and unsupported features.
4. The plan reflects Jan's stated priority: multi-thread usability with full Pi power, not TUI parity.

## Done Criteria for the future implementation
The implementation should only count as done when all of the following are true:

1. Pi appears as a provider in T3.
2. Pi-backed threads can be created, resumed, and used for real work.
3. Tooling, skills, prompt templates, and slash commands work in a way that is actually useful.
4. Unsupported actions for Pi threads are hidden or disabled instead of failing ambiguously.
5. Multi-thread behavior is stable.
6. `bun fmt`, `bun lint`, and `bun typecheck` pass.
7. Targeted tests covering the Pi provider path pass.
