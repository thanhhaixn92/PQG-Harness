# PQG-Harness project status

## Current checkpoint — 2026-09-05
- Canonical branch: `main` at `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`.
- Production `/build-meta.json`: **OWNER-VERIFIED MATCH** for the exact commit/tree above and package version `0.1.0`.
- Realtime approval delivery: **PASS** — the `Allow` prompt appears without refreshing the browser after the 5-second SSE heartbeat fix.
- M08 Stop/cancellation live proof: **PASS / CLOSED** — after Stop and a wait exceeding 60 seconds, the delayed mutation artifact remained absent.
- GitHub default-branch guardrail: **ACTIVE** ruleset `Protect main`; pull request required, strict `quality` status required, review threads must be resolved, deletion/non-fast-forward blocked, no bypass actors.
- M01 isolated durability/recycle proof remains the main Foundation live data-integrity gate still to close before treating Foundation validation as fully complete.
- Business plugins (Task, Writing, Planning, Document, Data, Memory, Workflow, Skills) are **not implemented**. Current product work is limited to the plugin-ready substrate.

## Source history
- Audited baseline: `70119cfdae992a203a5e29eb24e91c7200222a7c`.
- Foundation integration branch: `integration/foundation-core`.
- Reviewed Foundation source state before the docs-only checkpoint merge: commit `f24f69f2368c0c36241f646e39b5ca06114a44a8`, tree `43125c8dc47dfa1519c226ad0818397f47be42e7`.
- Verified docs-only Foundation checkpoint merge: `b3f9fec1e127ae3a410e445840c456f77935a37e`, tree `99cc554cc334b9c4058120b5af3f11b6a6a390cf`.
- Post-WP7 source checkpoint merge: `0a6b68320e6a53378c0046d2a8aebdac2f345c21`.
- Upstream provenance: see `UPSTREAM.md`.

## Known deployment
- Canonical non-secret origin supplied by the owner: `https://pqg-harness.edgeone.cool/`.
- EdgeOne Git connection: **RECONNECTED — OWNER-REPORTED on 2026-09-04**.
- Production deployed identity is now owner-verified through `/build-meta.json` as the exact `main` checkpoint recorded above.
- Production/Preview branch mapping and Preview behavior are still not independently available from the current execution environment; do not infer topology beyond the verified deployed identity.
- Required `AI_GATEWAY_*` and `PQG_ACCESS_SECRET` environment-variable presence/scope remain Console-only information; values must never be copied into repository evidence.

## GitHub deployment guardrail
- Repository ruleset `Protect main` is active for the default branch.
- Required status check: strict `quality`.
- Pull requests are required and review threads must be resolved.
- Branch deletion and non-fast-forward updates are blocked.
- No bypass actors are configured; current user bypass is `never`.
- This closes the previous M09 repository-enforcement blocker. Release decisions still depend on the remaining live product/data gates rather than branch protection alone.

## Foundation Core status
- WP0 quality/governance: source-side GREEN; required `quality` enforcement on `main` is now active.
- WP1 security/permissions: source-side GREEN.
- WP2 workspace durability: source-side GREEN; controlled isolated recycle/recovery proof remains **BLOCKED / pending M01**.
- WP3 sidecar lifecycle/Stop: source-side GREEN; live Stop/cancellation proof is now **PASS / CLOSED**.
- Approval realtime delivery: live Production **PASS** after the SSE heartbeat fix; `Allow` appears without browser refresh.
- WP4 dependency/supply-chain hardening: source-side GREEN through reviewed DSH `0.1.0-rc.6` pins, `ws@8.21.3`, and package-lock SRI verification before exceptional native extraction.
- WP4 public Gateway/Host exposure: source-side GREEN. Gateway response headers are allowlisted and public proxy errors are code-only.
- Foundation dependency follow-up: `fast-uri` is held at or above `3.1.7`, `qs` at or above `6.16.0`, and the redundant root OpenTelemetry direct wave has been removed without upgrading DSH rc.6. Recorded point-in-time audit evidence: **563 packages audited / 0 known vulnerabilities**.
- Dependency audit status is point-in-time evidence only. DSH rc.6 retains its required nested newer telemetry graph; future advisories or DSH/telemetry migration still require review.
- `x-prompt-log` / `x-gateway-quota-bypass`: NOT VERIFIED from authoritative public EdgeOne documentation; preserved only as inherited compatibility behavior.
- WP5 build identity: source-side GREEN and Production identity is now owner-verified against exact `build-meta.json` commit/tree/package version.
- WP5 access contingency: source-side GREEN for the minimal Personal v1 single-user middleware; direct Console environment scope remains outside this session.
- WP6 product/locale/accessibility: source-side GREEN. Full Vietnamese remains deferred on the pinned DSH rc.6 locale architecture; PQG-owned future surfaces should be Vietnamese-first.
- WP7 operational/release-readiness docs: source-side GREEN; this status document now records the later live results instead of treating the 2026-09-04 checkpoint as current.

## Plugin-ready MVP status
- Product direction: Agent-first plus module dashboards; users may operate modules directly while the PQG Assistant may use enabled module capabilities on their behalf.
- Module isolation rule: a business plugin must be installable/removable without becoming a required dependency of PQG Core.
- Installed-module source of truth: direct root dependency + valid `pqg.module` declaration.
- Runtime lifecycle authority: reuse Cordis/DSH and MCP SDK mechanisms; do not introduce a second plugin framework.
- Data rule: disabling or uninstalling a module must not implicitly delete module data.
- Current implementation phase: substrate only; no business module is shipped yet.

## Release evidence documents
- Security boundary: `SECURITY.md`
- Runtime/data architecture: `ARCHITECTURE.md`
- Operations/recovery/rollback: `RUNBOOK.md`
- Release decision matrix: `docs/release/RELEASE_CHECKLIST.md`
- Known limitations: `docs/release/KNOWN_LIMITATIONS.md`
- Change history: `CHANGELOG.md`

## Deployment safety rule
Changes continue through pull requests with strict `quality` required on `main`. A GREEN source change is not proof of a business-data migration or live durability behavior; M01 must be verified separately before Foundation durability is considered fully closed.

## Release status
Foundation source, Production identity, realtime approval, M08 cancellation and the `main` repository guardrail are verified at the current checkpoint. **M01 isolated durability/recycle remains pending**, so Foundation live validation is not yet fully closed. Business-module implementation has not started.
