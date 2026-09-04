# PQG-Harness Phase 2 Hardening — Master Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the current EdgeOne/DeepSeek Harness baseline into a durable, testable PQG-Harness MVP without rewriting the architecture or breaking upstream compatibility.

**Architecture:** Keep the current TencentEdgeOne adapter/DeepSeek Harness structure intact. Add safety rails first, then fix permission/data boundaries, workspace durability, sidecar lifecycle, dependency/build compatibility, operational verification, and finally productization. EdgeOne Git Auto Deploy remains the sole deployment owner.

**Tech Stack:** Node.js 24, TypeScript, Node test runner, Vite, DeepSeek Harness, MCP TypeScript SDK, EdgeOne Makers Agents/Sandbox/Store/Models.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md`

## Global Constraints

- Canonical audited base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`.
- Do not rewrite the architecture or replace EdgeOne hosting.
- Do not add a second autonomous deployment pipeline.
- Do not upgrade the DSH family piecemeal.
- Preserve loopback binding of DSH Host, local Gateway, and MCP bridge.
- Preserve lower-privilege default; never make Full Access the default.
- Do not hand-edit generated `public/` assets or generated root `index.html`.
- Every runtime change is test-first and lands through Preview before `main`.
- Every task ends with an independently reviewable commit.
- Production/stable release remains blocked until the Phase 1B P1 release gates are closed or explicitly accepted with evidence.

---

## Plan set and order

| Order | Plan | Primary master findings | Dependency |
|---:|---|---|---|
| 0 | `2026-09-04-pqg-harness-wp0-governance-quality.md` | M09, M10, M19, foundational M22 | none |
| 1 | `2026-09-04-pqg-harness-wp1-security-permissions.md` | M02, M03, M04, M05, M14, M17 | WP0 |
| 2 | `2026-09-04-pqg-harness-wp2-workspace-durability.md` | M01, M16 | WP0, security policy from WP1 |
| 3 | `2026-09-04-pqg-harness-wp3-sidecar-cancellation.md` | M06, M07, M08 | WP0; workspace persistence interface from WP2 |
| 4 | `2026-09-04-pqg-harness-wp4-dependencies-build-gateway.md` | M11, M12, M15, M18 | WP0–WP3 tests green |
| 5 | `2026-09-04-pqg-harness-wp5-production-observability.md` | M13, M20, operational M22 | WP0–WP4 Preview green |
| 6 | `2026-09-04-pqg-harness-wp6-productization-vietnamese-a11y.md` | M21 | stable hardening baseline from WP0–WP5 |
| 7 | `2026-09-04-pqg-harness-wp7-release-readiness.md` | remaining M22 + closure evidence | WP0–WP6 |

## Non-negotiable execution order

```text
WP0 safety rail
  -> WP1 security/permissions
  -> WP2 durable workspace
  -> WP3 sidecar/cancellation
  -> WP4 dependency/build/gateway
  -> WP5 live production/observability
  -> WP6 productization
  -> WP7 release gate
```

Tasks inside a WP may be parallelized only when the plan explicitly says they do not share files/state.

## Cross-plan acceptance gates

### Gate A — Implementation may begin

- [ ] Owner approves this Phase 2 plan set.
- [ ] Work branch is based on the latest approved `main`/baseline.
- [ ] EdgeOne Preview is used for functional changes; no direct `main` development.
- [ ] No DSH/version refresh is mixed into WP1–WP3.

### Gate B — Durable personal MVP

- [ ] Permission-resolution failure is fail-closed.
- [ ] Sensitive workspace policy is enforced.
- [ ] Workspace uses proven persist/restore semantics across recycle.
- [ ] Stop/cancellation behavior is deterministic enough for user expectations.
- [ ] Sidecar startup/cleanup races have regression tests.
- [ ] Core adapter integration tests pass.
- [ ] Preview smoke passes.

### Gate C — Stable/public use

- [ ] EdgeOne access/auth policy is documented and sufficient, or application auth/ownership is implemented.
- [ ] Production/Preview branch mapping and Auto Deploy are verified.
- [ ] Production deployed SHA is identifiable.
- [ ] Gateway privacy/header semantics are documented/controlled.
- [ ] Production-supported model policy is configured.
- [ ] Rollback/recovery runbook has been exercised.
- [ ] A12 black-box smoke passes from an independent reachable network/browser.

## Keep-as-is decisions during Phase 2

- Keep EdgeOne Auto Deploy as deployment owner.
- Keep DSH at the currently tested wave until WP4 explicitly handles a coordinated upgrade decision.
- Keep fail-fast bundle patch assertions.
- Keep generated frontend artifacts generated.
- Keep EdgeOne native observability as the first choice before adding third-party telemetry.

## Final Phase 2 deliverable

A sequence of small PRs/commits where every change is backed by tests, Preview evidence, and a clear rollback point. No single PR should combine workspace persistence, sidecar lifecycle, dependency upgrades, and productization.