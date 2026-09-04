# PQG-Harness Foundation Core for Personal v1 — Design

## Status

Approved by project owner on 2026-09-04.

This design supersedes the assumption that every task in the original WP0–WP7 plans must be completed before product work. It preserves the original WP ordering and risk intent, but defines a narrower **Foundation Core** suitable for one primary personal user.

## Goal

Complete the core of WP0 through WP7 before business modules are built, closing or conclusively verifying all Phase 1B P1 findings and addressing only the P2 items that directly affect durability, privacy, runtime reliability, build reproducibility, product identity, accessibility, and operations.

After the Foundation Core gate passes, freeze the foundation and begin modules in this order:

```text
Task -> Writing -> Support Agent v1 -> Planning -> Document -> Data
```

## Current baseline

Repository: `thanhhaixn92/PQG-Harness`

Current implementation stack at approval:

- `main`: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- WP0 head: `342a10758a7dce1c3bfb83cd5796766f7eb1e263`
- WP1 head: `89f21bba9cb5c4447b6e4ef5aa6abc268f8dba76`
- WP2 current head: `7ae3fc4e4b57ad1605ece920f4fc959598601194`
- WP2 Task 1, serialized workspace checkpoints, is already GREEN.
- EdgeOne Git Auto Deploy is disconnected during implementation.

## Architecture kept unchanged

Foundation Core does not replace the existing architecture:

```text
Browser / DSH Web
  -> EdgeOne Agent routes
  -> per-conversation DSH Web sidecar
      -> local AI Gateway proxy -> Makers AI Gateway
      -> local MCP bridge -> EdgeOne Sandbox / Store
```

The following remain deliberate constraints:

- EdgeOne remains the hosting/deployment owner.
- DSH remains pinned to the reviewed `0.1.0-rc.6` wave.
- DSH Host, local Gateway, and MCP remain loopback-bound.
- Generated `public/` and root `index.html` are produced by source scripts, not hand-edited.
- Full Access remains explicit high privilege and is never the default.
- No external database, third-party observability platform, plugin marketplace, or multi-user RBAC is introduced for Personal v1.

## Foundation Core scope by WP

### WP0 — Governance & Quality

Already technically GREEN. Foundation Core adds only the final repository safety rail before deployment is reconnected:

- `quality` remains the single non-deploying CI gate.
- `main` must require PR-based changes and the `quality` status before Git Auto Deploy is reconnected.
- No second deployment pipeline, release bot, Sonar, or enterprise governance layer.

**Cutoff:** quality is proven green and `main` cannot be accidentally promoted without the required check.

### WP1 — Security & Permissions

Freeze the current WP1 implementation as complete:

- permission-resolution failure falls back to `read-only`;
- sensitive automatic workspace file operations reject common secret/key paths;
- MCP diagnostics retain bounded metadata rather than raw bodies;
- preview data-plane credentials stay out of model-visible tool output;
- credentialed browser preview is isolated behind the same-origin redirect route.

Canonical/symlink enforcement and shell-level secret filtering are not expanded in WP1. If the platform APIs do not provide a reliable canonical-path primitive, the limitation is documented rather than approximated unsafely.

**Cutoff:** current WP1 GREEN evidence remains valid; no new WP1 runtime scope.

### WP2 — Workspace Durability & Recovery

WP2 is the least compressible WP and is completed almost fully.

Required invariants:

1. `projects/<conversation>/workspace` is the authoritative project filesystem.
2. Native `context.sandbox.restore({ path })` initializes a recreated sandbox.
3. Legacy `workspaceSnapshot` is migration-only and read only after native restore returns `not_found`.
4. Same-conversation persistence remains serialized.
5. Automatic file writes persist before durable success is reported.
6. Shell commands persist regardless of exit code because a failed command may already have mutated files.
7. Persistence failure is surfaced explicitly; the system never claims durable success when checkpointing failed.
8. Preview process state is derived from live health rather than stale metadata.
9. Workspace listings expose truncation instead of silently pretending completeness.
10. A controlled Preview recycle test proves create/modify/delete recovery for both direct file tools and shell-created files.

