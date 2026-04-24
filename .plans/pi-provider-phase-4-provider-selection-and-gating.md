# Subplan: Pi Phase 4 Provider Selection and Conservative Composer Gating

Status: done

## Role of this document
This is the first focused Phase 4 execution slice.

Use it for:
1. making Pi selectable from the normal provider/model picker when the server reports Pi ready
2. keeping Pi on a single conservative default model until runtime model inventory is implemented
3. blocking composer actions the Pi bridge explicitly does not support yet
4. preparing the later command-inventory slice without claiming it is done

If this file is linked directly in a new chat, read [`pi-provider-progress.md`](./pi-provider-progress.md) first, then [`pi-provider-phase-4-composer-command-thread-ux.md`](./pi-provider-phase-4-composer-command-thread-ux.md).

## Objective
Allow a user to choose Pi in the composer only when Pi is actually ready, and keep unsupported actions out of the normal send path.

This is not the command inventory slice. It is the minimum usable UI entrypoint and safety gate needed before Pi commands can be surfaced.

## In scope
1. Include Pi in the available provider list so the picker can render it.
2. Keep Pi disabled in the picker unless the server provider snapshot is `ready`.
3. Provide one conservative Pi model option, `default`, when no Pi model inventory exists.
4. Hide Pi plan-mode controls and built-in `/plan` / `/default` menu entries.
5. Let slash-shaped Pi prompts pass through as normal prompt text instead of switching T3 interaction mode.
6. Reject image attachments for Pi before dispatching to the server.
7. Add targeted web tests for picker selection and composer provider controls.

## Explicitly out of scope
1. Pi command inventory.
2. Pi command invocation semantics beyond pass-through slash-shaped prompt text.
3. Pi model inventory and model switching.
4. Approval or user-input callback bridging.
5. Full real UI manual validation.

## Validation commands
Run these before calling the slice complete:

```sh
bun run --cwd apps/web typecheck
bun run --cwd apps/web test src/components/chat/composerProviderRegistry.test.tsx
bun run --cwd apps/web test:browser src/components/chat/ProviderModelPicker.browser.tsx

bun fmt
bun lint
bun typecheck
bun run build
bun run test
```

Do not use `bun test`; this repo requires `bun run test`.

## Result
Done in this slice:
1. Pi is now present in the normal provider/model picker and is selectable when the server reports provider status `ready`.
2. Pi gets one conservative model picker option, `default`, displayed as `Default`, when no runtime model inventory is available.
3. Pi remains disabled in the picker when provider status is missing, disabled, warning, or error.
4. Composer provider controls now declare unsupported Pi features. Pi hides the plan-mode toggle and rejects image attachments before dispatch.
5. Built-in `/plan` and `/default` menu entries are hidden for Pi, and standalone slash-shaped Pi prompts are no longer interpreted as T3 interaction-mode switches.
6. Selecting Pi resets a draft/thread composer interaction mode back to `default` if the previous provider had left it in plan mode.

Targeted validation passed:

```sh
bun fmt
bun run --cwd apps/web typecheck
bun run --cwd apps/web test src/components/chat/composerProviderRegistry.test.tsx
bun run --cwd apps/web test:browser src/components/chat/ProviderModelPicker.browser.tsx
```

Next slice:
- [Pi Phase 4 Command Inventory](./pi-provider-phase-4-command-inventory.md)

## Stop criteria
Do not mark this slice done until all of the following are true:

1. Pi appears in the picker as a selectable provider only when provider status is ready.
2. Pi has exactly one conservative default model option without claiming model inventory support.
3. The composer hides or disables plan-mode controls for Pi.
4. Standalone `/plan` and `/default` are not interpreted as T3 mode switches while Pi is selected.
5. Image attachments are rejected for Pi before server dispatch.
6. Targeted web tests and full repo gates pass.
7. Progress docs are updated with observed results.
8. A coherent checkpoint commit is created and pushed to the private fork unless Jan says otherwise.
