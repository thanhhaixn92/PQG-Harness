# PQG-Harness WP5 Production Topology, Smoke & Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish authoritative evidence for what EdgeOne deploys, which commit is live, how Preview promotes to Production, whether the Agent API is gated, and whether native logs/traces are sufficient across the DSH sidecar boundaries.

**Architecture:** Add a build-only revision artifact that derives identity from Git itself, then verify EdgeOne Console topology and rerun the non-destructive A12 smoke from a reachable browser/network. Prefer EdgeOne-native logs/metrics/traces; add custom instrumentation only after a concrete missing-boundary gap is observed and the current tracer API is read from official docs.

**Tech Stack:** EdgeOne Makers deployments/observability, Node/Vite build, browser smoke testing.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M13, M20, operational M22.

## Global Constraints

- No production stress/load testing.
- No production shell command or Full Access approval for smoke verification.
- Do not print or commit secret environment values.
- Do not add Sentry, Datadog, Grafana or another telemetry stack before proving EdgeOne-native observability is insufficient.
- Production deploy remains owned by EdgeOne Git Auto Deploy.
- Every production change must first pass Preview.

---

## File map

**Create:**
- `scripts/write-build-meta.mjs` — writes ignored `dist/build-meta.json` after build.
- `tests/build-meta.test.ts` — pure metadata formatting test.

**Modify:**
- `package.json` — append build metadata step to both normal/prepared Vite builds without changing Makers packaging semantics.
- `PROJECT_STATUS.md` — record confirmed topology/build/access evidence.
- Later, only if native trace gap is confirmed: exact first-party files owning the missing boundary, after reading current EdgeOne tracer API.

---

### Task 1: Emit an exact Git revision artifact into `dist/`

**Files:**
- Create: `scripts/write-build-meta.mjs`
- Create: `tests/build-meta.test.ts`
- Modify: `package.json`

**Interfaces:**

Generated `dist/build-meta.json`:

```json
{
  "commit": "<40-char git sha>",
  "tree": "<40-char git tree sha>",
  "packageVersion": "0.1.0"
}
```

Do not include branch names, usernames, remote URLs, secrets, environment values or timestamps.

- [ ] **Step 1: Write the pure formatting test**

Export from the script:

```js
export function buildMeta({ commit, tree, packageVersion })
```

Test:

```ts
assert.deepEqual(buildMeta({
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  packageVersion: '0.1.0',
}), {
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
  packageVersion: '0.1.0',
})
```

and reject non-40-hex commit/tree values.

- [ ] **Step 2: Implement the build script**

Use `spawnSync('git', ['rev-parse', 'HEAD'])` and `spawnSync('git', ['rev-parse', 'HEAD^{tree}'])`; read `package.json`; create `dist/`; write JSON. If Git identity cannot be resolved, fail the build rather than writing `unknown`.

- [ ] **Step 3: Append the script after Vite output**

After WP0, set:

```json
"build:prepared": "vite build && node scripts/write-build-meta.mjs"
```

and keep normal build preparation:

```json
"build": "npm run prepare:dsh-web && npm run build:prepared"
```

`build:makers` remains:

```json
"build:makers": "npm run build && npm run prepare:makers-runtime && node scripts/prune-agent-dependencies.mjs && node scripts/clean-agent-node.mjs"
```

- [ ] **Step 4: Run tests/build**

```bash
node --experimental-strip-types --test tests/build-meta.test.ts
npm run build
cat dist/build-meta.json
```

Expected: commit/tree match `git rev-parse` exactly; `git status --short` does not show `dist` because it is ignored.

- [ ] **Step 5: Commit**

```bash
git add scripts/write-build-meta.mjs tests/build-meta.test.ts package.json
git commit -m "feat: expose deployed build revision"
```

---

### Task 2: Capture authoritative EdgeOne environment topology

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Read EdgeOne Console Project/Environment settings**

Record only non-secret facts:

- Production associated branch;
- Preview branch behavior;
- Production Auto Deploy on/off;
- Preview Auto Deploy on/off;
- Production generated/custom domain(s);
- Preview domain behavior;
- presence (not value) and environment scope of required `AI_GATEWAY_*` variables;
- access/auth protection enabled/disabled and scope;
- current successful deployment ID and source commit if Console displays it.

- [ ] **Step 2: Verify intended branch mapping**

Expected target:

```text
feature/* or fix/* -> Preview only
main               -> Production
```

If the Console does not match this, correct **Console branch associations only after capturing the old state and confirming the change will not deploy an audit/plan branch to Production**.

- [ ] **Step 3: Verify the Preview branch already used by Phase 2**

Push/update a safe docs-only test branch if necessary; confirm a Preview deployment appears and Production deployment does not change.

- [ ] **Step 4: Update `PROJECT_STATUS.md`**

Use factual rows:

```markdown
- Production branch: `main` — CONFIRMED in EdgeOne Console YYYY-MM-DD
- Preview: non-production Git branches — CONFIRMED ...
- Production Auto Deploy: enabled|disabled — CONFIRMED ...
- Agent access policy: <control or public> — CONFIRMED ...
- Runtime env presence: AI_GATEWAY_API_KEY present in <env>; value not inspected
```

Do not paste screenshots containing keys/tokens into the repository.

- [ ] **Step 5: Commit documentation only**

```bash
git add PROJECT_STATUS.md
git commit -m "docs: record verified EdgeOne topology"
```

---

### Task 3: Prove deployed commit parity through `/build-meta.json`

**Files:**
- Modify: `PROJECT_STATUS.md`

