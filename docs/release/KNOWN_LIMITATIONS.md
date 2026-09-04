# Foundation Core Known Limitations

Review baseline: 2026-09-04

This file records limitations that are intentionally not hidden by Foundation Core GREEN status. It contains boundaries that matter when deciding whether the current code may be used as a Personal v1 foundation or promoted to stable/public deployment.

## 1. Current EdgeOne outer access is insufficient; middleware mitigation still needs live proof

An independent GitHub-hosted anonymous probe against the canonical origin returned:

```text
GET /                -> 200
GET /build-meta.json -> 404
```

Therefore the currently reachable outer deployment does not meet the Personal v1 access requirement, and the known origin does not prove Foundation build identity.

A minimal single-user all-route middleware gate is source-side GREEN. It uses a minimum-32-character `PQG_ACCESS_SECRET`, POST login, signed expiring hardened cookie, fail-closed missing configuration, browser login redirect, and API 401 before application pass-through. It introduces no database or multi-user RBAC.

This is still a **Foundation Freeze blocker** until the secret is configured in a controlled non-Production environment and live anonymous/direct-API/login/logout behavior is verified. See `docs/verification/2026-09-04-foundation-single-user-auth.md`.

## 2. Controlled Preview evidence is BLOCKED

EdgeOne Git integration is owner-reported reconnected, but this session still does not have an independently identified controlled Preview URL/Console view. The following remain BLOCKED:

- authenticated `/build-meta.json` parity;
- workspace recycle/recovery proof;
- live command cancellation after Stop;
- authenticated browser/model/SSE/workspace/approval/export smoke;
- phone/tablet/desktop UI checks;
- native logs/metrics/traces correlation;
- rollback rehearsal.

Reconnect and source-side tests do not substitute for these live cases.

## 3. Production identity and topology are NOT VERIFIED

The current Production deployment commit, Production/Preview branch mapping, environment-variable scope, and rollback mechanism have not been independently verified. Anonymous `/build-meta.json` returned 404 on the canonical origin, so deployed Foundation parity is not established.

See `docs/verification/2026-09-04-edgeone-reconnect-status.md` and `docs/verification/2026-09-04-foundation-single-user-auth.md`.

## 4. Main required-quality enforcement is confirmed absent

Direct GitHub branch/ruleset verification on 2026-09-04 shows:

```text
main protected: false
required-status-check enforcement: off
required contexts/checks: empty
repository rulesets: []
```

The repository has a working `quality` workflow, but GitHub does not enforce it on `main`. Because EdgeOne Git integration is already reconnected, **do not merge/push a Foundation promotion through `main` until the actual deployment branch is verified and required `quality` enforcement is configured**.

## 5. Symlink/canonical filesystem policy is incomplete

Automatic file tools validate normalized relative paths and block common sensitive basenames/extensions before I/O. The reviewed Makers file API used here does not expose a verified canonical `realpath`/`readlink` primitive.

The project therefore does **not** claim complete protection against symlink/canonical-path aliasing. Full-access shell commands are also outside the automatic file-tool lexical denylist. Revisit before accepting untrusted projects/filesystem layouts.

## 6. Two inherited Gateway request headers have unknown semantics

`x-prompt-log` and `x-gateway-quota-bypass` remain inherited compatibility headers. Their authoritative public logging/quota/privacy semantics are **NOT VERIFIED**. Do not interpret their names as guarantees.

## 7. DSH remains pinned to a release-candidate wave

All direct DSH packages are intentionally frozen at `0.1.0-rc.6`. A later DSH migration must be isolated and validated as one compatibility wave through generated drift, tests, Preview smoke, and rollback.

## 8. Dependency audit is point-in-time evidence

The Foundation dependency follow-up refreshed `fast-uri` to `3.1.7` and `qs` to `6.16.0`, then removed a redundant root OpenTelemetry dependency wave while preserving DSH's newer nested telemetry graph.

Fresh verification on the cleaned candidate reported:

```text
563 packages audited
0 known vulnerabilities
quality: install -> prepare -> drift -> typecheck -> tests -> build SUCCESS
```

This is not a guarantee that the dependency graph remains vulnerability-free. New advisories and install-script/native-package trust remain separate concerns. Re-run dependency review before stable/public release and during any DSH compatibility wave.

## 9. Full Vietnamese localization is deferred

Pinned DSH `0.1.0-rc.6` supports per-namespace dictionary registration but exposes a fixed selectable locale descriptor list for Chinese/English. PQG therefore uses complete English fallback for `vi`/`vi-VN` instead of shipping a partial Vietnamese UI.

See `docs/localization/vi-status.md`.

## 10. Generated frontend remains coupled to reviewed DSH patch points

PQG uses producer scripts to patch the published DSH Web shell. The quality drift guard verifies committed output, but a future upstream DSH bundle can invalidate exact patch points. Generated `index.html`/`public/` must not be manually edited as the source of truth.

## 11. Workspace list is intentionally bounded

The workspace list envelope returns at most 400 visible entries and reports `truncated`/`limit`. Callers must not interpret `items` as exhaustive when `truncated` is true.

## 12. Native checkpoint/platform limits still apply

PQG uses platform-native sandbox checkpointing rather than an external database/archive store. Platform limits, exclusions, retention, and availability remain part of the operational boundary. The application surfaces persist failure rather than claiming durable save, but cannot remove platform-level limits.

## 13. Sidecar process state is not durable

The DSH sidecar lives under `/tmp/dsh-makers-web/<conversation>` and can be recreated. Settings YAML is snapshotted separately, while the authoritative Makers project workspace uses sandbox persist/restore. Restored filesystem state does not restart sidecar or preview processes.

## 14. Foundation Freeze is BLOCKED, not complete

WP0–WP7, dependency cleanup, and single-user auth mitigation are source-side GREEN while required live/repository gates remain blocked. **Foundation Freeze is not declared complete** until required rows in `RELEASE_CHECKLIST.md` are closed or explicitly owner-accepted with a dated reason.

No business module should be used as evidence that these infrastructure/release gates are resolved.
