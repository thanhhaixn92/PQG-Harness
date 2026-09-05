# Foundation Core Release Checklist

Review baseline: 2026-09-05

This checklist separates source verification from live EdgeOne evidence. A CI PASS does not replace a live durability, access, or deployment check.

## Current verified state

- `main`: `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`.
- Production `/build-meta.json`: **OWNER-VERIFIED MATCH** for the commit/tree above and package version `0.1.0`.
- Realtime approval delivery: **PASS**; `Allow` appears without browser refresh after the SSE heartbeat fix.
- Stop/cancellation live proof: **PASS**; the delayed mutation remained absent after Stop and a wait exceeding 60 seconds.
- GitHub ruleset `Protect main`: **ACTIVE**; pull request required, strict `quality` required, review threads resolved, deletion/non-fast-forward blocked, no bypass actors.
- Business plugins are not part of Foundation and are not yet implemented.

## Phase 1B P1 closure matrix

| Finding | Status | Current evidence / remaining action |
|---|---|---|
| **M01** | **BLOCKED** | Source persistence/restore tests are GREEN. Still requires isolated same-conversation persist → sandbox recycle → restore exact-state proof. |
| **M02** | **CLOSED** | Invalid, missing, or throwing permission resolution fails closed to read-only behavior. |
| **M03** | **BLOCKED** | Single-user middleware is source-side GREEN; live access/auth environment behavior and secret scope have not been independently verified in this session. |
| **M04** | **CLOSED** | Reviewed automatic sensitive-path, bounded diagnostics, and public-error/header boundaries are GREEN. |
| **M05** | **CLOSED** | Preview credentials are not serialized into model-visible tool results. |
| **M06** | **CLOSED** | Sidecar lifecycle, bounded retry, leases, cleanup, and transport race regressions are GREEN; Production interaction is exercising the same lifecycle. |
| **M08** | **CLOSED** | Live Stop test confirmed a delayed workspace mutation does not continue after cancellation. |
| **M09** | **CLOSED** | `Protect main` actively requires pull requests and strict `quality`, blocks deletion/non-fast-forward, and has no bypass actors. |
| **M10** | **BLOCKED / PARTIAL** | Production command execution, realtime approval, Stop, refresh and current core paths have evidence; representative browser/device coverage, observability and rollback rehearsal remain. |
| **M13** | **BLOCKED / PARTIAL** | Production deployed commit/tree/package identity is verified. Production/Preview topology details and environment-variable scope remain Console-only/unverified here. |

## Source-side checks

- [x] WP0–WP7 source implementation and documentation gates are GREEN at their recorded checkpoints.
- [x] Permission fallback is fail-closed.
- [x] Automatic sensitive paths are rejected before file I/O.
- [x] Workspace checkpoints serialize per conversation.
- [x] Direct writes do not report durable success when persistence fails.
- [x] Commands checkpoint state even on non-zero exit.
- [x] Sidecar lifecycle has explicit state, bounded retry, idempotent cleanup and active leases.
- [x] Unary/SSE responses hold leases through completion/cancel/error.
- [x] Stop attempts sidecar shutdown and platform abort independently.
- [x] Direct DSH dependencies remain pinned to `0.1.0-rc.6` and `ws` to `8.21.3`.
- [x] `build:prepared` emits exact Git commit/tree/package version.
- [x] Personal v1 middleware is fail-closed and protects application routes source-side.
- [x] `main` is protected by strict required `quality` through the active repository ruleset.

## Remaining mandatory live gates

- [ ] **M01 durability:** same-conversation write/change → persist → force a fresh sandbox → restore exact expected state with no resurrected/deleted data.
- [ ] **Access/auth:** verify the intended Production/Preview environment has the required secret configuration without recording values; prove anonymous rejection and authenticated operation.
- [ ] **Environment scope:** verify required `AI_GATEWAY_*` and `PQG_ACCESS_SECRET` presence/scope in the intended EdgeOne environment.
- [ ] **Browser coverage:** representative phone/tablet/desktop and keyboard-only critical paths.
- [ ] **Observability:** inspect one browser → middleware → Host → sidecar → Gateway/MCP request path without leaking secret values.
- [ ] **Rollback rehearsal:** verify a candidate, roll back/redeploy the prior known-good build, then repeat minimal smoke.
- [ ] **Topology:** record Production/Preview branch mapping when directly available from EdgeOne Console.

## Plugin-ready MVP release rule

The plugin substrate must not weaken any Foundation gate. With zero business plugins installed, PQG must boot and preserve the existing Makers workspace, approval and Stop behavior. Enabling, disabling or uninstalling a future module must never be treated as permission to delete that module's business data.

## Promotion decision

`main` is now guarded by pull request + strict `quality`, so source changes may follow the normal protected-branch workflow. Foundation live validation is **not fully closed while M01 and the remaining environment/operational checks above are pending**. Do not claim those gates PASS without direct evidence.