- [ ] **Step 1: Deploy current Phase 2 branch to Preview**

Wait for successful build.

- [ ] **Step 2: Fetch Preview build metadata**

```bash
curl -fsS https://<preview-host>/build-meta.json
```

Expected `commit` equals the exact Preview branch HEAD deployed by EdgeOne.

- [ ] **Step 3: After an approved merge to `main`, fetch Production metadata**

```bash
curl -fsS https://pqg-harness-dp0dukyw6bfl.edgeone.cool/build-meta.json
```

Expected `commit` equals the intended `main` release SHA.

Do not merge solely to perform this step before the owner has approved implementation/release sequencing; in pre-merge planning, Preview parity is sufficient.

- [ ] **Step 4: Record last verified release identity**

In `PROJECT_STATUS.md`:

```markdown
- Last verified deployment: `<commit>` / tree `<tree>` / EdgeOne deployment `<id>` / verified `<date>`
```

---

### Task 4: Rerun A12 black-box smoke from a reachable browser/network

**Files:**
- Do not rewrite historical `A12-live-production-smoke.md`.
- Create future execution evidence under `docs/verification/` only when implementation begins, e.g. `docs/verification/2026-09-04-preview-smoke.md`.

**Test matrix (non-destructive):**

1. DNS/TLS/root HTTP.
2. `build-meta.json` commit parity.
3. Main shell render.
4. Initial console/network errors.
5. Static JS/CSS/plugin assets.
6. Model selector render.
7. Permission selector + default mode.
8. Session creation.
9. Exactly one minimal prompt: `Reply exactly: OK`.
10. Streaming/SSE progression.
11. Refresh/reopen state.
12. Restricted command below Full Access: verify approval prompt only; **do not approve** on Production.
13. Session export with a non-sensitive smoke session.
14. Preview button only in Preview/testing where a preview has been published safely.
15. Phone/tablet/desktop viewport smoke.
16. Observed auth/access gate from logged-out/incognito client.

- [ ] **Step 1: Run full matrix on Preview first**

Every test records `PASS | FAIL | BLOCKED`, actual result and build commit.

- [ ] **Step 2: Resolve all FAIL items before Production**

Do not convert blocked tests into PASS.

- [ ] **Step 3: Run safe subset on Production after an approved release**

Production subset excludes shell execution, sandbox recycle and destructive mutation.

---

### Task 5: Verify EdgeOne native observability across the actual boundary chain

**Files:**
- No source change unless gap is confirmed.

- [ ] **Step 1: Run one deterministic Preview scenario**

Use a non-sensitive prompt plus:
- one workspace read/list MCP call;
- one automatic write to a harmless test file if WP2 Preview test workspace is disposable;
- one controlled Stop/cancellation scenario.

- [ ] **Step 2: Inspect EdgeOne Logs/Metrics/Agent Traces**

Attempt to correlate:

```text
browser/Agent request
 -> Host API proxy
 -> DSH child
 -> local AI Gateway/model
 -> MCP tool
 -> sandbox
 -> response/stop
```

Record which boundaries/spans are visible and which are missing. Never copy full prompts/secrets into repository evidence.

- [ ] **Step 3: Decision rule**

If native traces/logs show sufficient latency/error/correlation for sidecar, Gateway/model and MCP/tool boundaries, **add no custom telemetry**.

If one or more first-party boundaries are missing, read the **current official EdgeOne tracer API** and create a focused instrumentation commit only for those missing boundaries. Do not invent method names from memory. The instrumentation commit must contain:
- event/span name;
- duration/status/error class only;
- no API key/token/prompt/tool body/file content;
- test or compile-time verification of the actual API used.

- [ ] **Step 4: Verify any instrumentation in Preview**

Repeat the same scenario and prove the missing boundary is now visible.

---

### Task 6: Rehearse rollback/redeploy on Preview

**Files:**
- Update `PROJECT_STATUS.md` with evidence; full runbook is WP7.

- [ ] **Step 1: Identify two known-good Preview commits A and B**

Both must have green quality checks and distinct `build-meta.json` SHAs.

- [ ] **Step 2: Deploy B, then redeploy/revert to A using the EdgeOne-supported mechanism**

Do this in Preview, not Production.

- [ ] **Step 3: Verify rollback by metadata and smoke**

Expected:
- `/build-meta.json` returns A;
- shell loads;
- minimal model/session smoke passes;
- environment variables remain correctly scoped without revealing values.

- [ ] **Step 4: Record actual EdgeOne behavior**

Capture whether the action reuses retained artifacts or rebuilds, what configuration snapshot is applied, and how long recovery takes. These facts feed `RUNBOOK.md` in WP7.

---

## WP5 acceptance criteria

- [ ] Every Preview/Production deployment can expose exact commit/tree through `/build-meta.json`.
- [ ] Production branch, Preview mapping and Auto Deploy state are confirmed.
- [ ] Required environment-variable presence/scope is confirmed without exposing values.
- [ ] Access/auth gate is confirmed, not inferred.
- [ ] A12-equivalent smoke runs from a reachable browser/network and records build SHA.
- [ ] EdgeOne native observability is explicitly proven sufficient or missing boundaries are narrowly instrumented using the current official API.
- [ ] Preview rollback/redeploy is rehearsed and measured.

## Rollback

`build-meta.json` is read-only build evidence and can be reverted independently. Console topology changes must always preserve a captured prior state. Any optional custom telemetry added after a proven gap is one separate commit and can be reverted without changing runtime business logic.