# Upstream Sources

This manifest records external source material deliberately reused by PQG-Harness. Pinning the exact upstream commit avoids silently importing later behavior changes.

| Upstream | Pinned commit | Reused files / semantics | Use in PQG-Harness | License |
| --- | --- | --- | --- | --- |
| `TencentEdgeOne/edgeone-makers-tools` | `f106ce7b9c5893cc3d4afafaec1eb67ed3f5b3c2` | `.../platform/conversation-id.md`, `.../platform/node-entry.md`, `.../capabilities/sandbox.md`, `.../capabilities/store.md`, review checklist | Makers runtime contract: `/stop` dual-channel routing, `context.request.signal`, injected sandbox/store APIs, no process-local state as durable/shared coordination | Repository documentation/source; upstream project terms apply |
| `TencentEdgeOne/deepseek-harness` | `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` | `agents/stop.ts`, `_dsh-web-sidecar.ts`, `_mcp-bridge.ts`, `_workspace.ts` | Baseline DSH Web-on-Makers architecture; Stop delegates to sidecar close + platform `abortActiveRun` | MIT |
| `TencentEdgeOne/node-agent-starter` | `d8f77aec75b9d887be5dc8aae049a32d87efceec` | `agents/chat/stop.ts`, `agents/chat/index.ts` | Runner-owned cancellation pattern: `/stop` calls `abortActiveRun`; active request consumes `context.request.signal` | Upstream repository terms apply |
| `deepseek-ai/deepseek-harness` | `d347e703908d0406b7a7ef80e3a0e594d86b2215` | `packages/shell/tool-bash/src/index.ts`, `packages/shell/bash-local/src/index.ts`, cancellation tests/docs | Cancellation semantics: pre-aborted calls do not dispatch; in-flight foreground execution receives an abort signal; process termination is owned by the running executor; abort errors are classified rather than treated as normal completion | MIT |

## Reuse policy

1. Search official EdgeOne/DeepSeek upstreams before implementing a platform primitive locally.
2. Prefer importing an existing dependency/API already present in the project; otherwise port only the smallest compatible semantic adapter.
3. Do not copy an upstream local-shell executor into Makers business code; Makers runtime code must continue to use injected `context.sandbox` / `context.tools`.
4. Preserve existing PQG security, persistence, auth, release, and branch-protection controls unless a reviewed change explicitly replaces them.
5. For substantial copied source, retain the upstream copyright/license notice required by its license. Small semantic adaptations must still be documented here with the pinned source SHA.
6. Upstream tests are reference contracts, not substitutes for a PQG integration test: adapt the smallest behavior test that would catch a regression in this composition.

## M08 decision record — 2026-09-05

The process-local active-sandbox registry introduced by PR #57 is not a valid cross-request ownership mechanism in a multi-instance Makers runtime. The approved replacement is runner-owned cancellation: `/stop` asks the platform runtime to abort the target conversation, and the active runner reacts to its own `context.request.signal` by killing its own injected sandbox while a command is in flight. A shared-store polling fallback is reserved only if live evidence shows that the platform abort signal does not reach the DSH/MCP runner composition.
