# Foundation Core Known Limitations

Review baseline: 2026-09-05

This file records limitations that remain after the current source and live evidence. Verified gates are stated explicitly so operator guidance does not preserve historical blockers as current facts.

## 1. Access/auth environment behavior still needs direct live verification

The single-user all-route middleware is source-side GREEN. It uses a minimum-32-character `PQG_ACCESS_SECRET`, POST login, a signed expiring hardened cookie and fail-closed missing configuration.

Direct EdgeOne environment-variable presence/scope and the complete anonymous/login/logout live matrix have not been independently verified in this session. M03 therefore remains BLOCKED even though the source mitigation exists.

## 2. M01 isolated workspace recycle/recovery remains BLOCKED

Workspace persistence/restore logic and tests are source-side GREEN, but the required same-conversation live proof is still missing:

```text
write/change/delete
→ native persist
→ force fresh sandbox
→ restore same conversation
→ exact expected state
```

This is the main remaining Foundation data-integrity gate.

## 3. Production identity is verified; topology details are not

Production `/build-meta.json` is owner-verified as a **MATCH** for `main` commit `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`, package version `0.1.0`.

Production/Preview branch mapping, environment-variable scope and the exact rollback/redeploy mechanism are still Console-owned/unverified details. Do not infer them from the verified deployed identity alone.

## 4. Main protection is active

GitHub ruleset **Protect main is ACTIVE**. Pull requests are required, strict `quality` is required, review threads must be resolved, deletion/non-fast-forward updates are blocked, and no bypass actors are configured.

This closes the former M09 repository-enforcement limitation. It does not close unrelated live environment/data gates.

## 5. Stop/cancellation live proof is complete

**M08 is PASS / CLOSED.** The live delayed-mutation test invoked Stop and confirmed the expected artifact remained absent after waiting beyond the 60-second mutation point.

Cancellation should be re-tested when sidecar, MCP, workspace execution or Stop code changes; it is not a current blocker.

## 6. Realtime approval delivery is verified

The `Allow` prompt now appears without browser refresh in Production after the SSE downlink heartbeat fix. Changes to SSE/Host transport must preserve this regression behavior.

## 7. Browser, observability and rollback coverage remain incomplete

The project does not yet claim full representative phone/tablet/desktop, keyboard-only, native trace/log correlation, or rollback-rehearsal coverage. These remain operational release gates rather than source-code defects.

## 8. Symlink/canonical filesystem policy is incomplete

Automatic file tools validate normalized relative paths and block common sensitive basenames/extensions before I/O. The reviewed Makers file API used here does not expose a verified canonical `realpath`/`readlink` primitive.

The project therefore does not claim complete protection against symlink/canonical-path aliasing. Full-access shell commands are also outside the automatic file-tool lexical denylist. Revisit before accepting untrusted projects/filesystem layouts.

## 9. Two inherited Gateway request headers have unknown semantics

`x-prompt-log` and `x-gateway-quota-bypass` remain inherited compatibility headers. Their authoritative public logging/quota/privacy semantics are NOT VERIFIED. Do not interpret their names as guarantees.

## 10. DSH remains pinned to a release-candidate wave

All direct DSH packages are intentionally frozen at `0.1.0-rc.6`. A later DSH migration must be isolated and validated as one compatibility wave through generated drift, tests, deployment identity and rollback.

## 11. Dependency audit is point-in-time evidence

The recorded compatible dependency cleanup reported:

```text
563 packages audited
0 known vulnerabilities
quality: install -> prepare -> drift -> typecheck -> tests -> build SUCCESS
```

This is not a permanent supply-chain guarantee. Re-run dependency review before stable/public release and during any DSH compatibility wave.

## 12. Full Vietnamese localization is deferred

Pinned DSH `0.1.0-rc.6` supports per-namespace dictionary registration but exposes a fixed selectable locale descriptor list for Chinese/English. PQG therefore uses complete English fallback for `vi`/`vi-VN` instead of shipping a partial translation of the DSH core UI.

PQG-owned future product/module surfaces should be Vietnamese-first. See `docs/localization/vi-status.md`.

## 13. Generated frontend remains coupled to reviewed DSH patch points

PQG uses producer scripts to adapt the published DSH Web shell. The quality drift guard verifies committed output, but a future upstream DSH bundle can invalidate exact patch points. Generated `index.html`/`public/` must not be manually edited as the source of truth.

Business module UI should use DSH client-plugin/slot seams rather than adding new bundle string patches.

## 14. Workspace list and native checkpoint limits still apply

Workspace listing returns at most 400 visible entries and reports `truncated`/`limit`; callers must not interpret a truncated list as exhaustive.

PQG uses platform-native sandbox checkpointing rather than an external database/archive store for project workspace state. Platform limits, exclusions, retention and availability remain part of the operational boundary. The application surfaces persistence failure but cannot remove platform-level limits.

## 15. Sidecar process state is not durable

The DSH sidecar lives under `/tmp/dsh-makers-web/<conversation>` and can be recreated. Settings YAML is snapshotted separately, while the authoritative Makers project workspace uses sandbox persist/restore. Restored filesystem state does not restart sidecar or preview processes.

## 16. Foundation live validation is not fully closed

Foundation source, Production identity, realtime approval, **M08 PASS / CLOSED**, and the protected `main` guardrail are verified. M01 and the remaining environment/operational rows in `RELEASE_CHECKLIST.md` are still unresolved.

No Task, Writing, Planning, Document, Data, Memory, Workflow or Skill business plugin is implemented yet, and future plugin work must not be used as evidence that an unresolved Foundation gate has passed.
