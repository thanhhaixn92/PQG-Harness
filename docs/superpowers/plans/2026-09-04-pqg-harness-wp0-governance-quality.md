# PQG-Harness WP0 Governance & Quality Safety Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish a non-deploying quality gate, clean generated-artifact verification, provenance controls, and a safe Preview→main promotion workflow before substantive runtime edits.

**Architecture:** Keep EdgeOne Git Auto Deploy as the only deployment owner. GitHub Actions validates PRs only. Split preparation from prepared test/build commands so CI can generate once, assert a clean tree, then execute typecheck/tests/build without hiding stale committed artifacts.

**Tech Stack:** GitHub Actions, Node.js 24, npm, TypeScript, Vite, Node test runner, EdgeOne Makers Git deployment.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M09, M10, M19, M22.

## Global Constraints

- Do not deploy from GitHub Actions.
- Do not modify EdgeOne runtime/source behavior in WP0.
- Do not change dependency versions.
- `npm run build:makers` production semantics remain unchanged.
- Generated outputs remain committed only where the current project already commits them.

---

## File map

**Create:**
- `.github/workflows/quality.yml` — PR-only quality gate.
- `UPSTREAM.md` — exact upstream provenance and sync policy.
- `PROJECT_STATUS.md` — canonical environment/revision/readiness record without secrets.
- `CONTRIBUTING.md` — branch/PR/generated-file/test rules.

**Modify:**
- `package.json` — add prepared variants without changing existing public scripts.

**Tests/verification:**
- existing `tests/*.test.ts`.
- clean-tree drift check over `index.html`, `public/`, `agents/api/`.

---

### Task 1: Add prepared test/build entry points

**Files:**
- Modify: `package.json`

**Interfaces:**
- Produces `npm run test:prepared` and `npm run build:prepared` for CI after one explicit preparation pass.
- Existing `npm test`, `npm run build`, `npm run build:makers` remain unchanged.

- [ ] **Step 1: Record current scripts**

Run:

```bash
node -e "const p=require('./package.json'); console.log(p.scripts)"
```

Expected: existing `test`, `typecheck`, `build`, `build:makers`, `prepare:dsh-web` entries are present.

- [ ] **Step 2: Edit only the scripts object**

Add exactly:

```json
"test:prepared": "node --experimental-strip-types --test tests/*.test.ts",
"build:prepared": "vite build"
```

Do not rewrite the existing `test`/`build` commands.

- [ ] **Step 3: Verify JSON and script resolution**

Run:

```bash
node -e "const p=require('./package.json'); if(!p.scripts['test:prepared']||!p.scripts['build:prepared']) process.exit(1)"
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: expose prepared quality commands"
```

---

### Task 2: Add one PR quality workflow and no deploy job

**Files:**
- Create: `.github/workflows/quality.yml`

**Interfaces:**
- Consumes `test:prepared`, `build:prepared`, `prepare:dsh-web` from Task 1.
- Produces one required check named `quality`.

- [ ] **Step 1: Create workflow**

Use this exact initial workflow:

```yaml
name: quality

on:
  pull_request:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: quality-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Prepare DSH web once
        run: npm run prepare:dsh-web

      - name: Verify committed generated artifacts are current
        run: git diff --exit-code -- index.html public agents/api

      - name: Typecheck
        run: npm run typecheck

      - name: Test prepared tree
        run: npm run test:prepared

      - name: Build prepared frontend
        run: npm run build:prepared
```

Do not add `edgeone makers deploy`, secrets, environment deployment keys, or a push-to-production job.

- [ ] **Step 2: Validate YAML shape locally if available**

Run:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('.github/workflows/quality.yml','utf8'); for (const x of ['npm ci','prepare:dsh-web','git diff --exit-code','typecheck','test:prepared','build:prepared']) if(!s.includes(x)) throw new Error(x)"
```

Expected: exit 0.

- [ ] **Step 3: Confirm workflow contains no deploy command**

Run:

```bash
! grep -R "edgeone .*deploy\|makers deploy\|pages deploy" .github/workflows/quality.yml
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/quality.yml
git commit -m "ci: add non-deploying quality gate"
```

---

### Task 3: Prove the quality sequence on a clean checkout

**Files:**
- No source changes expected.

- [ ] **Step 1: Start from clean tree**

```bash
git status --short
```

Expected: empty.

- [ ] **Step 2: Run the workflow sequence**

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected: every command exits 0.

- [ ] **Step 3: Check preparation did not leave hidden drift**

```bash
git status --short
```

Expected: empty. If not empty, stop; do not commit generated drift without reviewing why the exact audited baseline regenerates differently.

- [ ] **Step 4: Record command evidence in PR body**

Record exact Node/npm versions and pass/fail outputs. Do not create a repository file solely for command logs.

---

### Task 4: Add upstream provenance control

**Files:**
- Create: `UPSTREAM.md`

**Interfaces:**
- Produces the immutable baseline used by later sync/upgrade plans.

- [ ] **Step 1: Create `UPSTREAM.md` with exact known baseline**

```markdown
# Upstream provenance

