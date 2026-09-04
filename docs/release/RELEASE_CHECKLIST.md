# Foundation Core Release Checklist

Review baseline: 2026-09-04

This checklist separates **source-side closure** from **live EdgeOne release evidence**. A CI/unit-test PASS cannot replace a controlled Preview/Console check. Production Git Auto Deploy is recorded as **DISCONNECTED** and must remain disconnected until the applicable release rows are closed or explicitly owner-accepted.

## Release state

- WP0–WP7 source-side implementation/documentation: **GREEN** at recorded evidence heads.
- Post-WP7 Foundation source checkpoint was merged only into `integration/foundation-core`; quality run `33892152391` — SUCCESS on the checkpoint candidate.
- A narrow dependency-security refresh has removed the compatible `fast-uri` / `qs` findings and is verified separately in `docs/verification/2026-09-04-dependency-security-refresh.md`.
- Foundation Freeze: **BLOCKED / not complete** because required live Preview, access/auth, deployed-identity, deployment-topology, and `main` enforcement evidence are unresolved.
- Stable/public Production release: **NOT APPROVED**.

## Phase 1B P1 closure matrix

| Finding | Risk | Release status | Evidence / remaining action |
|---|---|---|---|
| **M01** | Workspace durability/recovery could lose, resurrect, or roll back state | **BLOCKED (source CLOSED; live proof pending)** | WP2 native restore/persist state machine, serialized checkpoints, persist-after-mutation and durability-error tests are GREEN. Controlled sandbox recycle/recovery on the same conversation is still BLOCKED and must reproduce the exact expected state. |
| **M02** | Permission resolution failure could fall open to workspace-write | **CLOSED** | WP1 fails invalid/missing/throwing permission resolution closed to read-only behavior; dedicated permission tests remain in the quality suite. |
| **M03** | No independently verified Agent auth/ownership boundary | **BLOCKED** | EdgeOne access/auth policy is **NOT VERIFIED**. Test root and direct Agent/API behavior logged-out/incognito in a controlled deployment. If outer access is insufficient, review a minimal single-user auth gate before stable/public use. |
| **M04** | Sensitive workspace/tool data could cross model/store/log boundaries | **CLOSED for reviewed automatic boundaries** | WP1 sensitive-path lexical shielding, bounded MCP diagnostics, and WP4 public error/header minimization are source-side GREEN. Symlink/canonical-path and full-access shell limitations remain documented separately. |
| **M05** | Preview credential exposed in model-visible query-string URL | **CLOSED** | WP1 returns browser-only same-origin preview access; model-visible tool results do not serialize the sandbox credential. |
| **M06** | Sidecar lifecycle races/leaks | **CLOSED source-side** | WP3 explicit starting/ready/stopping state, shared startup, bounded retries, idempotent cleanup, active leases, current-context refresh, and streaming lease tests are GREEN. Live lifecycle behavior is covered indirectly by the Preview smoke gate. |
| **M08** | Stop/cancel could return while sandbox mutation continues | **BLOCKED (source CLOSED; live command proof pending)** | WP3 starts sidecar stop and platform abort independently and has SSE/Stop race tests. A controlled Preview must prove a running command does not continue a delayed workspace mutation silently after Stop. |
| **M09** | Production-linked main lacked a required quality gate | **BLOCKED before deploy reconnect** | WP0 provides the full quality workflow and all Foundation candidates use it, but GitHub re-verification on 2026-09-04 shows `main protected:false`, required-status-check enforcement `off`, and no repository rulesets. The current connector has no administration write action. Protect `main`/deployment branch and require `quality` before reconnecting Git Auto Deploy. See `docs/verification/2026-09-04-main-guardrail.md`. |
| **M10** | No real integration/E2E and Production smoke proof | **BLOCKED** | Source-side tests are substantially stronger, but controlled Preview smoke, browser paths, model/SSE/workspace/approval/Stop/export, native observability, and safe Production smoke remain live gates. |
| **M13** | Production topology/deployed SHA/access not independently verified | **BLOCKED** | WP5 emits exact `build-meta.json`, but current deployed commit parity, Production/Preview mapping, environment scope, access/auth and rollback mechanism are **NOT VERIFIED**. Verify in EdgeOne Console and controlled Preview before promotion. |

No P1 is silently omitted. A row may be changed from BLOCKED only when its required evidence is attached, or to **ACCEPTED RISK** only with an explicit owner reason and review date.

## Source-side Foundation checks

