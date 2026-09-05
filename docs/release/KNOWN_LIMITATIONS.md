# Foundation Core Known Limitations

Review baseline: 2026-09-05

This file records limitations that remain after source acceptance and recorded live evidence. Source acceptance baseline, last verified Production identity, and live gate evidence are deliberately kept separate.

## 1. Access/auth environment behavior still needs direct live verification for promotion

The single-user all-route middleware is source-side GREEN. It uses a minimum-32-character `PQG_ACCESS_SECRET`, POST login, a signed expiring hardened cookie and fail-closed missing configuration.

This document does not promote the live environment row without direct evidence tied to the intended Production deployment. Environment-variable presence/scope must not be inferred from source tests.

## 2. M01 isolated workspace recycle/recovery remains BLOCKED

Workspace persistence/restore logic and tests are source-side GREEN, but the required same-conversation live proof is still missing:

```text
write/change/delete
→ native persist
→ force fresh sandbox
→ restore same conversation
→ exact expected state
```

This remains the main unresolved Foundation data-integrity gate.

## 3. Source acceptance baseline is newer than the last verified Production identity

PR #65 acceptance was based on `main` `50212203b5f4afd17a664da0708de6fa83e618b0`, tree `29f59d1c97a26338a01ea7640484237a3aa7480c`, package version `0.1.0`.

The last owner-verified Production `/build-meta.json` evidence is for commit `4918d54046fbe64bd11d28a72438180966ccd9d6`, tree `c6ec52df87a997aca49191053f09f01e497381b3`, package version `0.1.0`. That historical match must not be represented as current Production parity after later source changes; exact intended deployment identity must be verified from `/build-meta.json`.

Production/Preview branch mapping, environment-variable scope and the exact rollback/redeploy mechanism remain Console-owned/unverified details unless recorded by a dedicated live verification.

## 4. Main protection is active

GitHub ruleset **Protect main is ACTIVE**. Pull requests are required, strict `quality` is required, review threads must be resolved, deletion/non-fast-forward updates are blocked, and no bypass actors are configured.

This closes the former M09 repository-enforcement limitation. It does not close unrelated live environment/data gates.

## 5. Stop/cancellation live proof is complete at its recorded checkpoint

**M08 is PASS / CLOSED.** The live delayed-mutation test invoked Stop and confirmed the expected artifact remained absent after waiting beyond the 60-second mutation point.

Cancellation should be re-tested when sidecar, MCP, workspace execution or Stop code changes; it is not a current source blocker.

## 6. Realtime approval delivery is verified at its recorded checkpoint

The `Allow` prompt appeared without browser refresh in Production after the SSE downlink heartbeat fix. Changes to SSE/Host transport must preserve this regression behavior.

A later deployment still requires identity parity before old live evidence is attributed to new source.

## 7. Browser, observability and rollback coverage remain incomplete

The project does not yet claim full representative phone/tablet/desktop, keyboard-only, native trace/log correlation, or rollback-rehearsal coverage. These remain operational release gates rather than source-code defects.

## 8. Symlink/canonical filesystem policy is incomplete

Automatic file tools validate normalized relative paths and block common sensitive basenames/extensions before I/O. The reviewed Makers file API used here does not expose a verified canonical `realpath`/`readlink` primitive.

The project therefore does not claim complete protection against symlink/canonical-path aliasing. Full-access shell commands are also outside the automatic file-tool lexical denylist. Revisit before accepting untrusted projects/filesystem layouts.

## 9. Two inherited Gateway request headers have unknown semantics

`x-prompt-log` and `x-gateway-quota-bypass` remain inherited compatibility headers. Their authoritative public logging/quota/privacy semantics are NOT VERIFIED. Do not interpret their names as guarantees.

## 10. DSH remains pinned to a release-candidate wave

All direct DSH packages are intentionally frozen at `0.1.0-rc.6`. A later DSH migration must be isolated and validated as one compatibility wave through generated drift, tests, real browser boot, deployment identity and rollback.

## 11. Dependency audit is point-in-time evidence

The PR #65 acceptance run reported:

```text
563 packages audited
0 known vulnerabilities
quality: install -> prepare -> drift -> typecheck -> 131 tests -> build SUCCESS
```

This is not a permanent supply-chain guarantee. Re-run dependency review before stable/public release and during any DSH compatibility wave.

## 12. Full Vietnamese localization is deferred

Pinned DSH `0.1.0-rc.6` supports limited locale extension but does not provide the target official third-party-language experience already researched in newer upstream waves. PQG therefore does not patch the compiled DSH core bundle for a full Vietnamese translation.

PQG-owned surfaces are Vietnamese-first, including the current Settings `Tiện ích` contribution. Full DSH localization should use an upstream-supported locale seam after compatibility validation rather than a second PQG i18n runtime or broad string patching.

## 13. Generated frontend remains coupled to reviewed DSH patch points

PQG uses producer scripts to adapt the published DSH Web shell. The quality drift guard verifies committed output, but a future upstream DSH bundle can invalidate exact patch points. Generated `index.html`/`public/` must not be manually edited as the source of truth.

Business module UI should use DSH client-plugin/slot seams rather than adding new bundle string patches.

## 14. Workspace list and native checkpoint limits still apply

Workspace listing returns at most 400 visible entries and reports `truncated`/`limit`; callers must not interpret a truncated list as exhaustive.

PQG uses platform-native sandbox checkpointing rather than an external database/archive store for project workspace state. Platform limits, exclusions, retention and availability remain part of the operational boundary. The application surfaces persistence failure but cannot remove platform-level limits.

## 15. Sidecar process state is not durable

The DSH sidecar lives under `/tmp/dsh-makers-web/<conversation>` and can be recreated. Settings YAML is snapshotted separately, while the authoritative Makers project workspace uses sandbox persist/restore. Restored filesystem state does not restart sidecar or preview processes.

## 16. Plugin-ready is not yet plugin-proven

PR1–PR3 provide module discovery, durable enable policy, MCP module-tool lifecycle, installed-only catalog/API, Settings `Tiện ích`, process-local live toggle propagation, and startup policy seeding.

P6 source acceptance additionally proves:

- malformed installed module metadata fails clearly;
- stale policy is not exposed after uninstall;
- uninstall/reinstall preserves the existing enable override;
- a failing module tool returns an MCP tool error while Makers core tools remain usable;
- source quality remains GREEN with **131/131 tests** and production build PASS.

However, generic `pqg.module` `./client` runtime activation/unload is intentionally not implemented on rc.6, and no real reference/conformance package has yet proven package install → client mount → Makers adapter → disable → enable → uninstall end-to-end.

A minimal reference module is therefore the next architecture proof before describing the platform as plugin-proven. Business-module data preservation is not claimed merely from the module-policy preservation regression.

## 17. Module live propagation is process-local

Settings changes persist the global policy first and then update all currently live `ModuleMcpBridge` instances in the same runtime process. A newly created sidecar seeds from persisted policy.

There is intentionally no distributed synchronous broadcast between separate EdgeOne runtime instances. Do not add distributed coordination until a real business-plugin requirement demonstrates that this limitation is material.

## 18. Foundation live validation is not fully closed

Foundation source, recorded realtime approval behavior, **M08 PASS / CLOSED**, and the protected `main` guardrail are verified. M01 and the remaining deployment/environment/operational rows in `RELEASE_CHECKLIST.md` are still unresolved.

No Task, Writing, Planning, Document, Data, Memory, Workflow or Skill business plugin is implemented yet, and future plugin work must not be used as evidence that an unresolved Foundation gate has passed.