## Local canonical repository
- Repository: `https://github.com/thanhhaixn92/PQG-Harness`
- Initial local commit: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Initial local tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

## EdgeOne adapter upstream
- Repository: `https://github.com/TencentEdgeOne/deepseek-harness`
- Imported baseline commit: `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- Imported baseline tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

The local repository was created as an unrelated root snapshot. Standard Git ahead/behind and merge ancestry are not meaningful against the Tencent repository.

## Sync policy
1. Never routine-merge with `--allow-unrelated-histories`.
2. Record the last imported Tencent commit/tree.
3. Compute upstream changes from the recorded Tencent baseline to the new Tencent target.
4. Apply/review that delta on a dedicated `sync/upstream-*` branch.
5. Run the quality gate, Preview deployment and smoke tests before changing `main`.
6. Do not mix a DSH package-wave upgrade with unrelated product changes.
```

- [ ] **Step 2: Commit**

```bash
git add UPSTREAM.md
git commit -m "docs: record upstream provenance"
```

---

### Task 5: Add project status and contributor controls

**Files:**
- Create: `PROJECT_STATUS.md`
- Create: `CONTRIBUTING.md`

- [ ] **Step 1: Create `PROJECT_STATUS.md` without claiming unverified state**

```markdown
# PQG-Harness project status

## Source
- Canonical branch: `main`
- Audited baseline: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Upstream provenance: see `UPSTREAM.md`

## Known deployment
- Known URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- Production branch mapping: NOT VERIFIED — confirm in EdgeOne Console
- Preview branch behavior: NOT VERIFIED — confirm in EdgeOne Console
- Access/auth policy: NOT VERIFIED — confirm in EdgeOne Console
- Deployed commit parity: NOT VERIFIED

## Release status
Developer/MVP hardening. Not approved as stable/public production until Phase 2 release gates are closed.
```

- [ ] **Step 2: Create `CONTRIBUTING.md`**

Include these exact rules:

```markdown
# Contributing

- Do not develop directly on `main`.
- Use `feature/*`, `fix/*`, `sync/*`, or other review branches.
- EdgeOne Auto Deploy is the deployment owner; GitHub Actions is validation-only.
- Do not hand-edit generated `public/`, generated `agents/api/*`, or generated root `index.html`; edit the producer script/source and regenerate.
- Before PR: run `npm ci`, `npm run prepare:dsh-web`, generated drift check, `npm run typecheck`, `npm run test:prepared`, `npm run build:prepared`.
- DSH dependencies are a coordinated wave: never upgrade one DSH package in isolation.
- Preserve upstream attribution and update `UPSTREAM.md` for upstream imports.
```

- [ ] **Step 3: Commit**

```bash
git add PROJECT_STATUS.md CONTRIBUTING.md
git commit -m "docs: add project status and contribution rules"
```

---

### Task 6: Validate Preview workflow before protecting `main`

**Files:**
- No source change.

- [ ] **Step 1: Push a docs/test-only feature branch**

Use the implementation branch for WP0 and confirm in EdgeOne Console that it creates Preview only.

Expected evidence to record outside secrets:
- branch name;
- Preview deployment ID/URL;
- Production not changed;
- Auto Deploy state for Preview/Production.

- [ ] **Step 2: Confirm GitHub `quality` passes on the PR**

Expected: one `quality` check green; no deployment job in GitHub Actions.

- [ ] **Step 3: Only after the check has proven stable, enable `main` ruleset/protection**

Required policy:
- PR required;
- required status check: `quality`;
- force push disabled;
- branch deletion disabled;
- admin bypass documented/minimized.

If the current GitHub plan/account cannot enforce one of these controls, document the limitation in `PROJECT_STATUS.md` rather than claiming it is enabled.

---

## WP0 acceptance criteria

- [ ] `main` is never edited directly during normal development.
- [ ] Quality workflow has no deploy command or deployment secret.
- [ ] One preparation pass is followed by generated-drift check.
- [ ] `typecheck`, prepared tests, prepared build pass from clean checkout.
- [ ] `UPSTREAM.md`, `PROJECT_STATUS.md`, `CONTRIBUTING.md` exist and contain no secrets.
- [ ] Preview branch behavior is verified before branch protection is made dependent on the new check.
- [ ] EdgeOne remains the single deployment owner.

## Rollback

WP0 is operational/documentation only. If the workflow blocks valid changes unexpectedly, revert only the `.github/workflows/quality.yml` commit or temporarily remove the required-check rule; do not bypass by adding a deploy workflow or disabling EdgeOne deployment ownership.