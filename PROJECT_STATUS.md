# PQG-Harness project status

## Source
- Canonical branch: `main`
- Audited baseline: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Foundation integration branch: `integration/foundation-core`
- Reviewed Foundation source state before the docs-only checkpoint merge: commit `f24f69f2368c0c36241f646e39b5ca06114a44a8`, tree `43125c8dc47dfa1519c226ad0818397f47be42e7`
- Verified docs-only Foundation checkpoint merge: `b3f9fec1e127ae3a410e445840c456f77935a37e`, tree `99cc554cc334b9c4058120b5af3f11b6a6a390cf`
- The moving `integration/foundation-core` branch head must be read from GitHub; this file intentionally records immutable reviewed checkpoints rather than calling an embedded SHA "current".
- Post-WP7 source checkpoint merge: `0a6b68320e6a53378c0046d2a8aebdac2f345c21`
- Upstream provenance: see `UPSTREAM.md`

## Known deployment
- Known URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- EdgeOne Git connection: **RECONNECTED — OWNER-REPORTED on 2026-09-04**. Direct EdgeOne Console state is not independently available to this session; see `docs/verification/2026-09-04-edgeone-reconnect-status.md`.
- Production branch mapping after reconnect: **NOT VERIFIED**; do not infer that `main` is or is not the active Production source until Console/deployment identity is checked.
- Preview branch behavior after reconnect: **NOT VERIFIED**; a controlled Preview URL/identity is still required before live gates can close.
- Access/auth policy: **NOT VERIFIED — Foundation Freeze blocker**; confirm in EdgeOne Console and logged-out/direct API behavior before public/stable use.
- Deployed commit parity: NOT VERIFIED; reconnect alone does not prove that the known deployment runs the Foundation integration source.
- Required `AI_GATEWAY_*` environment variable presence/scope: NOT VERIFIED in EdgeOne Console; values must never be copied into repository evidence.
- Fresh probe from the current execution environment after reconnect on 2026-09-04 still could not resolve the known deployment hostname; `/` and `/build-meta.json` remain **BLOCKED by execution environment**, not recorded as application FAIL. See `docs/verification/2026-09-04-edgeone-reconnect-status.md`.

## GitHub deployment guardrail
- `main` commit remains `70119cfdae992a203a5e29eb24e91c7200222a7c`.
- Direct branch metadata re-verified after the EdgeOne reconnect report on 2026-09-04: `protected: false`.
- Required-status-check enforcement: `off`; contexts/checks empty.
- Repository rulesets endpoint returned an empty list.
- The current connector exposes branch-protection/ruleset reads but no administration write action, so this setting cannot be applied from the current session.
- Because Git integration is now owner-reported reconnected **before this guardrail was configured**, do not merge Foundation changes to `main` or use a main push as a promotion mechanism until the deployment branch mapping is verified and `quality` is required. See `docs/verification/2026-09-04-main-guardrail.md` and `docs/verification/2026-09-04-edgeone-reconnect-status.md`.