Deferred:

- complete symlink/canonical-path security model;
- persistence of dependencies, build caches, browser state, or preview processes.

**Cutoff:** exact expected workspace state survives sandbox recycle for a same-conversation recovery test.

### WP3 — Sidecar Lifecycle & Cancellation Core

Retain only lifecycle behavior that affects daily reliability:

- explicit per-conversation lifecycle state (`starting | ready | stopping`);
- a single sidecar startup per conversation;
- idempotent resource cleanup;
- active-use leases so unary requests and SSE streams cannot be reaped while in use;
- current Makers context is resolved for later Gateway/MCP requests rather than permanently capturing the creation context;
- SSE abort before readiness cannot open a socket later;
- Stop marks the conversation stopping before awaiting shutdown;
- sidecar close and `abortActiveRun()` execute failure-independently;
- replacement sidecars are blocked until Stop finishes;
- Preview verifies whether platform abort is sufficient to stop sandbox-side command effects.

Use bounded startup retry and complete cleanup for failed starts, but do not pursue a mathematically perfect replacement for the current free-port TOCTOU unless an actual failure remains after the bounded mitigation.

**Cutoff:** concurrent acquire, startup failure cleanup, idle-reap safety, SSE abort, stop-during-start, and stop-during-command behavior are proven.

### WP4 — Dependencies, Build & Gateway Core

Required:

- make every direct `@deepseek-ai/dsh*` manifest dependency exactly `0.1.0-rc.6` without upgrading the wave;
- target `ws@8.21.3` only, with no incidental dependency modernization;
- verify exceptional native tarball restoration against lockfile integrity before extraction;
- redact public Gateway/Host proxy exceptions to stable codes;
- forward only the minimal reviewed Gateway response headers;
- verify the semantics of `x-prompt-log` and `x-gateway-quota-bypass` from authoritative EdgeOne evidence before changing defaults;
- exact Node pin is optional and only lands after Preview proves the version is supported.

Deferred:

- DSH upgrade;
- Vite/TypeScript/OTel/MCP/Zod refresh;
- BYOK provider expansion and broad model-catalog redesign.

**Cutoff:** reviewed dependency wave is frozen, targeted security patch is applied, exceptional native restoration is integrity-checked, public Gateway errors are minimized, and build quality is green.

### WP5 — Deployment Identity, Access, Smoke & Observability Core

Required:

- emit `dist/build-meta.json` with exact commit/tree/package version;
- verify actual EdgeOne Production/Preview branch mapping and Auto Deploy state;
- verify environment-variable presence/scope without reading secret values;
- verify the real outer access/auth policy;
- if no sufficient platform access control exists, add a single-user application gate rather than a multi-user identity system;
- prove Preview commit parity through `/build-meta.json`;
- run an A12-equivalent non-destructive Preview smoke covering shell render, session, one minimal model call, SSE, workspace read/write, permission prompt, Stop, refresh/reopen, and build identity;
- inspect EdgeOne-native logs/traces first and add no third-party telemetry;
- rehearse one Preview rollback/redeploy path.

Production receives only the safe smoke subset after an approved release.

**Cutoff:** the project can answer what is deployed, which SHA is live, who can access it, whether core flows work, and how to identify/rollback a bad deployment.

### WP6 — PQG Product Layer, Locale & Accessibility Core

Required:

- create one product-owned configuration source for name/repository/upstream attribution;
- apply `PQG Harness` title/manifest/repository identity through the preparation script;
- keep upstream attribution and MIT licensing;
- remove hostname-driven language selection;
- browser Chinese selects `zh`; all other unsupported languages, including Vietnamese, fall back to `en` until a complete stable Vietnamese registration path exists;
- inspect the pinned DSH locale APIs once and record whether a clean Vietnamese extension seam exists;
- if no stable seam exists, defer full Vietnamese instead of patching compiled strings;
- custom dialogs support Escape, focus return, and Tab/Shift+Tab focus containment;
- locked-state help is keyboard discoverable where feasible;
- run representative phone/tablet/desktop Preview smoke.

