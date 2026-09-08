# Support Agent v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Vietnamese, Task-aware AI conversation surface to the PQG Application Shell without a parallel agent runtime or data store.

**Architecture:** The Shell exposes a narrow adapter over the current DSH session and owns the responsive chat UI. Task remains a dynamic module: its support provider contributes text prompts and its existing Makers tools remain the only data/action boundary.

**Tech Stack:** TypeScript, React runtime supplied by DSH, Mantine 8.3.18, DSH 0.1.0-rc.6, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-08-support-agent-v1-design.md`

## Global Constraints

- Use the active DSH session; do not create an endpoint, store, or custom agent transport.
- Keep Task data ownership and existing `pqg_task_*` Makers tools unchanged.
- Retain DSH's existing approval and cancellation carriers.
- Scope verification to affected tests, typecheck, and exact Makers build.

---

### Task 1: Add the Shell session adapter

**Files:**
- Modify: `packages/application-shell/src/contracts.ts`
- Modify: `packages/application-shell/src/services.ts`
- Test: `tests/system-services.test.ts`

**Produces:** `supportSession()`, `promptSupport(text)`, and `stopSupport()` on `ShellSystemServices`.

- [ ] Write a failing test proving blank prompt and absent current session are rejected, while a bound session receives `prompt([{ type: 'text', text }], 'queue')` and `cancel()`.
- [ ] Add the three narrow service methods, resolving only `sessions.list.getSnapshot().current` and `sessions.binding(id)?.session`.
- [ ] Keep accepted/rejected `RpcResult` behavior intact; expose no session mutation besides `prompt` and `cancel`.
- [ ] Run `node --experimental-strip-types --test tests/system-services.test.ts`.

### Task 2: Turn Support into a usable chat panel

**Files:**
- Modify: `packages/application-shell/src/client.tsx`
- Modify: `packages/application-shell/src/copy.ts`
- Test: `tests/application-shell-contract.test.ts`

**Consumes:** Task 1 service methods and the DSH `useSessions` snapshot hook.

- [ ] Write contract assertions for a native interactive suggestion, composer, send control, and Stop control.
- [ ] Render compact Vietnamese transcript rows from the active session snapshot: user text, assistant text, running assistant blocks, and concise tool-progress labels; suppress raw tool input/output.
- [ ] Render Suggestions as Mantine `Button`s that call the same send routine as the composer. Disable Send for blank input or no selected session; expose Stop only while the snapshot reports a running turn.
- [ ] Surface prompt/stop errors with Vietnamese copy and `services.notify`; retain desktop panel and mobile Drawer layout.
- [ ] Run `node --experimental-strip-types --test tests/application-shell-contract.test.ts`.

### Task 3: Make Task support prompts explicitly agent-ready

**Files:**
- Modify: `packages/task-module/src/client.tsx`
- Test: `tests/task-module.test.ts`

**Consumes:** Existing `ShellSupportSuggestion.prompt` contract.

- [ ] Write/extend the focused assertion that the three existing Task suggestions provide non-empty Vietnamese prompts.
- [ ] Keep the existing support summary and three prompts, only adjusting wording where needed so the model is explicitly asked to use Task data and ask for missing create/update details.
- [ ] Do not modify `service.ts` or `makers.ts`; the existing `pqg_task_list`, `pqg_task_create`, and `pqg_task_update` tools are reused unchanged.
- [ ] Run `node --experimental-strip-types --test tests/task-module.test.ts`.

### Task 4: Integrate and verify

**Files:**
- Modify: `docs/superpowers/specs/2026-09-08-support-agent-v1-design.md` only if implementation facts require correction.

- [ ] Run `npm run typecheck`.
- [ ] Run the three focused tests together with `node --experimental-strip-types --test tests/system-services.test.ts tests/application-shell-contract.test.ts tests/task-module.test.ts`.
- [ ] Run `npm run build:makers`.
- [ ] Commit the implementation with `feat: add pqg support agent v1`.
- [ ] After EdgeOne deploy, verify exact SHA, a Task read request, one approval-gated write request, Stop, reload, and the iPad Drawer.
