# PQG-Harness project status

## Source
- Canonical branch: `main`
- Audited baseline: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Foundation integration branch: `integration/foundation-core`
- Post-WP7 source checkpoint merge: `0a6b68320e6a53378c0046d2a8aebdac2f345c21`
- Post-WP7 source checkpoint tree: `b98bbc2d01d36f48d308848a30043060df0cbe42`
- Upstream provenance: see `UPSTREAM.md`

## Known deployment
- Known URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- Git-connected EdgeOne deployment: **DISCONNECTED** by the project owner on 2026-09-04; repository changes no longer auto-deploy while disconnected.
- Production branch mapping: NOT APPLICABLE while Git integration is disconnected; must be re-verified before any future reconnect.
- Preview branch behavior: NOT APPLICABLE while Git integration is disconnected; must be re-verified before any future reconnect.
- Access/auth policy: **NOT VERIFIED — Foundation Freeze blocker**; confirm in EdgeOne Console and logged-out/direct API behavior before public/stable use.
- Deployed commit parity: NOT VERIFIED; the existing deployment may remain on an earlier source revision until a controlled redeploy is performed.
- Required `AI_GATEWAY_*` environment variable presence/scope: NOT VERIFIED in EdgeOne Console; values must never be copied into repository evidence.
- Fresh probe from the current execution environment on 2026-09-04 could not resolve the known deployment hostname; `/` and `/build-meta.json` remain **BLOCKED by execution environment**, not recorded as application FAIL. See `docs/verification/2026-09-04-foundation-source-checkpoint.md`.

## GitHub deployment guardrail
- `main` commit remains `70119cfdae992a203a5e29eb24e91c7200222a7c`.
- Direct branch metadata re-verified after WP7 merge on 2026-09-04: `protected: false`.
- Required-status-check enforcement: `off`; contexts/checks empty.
- Repository rulesets endpoint returned an empty list.
- The current connector exposes read-only branch-protection/ruleset access, so this setting cannot be applied from the current session.
- Required action before reconnecting Git Auto Deploy: protect the deployment branch and require the `quality` check. See `docs/verification/2026-09-04-main-guardrail.md`.

## Foundation Core status
- WP0 quality/governance: source-side GREEN; repository-level required-check enforcement remains a release blocker as above.
- WP1 security/permissions: source-side GREEN.
- WP2 workspace durability: source-side GREEN; controlled Preview recycle/recovery remains **BLOCKED**.
- WP3 sidecar lifecycle/Stop: source-side GREEN; controlled Preview command-cancellation proof remains **BLOCKED**.
- WP4 dependency/supply-chain hardening: source-side GREEN through reviewed DSH `0.1.0-rc.6` pins, `ws@8.21.3`, and package-lock SRI verification before exceptional native extraction.
- WP4 public Gateway/Host exposure: source-side GREEN. Gateway response headers are allowlisted and public proxy errors are code-only.
- Foundation dependency follow-up: compatible transitive parser findings have been remediated to `fast-uri 3.1.7` and `qs 6.16.0`, with permanent lockfile regression floors. Implementation quality run `33893082135` — SUCCESS, 89 tests passed and build succeeded. A post-refresh audit run `33893305111` reports **12 residual findings (10 moderate, 2 high), all in the inherited OpenTelemetry direct dependency wave**. See `docs/verification/2026-09-04-dependency-security-refresh.md`.
- OpenTelemetry residual audit wave: DEFERRED to a coordinated compatibility review; npm proposes semver-major fixes only. No forced/piecemeal OTel migration is included in Foundation Core.
- `x-prompt-log` / `x-gateway-quota-bypass`: NOT VERIFIED from authoritative public EdgeOne documentation; preserved only as inherited compatibility behavior. See `docs/verification/2026-09-04-wp4-gateway-header-status.md`.
- WP5 build identity: source-side GREEN. `build:prepared` emits `dist/build-meta.json` from exact git commit/tree and package version; recorded WP5 quality evidence is GREEN.
- WP5 controlled Preview smoke, deployed `/build-meta.json` parity, topology, access/auth, native observability and rollback: **BLOCKED / NOT VERIFIED**. See `docs/verification/2026-09-04-foundation-preview-smoke.md`.
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
- Post-merge source checkpoint: `docs/verification/2026-09-04-foundation-source-checkpoint.md`
- Dependency security refresh: `docs/verification/2026-09-04-dependency-security-refresh.md`

## Deployment safety rule
Do not reconnect Git Auto Deploy until Foundation Core changes have passed the quality gate and a controlled deployment/reconnect plan has been reviewed. Reconnection must re-verify Production/Preview branch mapping, environment scope, access policy, required `quality` enforcement on `main`, rollback mechanism, and deployed commit parity before enabling automatic promotion.

## Release status
**Foundation Freeze is BLOCKED / not complete.** WP0–WP7 and the narrow compatible dependency refresh are source-side GREEN, but the mandatory live EdgeOne and repository-enforcement gates in `docs/release/RELEASE_CHECKLIST.md` remain unresolved. Stable/public Production release is not approved.