- [x] Post-WP7 source checkpoint has a GREEN full `quality` workflow: run `33892152391`.
- [x] WP1 permission fallback is fail-closed.
- [x] Automatic sensitive file paths are hidden/rejected before file I/O.
- [x] Preview credentials are absent from model-visible tool results.
- [x] MCP diagnostics retain bounded metadata rather than raw request bodies.
- [x] Native workspace checkpoints are serialized per conversation.
- [x] Direct writes do not report durable success when persist fails.
- [x] Commands checkpoint state even on non-zero exit.
- [x] Preview state checks the current sandbox process rather than metadata alone.
- [x] Workspace listing reports `truncated` and `limit`.
- [x] Sidecar lifecycle has explicit state, bounded retry, idempotent cleanup and active leases.
- [x] Unary/SSE response lifetime holds a lease through stream completion/cancel/error.
- [x] Stop attempts sidecar shutdown and platform abort independently.
- [x] Direct DSH dependencies are pinned to the reviewed `0.1.0-rc.6` wave.
- [x] `ws` is pinned to `8.21.3`.
- [x] `fast-uri` lock resolution is at least `3.1.7` and enforced by regression test.
- [x] `qs` lock resolution is at least `6.16.0` and enforced by regression test.
- [x] Exceptional native tarballs are SRI-verified before destructive extraction.
- [x] Gateway response headers use the reviewed allowlist and public proxy errors are code-only.
- [x] `build:prepared` emits exact Git commit/tree/package version in `dist/build-meta.json`.
- [x] PQG product identity and upstream attribution have one source of truth.
- [x] Browser language, not deployment hostname, selects the shipped initial locale.
- [x] PQG-owned contact dialog has generated keyboard/focus ownership contract tests.
- [x] Security, architecture, operations, changelog, known-limitations and release-checklist documents exist and are enforced by `tests/release-docs.test.ts`.

## Required live/repository gates

These rows are **BLOCKED** until the required environment or administration capability exists.

- [ ] **BLOCKED — Preview identity:** deploy the exact candidate and verify `/build-meta.json` commit/tree match it.
- [ ] **BLOCKED — access/auth:** verify logged-out/incognito root and direct Agent/API behavior.
- [ ] **BLOCKED — environment scope:** verify required `AI_GATEWAY_*` variables are present in the intended environment without recording values.
- [ ] **BLOCKED — durability:** perform same-conversation workspace write/command/delete → persist → sandbox recycle → restore exact-state test.
- [ ] **BLOCKED — cancellation:** prove Stop prevents a running test command from silently continuing workspace mutation.
- [ ] **BLOCKED — runtime smoke:** root, session, model selector, minimal model prompt, SSE progression, workspace read/write, approval prompt, Stop, export and refresh/reopen.
- [ ] **BLOCKED — browser UI:** phone/tablet/desktop representative viewport smoke and real keyboard-only dialog behavior.
- [ ] **BLOCKED — native observability:** inspect logs/metrics/traces for one representative browser → Host → sidecar → Gateway/MCP request.
- [ ] **BLOCKED — rollback rehearsal:** Preview B → verify B → rollback/redeploy A → verify A → minimal smoke.
- [ ] **BLOCKED — main guardrail:** `main` is confirmed unprotected with required checks off and no rulesets; configure required `quality` before any Git Auto Deploy reconnect.
- [ ] **BLOCKED — Production topology:** verify Production/Preview branch mapping and current deployed source identity.
- [ ] **BLOCKED — safe Production smoke:** only after explicit promotion approval, run the non-destructive Production subset.

## Dependency/release limitations to review

- [x] Compatible transitive parser findings reviewed and remediated: `fast-uri 3.1.7`, `qs 6.16.0`; post-refresh audit no longer lists either package.
- [ ] Before stable/public release, review the **12 residual OpenTelemetry findings (10 moderate, 2 high)** against the actual DSH/Makers telemetry activation path. `npm audit` proposes only semver-major fixes; do not apply a forced piecemeal migration. See `docs/verification/2026-09-04-dependency-security-refresh.md`.
- [ ] Re-evaluate `x-prompt-log` and `x-gateway-quota-bypass` when authoritative semantics become available.
- [ ] Re-evaluate symlink/canonical-path policy if the platform exposes a safe canonical-path primitive or project requirements include untrusted filesystem layouts.
- [ ] Re-evaluate full Vietnamese only when a stable external locale-descriptor registration path exists or the project deliberately accepts a complete frontend locale fork.

## Promotion decision

Foundation Freeze remains **BLOCKED / not declared** while any mandatory P1/live/repository row above remains unresolved, unless the owner explicitly records an **ACCEPTED RISK — reason + review date** for a row that is legitimately deferrable.

When the required rows are closed:

1. record final integration commit/tree and exact GREEN quality run;
2. record controlled Preview build identity and smoke evidence;
3. configure and verify main required-quality enforcement;
4. review access/auth and rollback evidence;
5. only then consider a final Foundation PR toward `main`;
6. reconnect Production Auto Deploy only as a separate reviewed action.
