# Upstream Sources

This manifest records external source material deliberately reused by PQG-Harness. Pinning the exact upstream commit avoids silently importing later behavior changes.

| Upstream | Pinned commit | Reused files / semantics | Use in PQG-Harness | License |
| --- | --- | --- | --- | --- |
| `TencentEdgeOne/edgeone-makers-tools` | `f106ce7b9c5893cc3d4afafaec1eb67ed3f5b3c2` | Makers runtime docs for conversation routing, node entry, sandbox/store capabilities, and review checklist | Makers runtime contract: `/stop` dual-channel routing, `context.request.signal`, injected sandbox/store APIs, conversation-scoped persistent `context.store.state`, no process-local state as durable/shared coordination | Repository documentation/source; upstream project terms apply |
| `TencentEdgeOne/deepseek-harness` | `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` | `agents/stop.ts`, `_dsh-web-sidecar.ts`, `_mcp-bridge.ts`, `_workspace.ts` | Baseline DSH Web-on-Makers architecture; Stop delegates to sidecar close + platform `abortActiveRun` | MIT |
| `TencentEdgeOne/node-agent-starter` | `d8f77aec75b9d887be5dc8aae049a32d87efceec` | `agents/chat/stop.ts`, `agents/chat/index.ts` | Runner-owned cancellation pattern: `/stop` calls `abortActiveRun`; active request consumes `context.request.signal` | Upstream repository terms apply |
| `deepseek-ai/deepseek-harness` | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | `packages/shell/tool-bash/src/index.ts`, `packages/shell/bash-local/src/index.ts`, cancellation tests/docs, Session prompt contract | Cancellation semantics: pre-aborted calls do not dispatch; in-flight foreground execution receives an abort signal; process termination is owned by the running executor; `session.prompt` admits/acknowledges work rather than owning the later tool lifetime | MIT |

## Reuse policy

1. Search official EdgeOne/DeepSeek upstreams before implementing a platform primitive locally.
2. Prefer importing an existing dependency/API already present in the project; otherwise port only the smallest compatible semantic adapter.
3. Do not copy an upstream local-shell executor into Makers business code; Makers runtime code must continue to use injected `context.sandbox` / `context.tools`.
4. Preserve existing PQG security, persistence, auth, release, and branch-protection controls unless a reviewed change explicitly replaces them.
5. For substantial copied source, retain the upstream copyright/license notice required by its license. Small semantic adaptations must still be documented here with the pinned source SHA.
6. Upstream tests are reference contracts, not substitutes for a PQG integration test: adapt the smallest behavior test that would catch a regression in this composition.

## Vendored-base provenance for M08

To minimize reimplementation risk, the PR keeps the already-reviewed PQG workspace and MCP implementations byte-for-byte as internal base modules, then places the cancellation adapter around their command seam:

- `agents/_workspace-base.ts` is the exact pre-change `agents/_workspace.ts` blob from PQG `main` commit `75e872e3028529d90086ec4275b414770b7c195b` (`8658a2e83e6ee167913c0b4f0cb812b92f4be638`).
- `agents/_mcp-bridge-base.ts` is the exact pre-change `agents/_mcp-bridge.ts` blob from the same PQG `main` commit (`bc6879338a3ed510d77e98a953c0a39b9573be2d`).
- `agents/_workspace.ts` and `agents/_mcp-bridge.ts` are thin adapters; the new platform behavior lives in `agents/_sandbox-abort.ts` and `agents/stop.ts`.

This is internal vendoring of the project's own reviewed baseline, not a fork of a new shell/runtime implementation.

## M08 decision record — 2026-09-05

The process-local active-sandbox registry introduced by PR #57 is not a valid cross-request ownership mechanism in a multi-instance Makers runtime. The direct request-owned path uses the request's own `context.request.signal`, while the long-lived DSH/MCP composition uses a conversation-scoped persistent Stop fence in official `context.store.state`.

The MCP bridge captures its Stop-epoch baseline when that bridge becomes live. Every later sandbox command compares the current epoch with that fixed bridge fence before dispatch, polls it while the command is running, and rechecks it before command success can advance to workspace checkpoint persistence. Stop publishes a unique epoch only after verifying that the request's injected conversation scope exactly matches the requested target. The command adapter terminates the exact sandbox handle captured alongside `commands.run`; stale poll reads lose authority when the wrapper completes; shared-state outages fail closed with a stable `WORKSPACE_CANCELLATION_UNAVAILABLE` diagnostic.

This shared-state fence is intentionally authoritative for the long-lived MCP path because upstream DeepSeek `session.prompt` only admits/acknowledges a prompt and does not provide a run-owning signal for the later MCP tool lifetime. No process-local Map/Set is used as cross-request coordination state.
