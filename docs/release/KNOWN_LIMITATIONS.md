# Foundation Core Known Limitations

Review baseline: 2026-09-04

This file records limitations that are intentionally not hidden by the Foundation Core GREEN status. It is not a backlog of every possible future enhancement; it contains boundaries that matter when deciding whether the current code may be used as a Personal v1 foundation or promoted to a stable/public deployment.

## 1. EdgeOne access/auth is NOT VERIFIED

The current deployed Agent access policy has not been independently verified in EdgeOne Console or by logged-out/incognito direct API testing. This is a **Foundation Freeze blocker**.

Do not assume the deployment is private. If the outer platform boundary is insufficient, a separately reviewed minimal single-user auth gate is required before stable/public use.

## 2. Controlled Preview evidence is BLOCKED

The current execution environment cannot create/use a controlled EdgeOne Preview deployment. Therefore the following remain BLOCKED:

- exact deployed `/build-meta.json` parity;
- workspace recycle/recovery proof;
- live command cancellation after Stop;
- browser/model/SSE/workspace/approval/export smoke;
- phone/tablet/desktop UI checks;
- native logs/metrics/traces correlation;
- rollback rehearsal.

Source-side tests do not substitute for these live cases.

## 3. Production identity and topology are NOT VERIFIED

The repository records Git Auto Deploy as **DISCONNECTED** by the owner. The current Production deployment commit, Production/Preview branch mapping, environment-variable scope, and rollback mechanism have not been independently verified from this execution environment.

The existing known URL may therefore run an older source revision. No statement in Foundation docs should imply deployed parity until `/build-meta.json` is checked on a controlled deployment.

## 4. Main required-quality enforcement is not confirmed

The repository has a working quality workflow and Foundation candidates have been verified through temporary PRs targeting `main`. However, a required-check/ruleset that prevents an unsafe `main` update is not independently confirmed as enabled.

Before any Git Auto Deploy reconnect, require the `quality` gate on `main` or apply an equivalent repository rule.

## 5. Symlink/canonical filesystem policy is incomplete

Automatic file tools validate normalized relative paths and block common sensitive basenames/extensions before I/O. The reviewed Makers file API used by the project does not expose a verified canonical `realpath`/`readlink` primitive in this implementation.

Therefore the project does **not** claim complete protection against symlink/canonical-path aliasing. Full-access shell commands are also outside the automatic file-tool lexical denylist.

This is acceptable only under the Personal v1 trust model where the workspace owner controls the environment. Revisit before accepting untrusted projects/filesystem layouts.

## 6. Two inherited Gateway request headers have unknown semantics

`x-prompt-log` and `x-gateway-quota-bypass` remain inherited compatibility headers. Their authoritative public logging/quota/privacy semantics are **NOT VERIFIED**.

The project deliberately avoids interpreting these names as guarantees. Remove/change them only after provider/platform behavior is verified.

## 7. DSH remains pinned to a release-candidate wave

All direct DSH packages are intentionally frozen at `0.1.0-rc.6`. This avoids a coordinated upgrade wave during Foundation Core but also means the project depends on a release-candidate ecosystem.

Do not opportunistically upgrade individual DSH packages. A later DSH migration should be isolated, reviewed as one compatibility wave, and validated through generated drift, tests, Preview smoke, and rollback.

## 8. Current dependency audit findings are not fully modernized

Current `npm ci` quality logs report dependency audit findings. WP4 fixed the reviewed `ws` issue, froze the DSH wave, and added native-package integrity verification; it did not perform a broad forced dependency upgrade.

Before a stable/public release, triage remaining high/moderate findings for exploitability in this runtime rather than automatically running a breaking `npm audit fix --force`.

## 9. Full Vietnamese localization is deferred

Pinned DSH `0.1.0-rc.6` supports per-namespace dictionary registration but exposes a fixed selectable locale descriptor list for Chinese/English. PQG therefore uses complete English fallback for `vi`/`vi-VN` instead of shipping a partial Vietnamese UI.

See `docs/localization/vi-status.md`. Full Vietnamese becomes a separate product decision after Foundation Freeze.

## 10. Generated frontend remains coupled to reviewed DSH patch points

PQG uses producer scripts to patch the published DSH Web shell. The quality drift guard ensures committed generated output matches those producers, but a future upstream DSH bundle can invalidate exact patch points.

This is why DSH upgrades must be isolated and why generated `index.html`/`public/` should never be manually edited as the source of truth.

## 11. Workspace list is intentionally bounded

The workspace list envelope returns at most 400 visible entries and reports `truncated`/`limit`. Callers must not interpret `items` as exhaustive when `truncated` is true.

This is an explicit Foundation Core performance/clarity boundary, not a silent data-loss condition.

## 12. Native checkpoint/platform limits still apply

PQG uses the platform-native sandbox checkpoint mechanism rather than inventing an external database or custom archive store. Platform limits, exclusions, retention, and availability therefore remain part of the operational boundary.

The application surfaces persist failure rather than claiming a durable save, but it does not remove platform-level checkpoint limits.

## 13. Sidecar process state is not durable

The DSH sidecar lives under `/tmp/dsh-makers-web/<conversation>` and can be recreated. Settings YAML is snapshotted separately, while the authoritative Makers project workspace uses sandbox persist/restore.

A restored filesystem checkpoint does not restart sidecar or preview processes. Runtime health must be re-established after recycle/restart.

## 14. Foundation Freeze is BLOCKED, not complete

WP0-WP7 may become source-side GREEN while required live gates remain blocked. **Foundation Freeze is not declared complete** until the required rows in `RELEASE_CHECKLIST.md` are closed or explicitly owner-accepted with a dated reason.

No business module should be used as evidence that these infrastructure/release gates are resolved.