Deferred:

- full WCAG audit;
- full Vietnamese compiled-front-end fork;
- custom logo/font asset work.

**Cutoff:** PQG identity is isolated from generated upstream assets, Vietnamese users never default to Chinese, and PQG-owned interactive chrome is keyboard-usable.

### WP7 — Operations & Release Readiness Core

Required repository documentation:

- `SECURITY.md`
- `ARCHITECTURE.md`
- `RUNBOOK.md`
- `CHANGELOG.md`
- `docs/release/RELEASE_CHECKLIST.md`
- `docs/release/KNOWN_LIMITATIONS.md`
- updated `PROJECT_STATUS.md`

Documentation must distinguish `CONFIRMED`, `ACCEPTED RISK`, and `NOT VERIFIED`.

The release checklist maps all ten Phase 1B P1 findings to closure or explicit owner-accepted risk. For Personal v1, automated SBOM/license inventory and a formal vulnerability-response program are useful but are not Foundation Core blockers unless the product is being prepared for public distribution.

**Cutoff:** a maintainer can determine the architecture, persistence boundaries, security boundaries, deployment/rollback procedure, current release SHA, and known limitations without re-reading the original audit set.

## Phase 1B P1 closure mapping

| Finding | Foundation Core owner |
|---|---|
| M01 workspace durability | WP2 |
| M02 fail-open permission | WP1 — closed |
| M03 access/auth boundary | WP5 |
| M04 sensitive-data policy | WP1 — closed for automatic file tools |
| M05 preview credential exposure | WP1 — closed |
| M06 sidecar lifecycle races | WP3 |
| M08 stop/cancellation | WP3 |
| M09 main quality guardrail | WP0 |
| M10 critical runtime/live proof | WP2/WP3/WP5 |
| M13 deployment topology/SHA | WP5 |

No P1 may remain silently open when Foundation Freeze is declared. A release-gate P1 may be marked `ACCEPTED RISK` only with explicit owner approval and documented reason.

## Branch and integration strategy

Do not extend the current deeply stacked review chain indefinitely.

1. Finish WP2 on `impl/wp2-workspace-durability`.
2. Create/update `integration/foundation-core` from the final WP2 head.
3. For WP3–WP7, create one short-lived WP branch from the latest `integration/foundation-core` head.
4. Merge each GREEN WP branch back into `integration/foundation-core` after review and evidence capture.
5. Keep Production Git Auto Deploy disconnected throughout Foundation Core implementation.
6. Open one final Foundation Core integration PR to `main` after all gates pass.
7. Configure the required `quality` guardrail before reconnecting production deployment.

## Foundation Freeze gate

Business-module work may begin only when all rows are GREEN or explicitly accepted:

| Gate | Requirement |
|---|---|
| Quality | CI green; `main` safety rail ready before deploy reconnect |
| Security | WP1 controls remain green |
| Durability | exact recycle/restore test passes |
| Runtime | critical sidecar/Stop/SSE tests pass |
| Dependencies | DSH frozen, targeted `ws` patch applied, build green |
| Access | platform access verified or single-user gate implemented |
| Deployment | Preview/Production mapping and build SHA are identifiable |
| Smoke | full core Preview smoke passes |
| Product | PQG identity and language-default behavior pass |
| Operations | architecture/runbook/release checklist/limitations are current |

After this gate passes, record **Foundation Freeze** and stop broad hardening. New foundation work after that point requires a module-blocking defect, security issue, or failed operational verification.

## Module phase boundary

Foundation Core deliberately does **not** define the business module contract in detail. That design starts only after Foundation Freeze. The expected product sequence is:

```text
Task
  -> Writing
  -> Support Agent v1
  -> Planning
  -> Document
  -> Data
```

The first module plan must treat the Foundation Freeze SHA as its immutable base and must not mix foundation refactors with domain features.