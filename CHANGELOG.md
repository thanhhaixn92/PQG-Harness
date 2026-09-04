# Changelog

All notable PQG Harness project-level changes are recorded here. The project is still in Foundation/Personal-v1 hardening; no stable/public Production release is declared by this changelog.

## Unreleased — Foundation Core WP0–WP7

### Governance and quality

- Added reproducible preparation, generated-drift checking, typecheck, prepared tests, and build quality workflow.
- Added upstream provenance/synchronization policy and explicit project status tracking.
- Kept Production Git Auto Deploy disconnected during Foundation implementation.

### Security and permissions

- Changed missing/invalid/throwing permission resolution to fail closed to read-only behavior.
- Added sensitive automatic workspace path shielding.
- Reduced MCP diagnostics to bounded metadata.
- Removed model-visible preview access credentials in favor of browser-only same-origin routing.
- Reduced Gateway response headers to a reviewed allowlist and replaced raw public proxy/SSE exception text with stable error markers.

### Workspace durability

- Replaced normal metadata snapshots with native sandbox checkpoint persist/restore.
- Added serialized checkpoint writes per conversation.
- Added one-time legacy metadata migration only after native `not_found`.
- Made direct writes fail rather than report durable success when checkpointing fails.
- Checkpoint command-created/modified/deleted state even when commands exit non-zero.
- Added live preview health checks and honest `{ items, truncated, limit }` workspace listing results.

### Sidecar lifecycle and cancellation

- Added explicit `starting` / `ready` / `stopping` sidecar state.
- Shared concurrent startup, bounded retry, idempotent cleanup, active-use leases and current-context refresh.
- Prevented idle cleanup from ending unary streams before body completion.
- Guarded SSE cancellation before late socket creation.
- Made Stop attempt sidecar shutdown and platform abort independently with bounded non-secret outcomes.

### Supply chain and build identity

- Pinned all direct DeepSeek Harness dependencies to reviewed `0.1.0-rc.6`.
- Pinned `ws` to `8.21.3`.
- Added package-lock SRI verification before exceptional native-package extraction.
- Added `dist/build-meta.json` containing exact Git commit/tree/package version and made invalid Git identity a build failure.

### Product layer

- Introduced `PQG Harness` product identity while retaining TencentEdgeOne adapter and DeepSeek core attribution.
- Changed initial locale selection from deployment hostname to browser language.
- Kept `vi`/`vi-VN` on complete English fallback because pinned DSH rc.6 lacks a clean external selectable-locale registration path.
- Added Escape, Tab/Shift+Tab containment, opener focus restoration and background inert handling for the PQG-owned contact dialog.

### Operations and release readiness

- Added `SECURITY.md`, `ARCHITECTURE.md`, `RUNBOOK.md`, release checklist and known-limitations documentation.
- Added a release-doc contract test requiring all Phase 1B P1 findings to be accounted for.
- Explicitly separated source-side GREEN state from live EdgeOne release evidence.

## Current release status

Foundation Freeze is **BLOCKED / not complete** while required live EdgeOne gates remain unresolved, including access/auth, controlled Preview durability/cancellation/smoke, deployed SHA/topology, main required-quality enforcement, observability, and rollback rehearsal.

No Task/Writing/Planning/Document/Data business module is included in this changelog entry.
