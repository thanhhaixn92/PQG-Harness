# Foundation Core Release Checklist

Review baseline: 2026-09-05

This checklist separates source acceptance, last verified Production identity, and live EdgeOne evidence. A CI PASS never replaces a live durability, access, deployment, browser, observability, or rollback check.

## Source baseline and deployment evidence

- PR #65 acceptance base `main`: `50212203b5f4afd17a664da0708de6fa83e618b0`, tree `29f59d1c97a26338a01ea7640484237a3aa7480c`, package version `0.1.0`.
- Last owner-verified Production `/build-meta.json`: commit `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`, package version `0.1.0`.
- The Production identity above is historical evidence and is **not** proof that Production matches the current repository source. Current deployment parity must be read from `/build-meta.json`.
- Realtime approval delivery: **PASS** at its recorded live checkpoint; `Allow` appeared without browser refresh after the SSE heartbeat fix.
- Stop/cancellation live proof: **PASS** at its recorded checkpoint; the delayed mutation remained absent after Stop and a wait exceeding 60 seconds.
- GitHub ruleset `Protect main`: **ACTIVE**; pull request required, strict `quality` required, review threads resolved, deletion/non-fast-forward blocked, no bypass actors.
- PR1–PR3 plugin substrate is merged; no business plugin is installed by Foundation.

## Phase 1B P1 closure matrix

| Finding | Status | Current evidence / remaining action |
|---|---|---|
| **M01** | **BLOCKED** | Source persistence/restore tests are GREEN. Still requires isolated same-conversation persist → sandbox recycle → restore exact-state proof. |
| **M02** | **CLOSED** | Invalid, missing, or throwing permission resolution fails closed to read-only behavior. |
| **M03** | **BLOCKED** | Single-user middleware is source-side GREEN; this checklist does not promote the live access/environment row without direct evidence tied to the intended Production deployment. |
| **M04** | **CLOSED** | Reviewed automatic sensitive-path, bounded diagnostics, and public-error/header boundaries are GREEN. |
| **M05** | **CLOSED** | Preview credentials are not serialized into model-visible tool results. |
| **M06** | **CLOSED** | Sidecar lifecycle, bounded retry, leases, cleanup, and transport race regressions are GREEN. |
| **M08** | **CLOSED** | Live Stop test confirmed a delayed workspace mutation does not continue after cancellation. |
| **M09** | **CLOSED** | `Protect main` actively requires pull requests and strict `quality`, blocks deletion/non-fast-forward, and has no bypass actors. |
| **M10** | **BLOCKED / PARTIAL** | Production command execution, realtime approval, Stop and core paths have recorded evidence; representative browser/device coverage, observability and rollback rehearsal remain. |
| **M13** | **BLOCKED / PARTIAL** | A prior Production commit/tree/package identity was verified, but parity with the current intended deployment plus Console-owned topology/environment scope require fresh evidence. |

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

## Plugin-ready MVP source acceptance

PR #65/P6 adds no production runtime abstraction. It records regression evidence over the substrate already delivered by PR1–PR3.

- [x] Zero installed PQG modules is a valid catalog state.
- [x] Malformed installed `pqg.module` metadata fails clearly.
- [x] Stale policy for an uninstalled module is ignored by the installed-only catalog.
- [x] Uninstall does not delete the persisted enable override; reinstall of the same module ID restores it.
- [x] Persisted policy seeds a new `ModuleMcpBridge` before future module-tool registration.
- [x] Enable/disable/remove continues to use the existing MCP server and native registered-tool lifecycle.
- [x] A failing module tool returns an MCP tool error while Makers core tools remain available.
- [x] Settings `Tiện ích` remains generated through the reviewed DSH Web client graph.
- [x] Required `quality` on the PR #65 merge candidate: generated drift PASS, typecheck PASS, **131/131 tests PASS**, production build PASS.
- [ ] Fresh Production identity parity and zero-business-plugin browser smoke on the intended build.

See `docs/verification/2026-09-05-plugin-ready-mvp.md` for source evidence. Exact transient PR head/run identifiers remain in PR #65 checks rather than committed status text.

## Remaining mandatory live gates

- [ ] **M01 durability:** same-conversation write/change → persist → force a fresh sandbox → restore exact expected state with no resurrected/deleted data.
- [ ] **Current deployment identity:** read `/build-meta.json` and verify the exact intended commit/tree/package version before attributing source evidence to Production.
- [ ] **Access/auth:** verify the intended Production/Preview environment has the required secret configuration without recording values; prove anonymous rejection and authenticated operation when that gate is being promoted.
- [ ] **Environment scope:** verify required `AI_GATEWAY_*` and `PQG_ACCESS_SECRET` presence/scope in the intended EdgeOne environment.
- [ ] **Zero-plugin smoke:** with no business module installed, verify boot, Settings `Tiện ích` zero-state, workspace operation, approval delivery and Stop on the current deployment.
- [ ] **Browser coverage:** representative phone/tablet/desktop and keyboard-only critical paths.
- [ ] **Observability:** inspect one browser → middleware → Host → sidecar → Gateway/MCP request path without leaking secret values.
- [ ] **Rollback rehearsal:** verify a candidate, roll back/redeploy the prior known-good build, then repeat minimal smoke.
- [ ] **Topology:** record Production/Preview branch mapping when directly available from EdgeOne Console.

## Plugin-ready MVP release rule

The plugin substrate must not weaken any Foundation gate. With zero business plugins installed, PQG must boot and preserve the existing Makers workspace, approval and Stop behavior. Enabling, disabling or uninstalling a future module is never permission to delete that module's business data.

Generic `pqg.module` `./client` runtime activation/unload is not part of the current rc.6 substrate acceptance. A minimal reference/conformance module should prove that seam before the project calls itself plugin-proven.

## Promotion decision

`main` is guarded by pull request + strict `quality`, so source changes may follow the normal protected-branch workflow. Plugin-ready source acceptance is GREEN, but Foundation live validation is **not fully closed while M01 and the remaining deployment/environment/operational checks above are pending**. Do not claim a live gate PASS without direct evidence tied to the tested deployment.
