# Pi Provider Phase 0.1: Server-Side SDK Spike

## Goal
Prove the thinnest useful Pi integration inside the T3 server codebase before touching shared provider contracts or the web app.

This slice should answer four questions with code, not guesses:

1. Can the server load the Pi SDK reliably from a real install?
2. Can it create or resume an isolated Pi session for a thread workspace?
3. Can it stream enough session events to support T3's orchestration model later?
4. Can it discover slash commands, prompt templates, and skills from the active Pi session?

## Scope for this slice
1. Add a small server utility that loads the Pi SDK dynamically.
2. Create a thin Pi session host around `createAgentSessionRuntime()`.
3. Bind extensions and expose command discovery via `session.getCommands()`.
4. Map a minimal set of Pi SDK session events into a T3-local spike event shape.
5. Add tests with a fake Pi SDK module so the spike is stable in CI.
6. Add a small runnable script for manual local validation against a real Pi install.

## Explicitly not in scope here
1. Adding `pi` to shared provider contracts.
2. Wiring Pi into the provider picker or thread creation UI.
3. Persisting Pi session bindings in T3 tables.
4. Full event mapping into canonical `ProviderRuntimeEvent`.
5. Approval and user-input bridging.
6. Rollback semantics.

## Done criteria for this slice
1. The server can create a Pi runtime for a cwd.
2. A prompt can be sent through the spike host.
3. `getCommands()` returns normalized slash command metadata.
4. Core streaming signals are exposed in a stable internal shape.
5. Tests pass without depending on a real Pi install.
6. Manual probing is possible via a script.

## Next step after this slice
If this lands cleanly, Phase 0.2 should turn the spike host into a real provider adapter candidate and decide how Pi events map onto `ProviderRuntimeEvent` without leaking Pi-only semantics.