## Foundation Core status
- WP0 quality/governance: source-side GREEN; repository-level required-check enforcement remains a release blocker as above.
- WP1 security/permissions: source-side GREEN.
- WP2 workspace durability: source-side GREEN; controlled Preview recycle/recovery remains **BLOCKED**.
- WP3 sidecar lifecycle/Stop: source-side GREEN; controlled Preview command-cancellation proof remains **BLOCKED**.
- WP4 dependency/supply-chain hardening: source-side GREEN through reviewed DSH `0.1.0-rc.6` pins, `ws@8.21.3`, and package-lock SRI verification before exceptional native extraction.
- WP4 public Gateway/Host exposure: source-side GREEN. Gateway response headers are allowlisted and public proxy errors are code-only.
- Foundation dependency follow-up: `fast-uri` is held at or above `3.1.7`, `qs` at or above `6.16.0`, and the redundant root OpenTelemetry direct wave has been removed without upgrading DSH rc.6. The guarded semantic reconcile added no lock package nodes, removed only the reviewed old telemetry/helper set, and reported **563 packages audited / 0 known vulnerabilities**. Final docs-aligned cleanup candidate `ce0c92bc80f7759442ed90a0ea264906b20b54e0`, quality run `33895275632` — SUCCESS; merged into integration as `f24f69f2368c0c36241f646e39b5ca06114a44a8`. See `docs/verification/2026-09-04-dependency-security-refresh.md` and `docs/verification/2026-09-04-foundation-otel-root-cleanup.md`.
- Dependency audit status is point-in-time evidence only. DSH rc.6 retains its required nested newer telemetry graph; future advisories or DSH/telemetry migration still require review.
- `x-prompt-log` / `x-gateway-quota-bypass`: NOT VERIFIED from authoritative public EdgeOne documentation; preserved only as inherited compatibility behavior. See `docs/verification/2026-09-04-wp4-gateway-header-status.md`.
- WP5 build identity: source-side GREEN. `build:prepared` emits `dist/build-meta.json` from exact git commit/tree and package version; recorded WP5 quality evidence is GREEN.
- WP5 controlled Preview smoke, deployed `/build-meta.json` parity, topology, access/auth, native observability and rollback: **BLOCKED / NOT VERIFIED**. EdgeOne reconnect makes these checks operationally relevant again but does not satisfy them by itself. See `docs/verification/2026-09-04-foundation-preview-smoke.md`.
- WP6 product/locale/accessibility: source-side GREEN. Final WP6 evidence head `2f1573d6f43588805671f3667454524e7ba92fad`, quality run `33889812234` — SUCCESS.
- WP6 full Vietnamese: DEFERRED because pinned DSH `0.1.0-rc.6` exposes namespace dictionary registration but no clean external locale-descriptor registration path. `vi-VN` falls back to complete shipped English. See `docs/localization/vi-status.md`.
- WP6 controlled phone/tablet/desktop and real-browser accessibility smoke: **BLOCKED**. See `docs/verification/2026-09-04-wp6-preview-ui.md`.
- WP7 operational/release-readiness docs: source-side GREEN. Final WP7 candidate `1a410d1742b86ba0981b55036c4598bbbf4bd10b`, quality run `33891360316` — SUCCESS. It was merged into `integration/foundation-core` as `e8a952d159bef610592f43d28ea3cbee6860c701`; merge tree `727854ecc42cb82e227dd85442159d562af7dd67` exactly equals the final WP7 candidate tree.

## Release evidence documents
- Security boundary: `SECURITY.md`
- Runtime/data architecture: `ARCHITECTURE.md`
- Operations/recovery/rollback: `RUNBOOK.md`
- Release decision matrix: `docs/release/RELEASE_CHECKLIST.md`
- Known limitations: `docs/release/KNOWN_LIMITATIONS.md`
- Change history: `CHANGELOG.md`
- Foundation source checkpoint: `docs/verification/2026-09-04-foundation-source-checkpoint.md`
- EdgeOne reconnect status: `docs/verification/2026-09-04-edgeone-reconnect-status.md`
- Transitive dependency security refresh: `docs/verification/2026-09-04-dependency-security-refresh.md`
- Root OpenTelemetry cleanup: `docs/verification/2026-09-04-foundation-otel-root-cleanup.md`

## Deployment safety rule
EdgeOne Git integration is owner-reported reconnected. Until Production/Preview mapping and deployed identity are verified, **do not merge Foundation changes to `main` or intentionally promote Production**. Configure required `quality` enforcement on the actual deployment branch before using Git push/merge as a release mechanism. A controlled non-Production Preview may be used to close the remaining live gates once its exact URL and build identity are available.

## Release status
**Foundation Freeze is BLOCKED / not complete.** WP0–WP7 and the reviewed dependency cleanup are source-side GREEN, but the mandatory live EdgeOne and repository-enforcement gates in `docs/release/RELEASE_CHECKLIST.md` remain unresolved. Stable/public Production release is not approved.
