# PQG Harness Operations Runbook

## Operating principle

Treat `integration/foundation-core` as the current Foundation consolidation line. `main` remains the stable repository baseline until a controlled release decision is made. The repository records EdgeOne Git Auto Deploy as DISCONNECTED; do not reconnect it as part of routine source work.

Never convert a blocked live verification into PASS based on unit/CI evidence alone.

## 1. Source-side quality

Before integrating a Foundation change, run the same gate enforced by `.github/workflows/quality.yml`:

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected result: all commands succeed and generated artifacts are unchanged after preparation.

`npm run build:prepared` must also produce `dist/build-meta.json` with exact 40-character Git commit/tree identities and the package version.

Because the current quality workflow is triggered only for PRs targeting `main`, Foundation WPs may use a temporary verification PR targeting `main`. Such PRs are evidence-only and must be closed without merge; the canonical implementation PR targets `integration/foundation-core`.

## 2. Controlled Preview release procedure

This procedure must be performed only when EdgeOne Git/Preview access is deliberately available.

1. Select the exact candidate commit from `integration/foundation-core` or a release branch.
2. Record candidate commit and tree.
3. Verify the quality workflow is GREEN on that exact candidate.
4. Verify EdgeOne Console Production/Preview branch mapping and environment-variable scope without copying secret values.
5. Create a controlled Preview deployment of the candidate.
6. Fetch `/build-meta.json` from Preview and verify commit/tree equal the candidate.
7. Run the smoke matrix in `docs/verification/2026-09-04-foundation-preview-smoke.md`.
8. Run the WP6 browser/viewport matrix in `docs/verification/2026-09-04-wp6-preview-ui.md`.
9. Inspect EdgeOne native logs/metrics/traces for a complete representative request.
10. Rehearse Preview rollback/redeploy and verify `/build-meta.json` returns to the expected previous commit.

If any required step is unavailable, record BLOCKED. If a step executes and fails, record FAIL. Do not continue promotion on a required FAIL.

## 3. Access/auth verification

Access/auth is a Foundation Freeze blocker until verified.

In a controlled deployment:

1. use an incognito/logged-out browser;
2. test the root UI and direct Agent/API endpoints;
3. establish whether the outer EdgeOne boundary prevents unauthorized model/tool use;
4. record only the policy/outcome, never session tokens or credentials.

If direct unauthenticated Agent use is possible when it should not be, stop promotion. Review and implement a minimal single-user authentication gate before public/stable use; do not build multi-user RBAC unless the product requirements change.

## 4. Workspace recovery verification

For one test conversation in controlled Preview:

1. create a file using the automatic workspace write tool;
2. create/modify/delete additional files through a shell command;
3. verify the tool reports a successful native checkpoint;
4. recycle/recreate the sandbox using the supported platform mechanism;
5. reopen the same conversation;
6. verify native restore returns the expected exact workspace state;
7. verify files deleted before checkpoint do not reappear;
8. verify no operation reports durable success when checkpoint persistence fails.

The live recycle/recovery result is currently BLOCKED until this procedure is executed.

## 5. Stop and cancellation verification

In controlled Preview:

1. start a command with an observable but harmless delayed side effect inside the test workspace;
2. invoke Stop while the command is running;
3. confirm the DSH sidecar stop and platform abort phases both return bounded status;
4. confirm the command does not continue mutating the workspace silently after Stop;
5. verify a subsequent sidecar acquire does not race the stopping instance;
6. repeat with an SSE/model run and confirm no late browser event socket opens after cancellation.

If the platform command continues despite `abortActiveRun`, document the exact behavior before considering any stronger sandbox termination mechanism.

## 6. Preview troubleshooting

### Preview metadata says published but the site is unavailable

Preview metadata is not authoritative. The runtime checks current sandbox health. Re-publish/restart the preview process in the current sandbox; filesystem restore does not restore running processes.

### Workspace restore fails

Do not persist the partial workspace. Capture the non-secret restore reason. Check whether the live workspace marker exists and whether a native checkpoint is expected. Legacy metadata migration is allowed only after native `not_found`.

### Workspace write succeeded but persistence failed

Treat the operation as non-durable. Preserve the reported path/output for diagnosis, retry a native checkpoint when safe, and do not tell the user the change is safely saved until persist succeeds.

### Sidecar startup fails

The lifecycle layer retries startup up to the bounded attempt count and cleans partially created child/Gateway/MCP resources. Inspect exception names and process exit state; do not dump environment values or prompt bodies into issue evidence.

### Gateway/model fails

Verify only that required `AI_GATEWAY_*` variables are present and scoped to the intended environment. Do not copy their values. Public responses should remain stable code-only errors. If provider debugging is required, keep raw upstream material in a private temporary diagnostic context and remove it afterward.

## 7. Rollback

### Repository-only rollback

If no deployment occurred, revert the offending change on its implementation/integration branch, run the full quality gate, and keep `main`/Production untouched.

### Preview rollback

Use the supported EdgeOne Preview deployment/redeploy mechanism to select the previously known-good commit A after candidate B fails. Verify `/build-meta.json == A`, then run root/session/minimal model smoke.

### Production rollback

Production rollback is not authorized by this runbook alone. Before promotion, record the actual EdgeOne rollback/redeploy mechanism during the controlled Preview rehearsal. If a Production incident occurs, stop Auto Deploy/promotion first, roll back to a previously verified build identity using that supported mechanism, and run only the safe Production smoke subset.

## 8. Credential incident

1. stop deployment/promotion;
2. rotate/revoke the affected credential at its issuer;
3. search repository/PR/Actions/application evidence for accidental copies without reposting the secret;
4. remove public copies and rotate again if exposure scope is uncertain;
5. verify the replacement only in controlled Preview;
6. document the incident without secret values.

See `SECURITY.md` for the security boundary.

## 9. Upstream synchronization

Follow `UPSTREAM.md` rather than normal Git merge ancestry. The local root snapshot and TencentEdgeOne upstream are unrelated histories.

Use a dedicated `sync/upstream-*` branch, compute/apply the vendor delta from the recorded Tencent baseline, and never combine an upstream/DSH package-wave migration with unrelated product-module work. Run quality + Preview smoke before integration.

## 10. Promotion decision

A source-side GREEN WP0-WP7 is necessary but insufficient for Foundation Freeze. Promotion remains blocked while required live rows in `docs/release/RELEASE_CHECKLIST.md` are BLOCKED/NOT VERIFIED unless the owner explicitly accepts a listed risk with a dated reason.

No product module development should be treated as release evidence for an unresolved Foundation gate.
