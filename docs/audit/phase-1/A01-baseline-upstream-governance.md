# A01 — Baseline, upstream provenance & Git governance

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Audit date/time: `2026-09-04 16:55:27 +07:00` (`Asia/Bangkok`)
- Auditor/subagent: `Subagent A01`
- Verdict: **PARTIAL**

The expected baseline SHA in the audit prompt was `70119cfdae992a203a5e29eb24e91c7200222a7c`. The canonical `main` HEAD resolved to the same SHA at audit time; there is no baseline-SHA discrepancy.

## 2. Scope
This audit is limited to baseline identity, upstream provenance, Git graph/state, branch governance, repository-level issue/PR/release hygiene, and a safe upstream synchronization model.

In scope:
- canonical `main`, exact HEAD SHA, commit graph and branch state;
- root-snapshot vs fork/common-ancestry provenance;
- relationship to `TencentEdgeOne/deepseek-harness`;
- indirect relationship to `deepseek-ai/deepseek-harness`;
- Git tree/content equivalence where provable by object SHA;
- current Tencent adapter HEAD and any content delta from the local snapshot;
- readable rulesets, branch-protection summary, status checks and workflow-run evidence;
- issue/PR/release/tag inventory to the extent exposed by the connected GitHub API;
- governance risk for a production-linked `main` branch;
- upstream sync strategy for unrelated histories;
- repository naming, ownership, provenance, and release/version markers.

Out of scope by instruction: runtime security, MCP implementation, workspace persistence, UI, and dependency-upgrade details. Those are handed off to the corresponding audit domains.

The production URL supplied to this audit is `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`. The exact deployment-to-commit mapping was not independently verified in A01 and is a cross-audit handoff to A07.

## 3. Method
Evidence was collected read-only from the GitHub repository/API and public upstream repositories. No source, dependency, lockfile, generated asset, CI/CD, EdgeOne configuration, runtime configuration, secret, release, tag, or deployment was modified.

Primary checks:
1. Resolve repository metadata and canonical default branch.
2. Resolve `main` branch object, commit parents, and tree SHA.
3. Inspect local commit inventory and branch inventory.
4. Resolve `TencentEdgeOne/deepseek-harness` repository metadata, current `main` HEAD, commit graph, and tree SHA.
5. Resolve `deepseek-ai/deepseek-harness` repository metadata and current default-branch HEAD.
6. Compare Git object/tree identities rather than relying on filenames or timestamps.
7. Read repository rulesets; inspect branch protection summary; query commit statuses and workflow runs.
8. Inventory issues, pull requests, releases, and available tag evidence.
9. Inspect repository/package/README provenance markers.

A shell-level `git ls-remote` check was attempted only in a temporary directory, but the execution environment could not resolve `github.com` (`Could not resolve host: github.com`). No repository working copy was created or changed by that attempt. GitHub API evidence therefore serves as the authoritative evidence source for this audit.

## 4. Architecture / current-state summary
`thanhhaixn92/PQG-Harness` is a public, non-fork GitHub repository whose canonical branch is `main`. At audit time, `main` points to a single root commit:

- local commit: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- commit message: `feat: init`
- parent commits: none (`parents: []`)
- local tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

The current `TencentEdgeOne/deepseek-harness` `main` HEAD is:

- upstream adapter commit: `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- upstream tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`

The local tree SHA and current Tencent adapter tree SHA are identical. This is direct Git-object evidence that the complete tracked tree content represented by local `main` is equivalent to the tracked tree content at Tencent adapter HEAD at audit time, despite different commit identities and unrelated histories.

`TencentEdgeOne/deepseek-harness` is itself reported by GitHub as `fork: false`. Its first commit, `ce79ad2fe3d997602c044f32e45eef14cc42d4ef`, is also a root commit (`parents: []`). Therefore neither the local repository nor the Tencent adapter preserves Git fork ancestry to the official `deepseek-ai/deepseek-harness` repository.

The Tencent adapter's relationship to `deepseek-ai/deepseek-harness` is indirect and implementation-oriented: its README describes use of the official DSH Web/Host packages and its `package.json` depends extensively on `@deepseek-ai/*` packages. The current DeepSeek repository default branch is `master`, HEAD `76fda729799fe9b3848dbe2c211d4b231032b81e` at audit time. Whether the adapter should update any DeepSeek package versions is outside A01 and belongs to A08.

### Required provenance/sync table

| Local main | Local tree | Upstream adapter HEAD | Matching upstream baseline | Ahead/behind meaning | Recommended sync model |
|---|---|---|---|---|---|
| `70119cfdae992a203a5e29eb24e91c7200222a7c` | `489ec3e0c02a95acd99b554de9e6769c0523afd6` | `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` | `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` / tree `489ec3e0c02a95acd99b554de9e6769c0523afd6` | Numeric Git ahead/behind is **not meaningful** because local history is a separate root snapshot with no common ancestor. Content delta is **zero at audit time** because tree SHAs are identical. | Maintain an explicit upstream-baseline marker and perform future syncs as reviewed patch/vendor imports from the last matching Tencent commit to the new Tencent HEAD; do not use `--allow-unrelated-histories` as the routine sync mechanism and do not rewrite production `main`. |

No Tencent adapter commit newer than the matching baseline exists at audit time: the matching baseline is the current adapter HEAD itself. Therefore there is no upstream adapter delta to import in this audit.

## 5. Evidence inventory

| Evidence | Result | Status |
|---|---|---|
| `GET /repos/thanhhaixn92/PQG-Harness` | public repo, `fork:false`, default branch `main`, admin/push/pull permissions visible to connected account | CONFIRMED |
| `GET /repos/thanhhaixn92/PQG-Harness/branches/main` | HEAD `70119cf...`, tree `489ec3e0...`, `parents:[]`, `protected:false` | CONFIRMED |
| Local commit inventory | only `70119cf...` observed before A01 audit write | CONFIRMED |
| Pre-A01 branch inventory | `main` and `audit/a03-security-auth-trust`; both reported `protected:false` | CONFIRMED |
| `GET /repos/TencentEdgeOne/deepseek-harness` | public repo, `fork:false`, default branch `main` | CONFIRMED |
| Tencent `main` | HEAD `2110cc1...`, tree `489ec3e0...` | CONFIRMED |
| Tencent commit history | `ce79ad2...` → `27b3e509...` → `9cb0c13...` → `2110cc1...` | CONFIRMED |
| Tencent initial commit | `ce79ad2...`, `parents:[]`, tree `124e70c3...` | CONFIRMED |
| `deepseek-ai/deepseek-harness` | public repo, `fork:false`, default branch `master` | CONFIRMED |
| DeepSeek `master` | HEAD `76fda729799fe9b3848dbe2c211d4b231032b81e`, tree `70f782cd316210b7f64d76ff72494b7382508436` | CONFIRMED |
| `package.json` | package name `deepseek-harness`, version `0.1.0`, repository URL points to `TencentEdgeOne/deepseek-harness`, extensive `@deepseek-ai/*` dependencies | CONFIRMED |
| `README.md` | upstream-oriented title/description and explicit link to DeepSeek Harness; no local `PQG-Harness` identity in inspected content | CONFIRMED |
| Repository rulesets | `[]` | CONFIRMED |
| Detailed branch-protection endpoint | `403 Resource not accessible by integration` | NOT VERIFIED |
| Commit combined status at local base SHA | no statuses returned | CONFIRMED |
| Workflow runs associated with local base SHA | none returned | CONFIRMED |
| Issues before A01 write | `[]` | CONFIRMED |
| Pull requests before A01 write | `[]` | CONFIRMED |
| Releases before A01 write | `[]` | CONFIRMED |
| Tag inventory | tag collection could not be read with the available connector; `git/refs/tags` returned 404, but a full tag inventory is not asserted | NOT VERIFIED |

Canonical evidence URLs:
- Local main commit: `https://github.com/thanhhaixn92/PQG-Harness/commit/70119cfdae992a203a5e29eb24e91c7200222a7c`
- Tencent matching/current adapter commit: `https://github.com/TencentEdgeOne/deepseek-harness/commit/2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- Tencent initial root commit: `https://github.com/TencentEdgeOne/deepseek-harness/commit/ce79ad2fe3d997602c044f32e45eef14cc42d4ef`
- DeepSeek current default-branch commit: `https://github.com/deepseek-ai/deepseek-harness/commit/76fda729799fe9b3848dbe2c211d4b231032b81e`

## 6. Findings

### P0
No P0 findings.

### P1
#### A01-P1-01 — Production-linked `main` has no observable merge/deploy guardrails
- ID: `A01-P1-01`
- Severity: **P1 — High**
- Status: **CONFIRMED**
- Evidence:
  - `main` branch summary reports `protected:false` at exact base SHA `70119cf...`.
  - repository rulesets endpoint returns `[]`.
  - combined commit status for `70119cf...` returns no status contexts.
  - workflow-run query associated with `70119cf...` returns no runs.
  - repository metadata exposes direct push capability to the connected admin account.
  - production URL is supplied as `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`; exact deploy linkage is separately NOT VERIFIED in A01.
- Technical analysis: There is no observable repository-level rule preventing direct changes to `main`, requiring pull requests/reviews, or requiring CI/status checks before a commit becomes the canonical production branch. The detailed branch-protection endpoint itself is inaccessible to the GitHub App, but the branch summary independently reports that `main` is not protected and the ruleset collection is readable and empty.
- Impact: A mistaken or compromised direct push could move the canonical production branch without review or required validation. If production deployment follows `main`, this creates a material change-control and reliability risk.
- Recommendation: In the planning/remediation phase, establish a repository ruleset or branch protection for `main` requiring PR-based changes, at least one qualified review, required CI/status checks, and protection against force-push/deletion; constrain or document admin bypass. Align production deployment with reviewed immutable commit SHAs where supported.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A07** for production/deployment branch mapping and **A09** for required CI/status-check design. Security-sensitive reviewer/bypass policy can be coordinated with **A03**.

### P2
#### A01-P2-01 — Local repository is an unrelated root snapshot, so normal Git upstream ancestry is lost
- ID: `A01-P2-01`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - local repository metadata: `fork:false`.
  - local `main` commit `70119cf...` has `parents:[]`.
  - local tree is `489ec3e0...`.
  - Tencent current adapter commit `2110cc1...` has the same tree `489ec3e0...` but is a distinct commit in a separate history.
  - Tencent repository is also `fork:false`; its initial commit `ce79ad2...` has `parents:[]`.
- Technical analysis: Content provenance is recoverable today because the exact tree matches Tencent adapter HEAD, but Git ancestry was not preserved when PQG-Harness was created. Consequently standard `git merge-base`, ahead/behind counts, and normal upstream merge semantics cannot represent the relationship. A routine merge using unrelated histories would conflate histories and increase conflict/noise without restoring a clean fork model.
- Impact: Future upstream synchronization can become error-prone as soon as local changes diverge from Tencent. Operators may misread GitHub ahead/behind indicators or attempt unsafe unrelated-history merges.
- Recommendation: Treat Tencent as a **vendor/upstream content source**, not as a normal ancestor. Record the exact matching upstream commit/tree in a persistent provenance file. For each future upstream change, compute the delta from the last recorded Tencent baseline to the new Tencent HEAD, apply that patch on a dedicated sync branch, resolve local conflicts explicitly, test, and merge via PR. Preserve `main` history; do not rewrite production history merely to manufacture ancestry.
- Dependency/interaction with other audit domains: Upstream dependency/package consequences belong to **A08**; sync validation should use checks designed under **A09**.

#### A01-P2-02 — Repository identity/provenance metadata still identifies the Tencent template rather than the local canonical repository
- ID: `A01-P2-02`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - GitHub repository is named `PQG-Harness` under `thanhhaixn92`.
  - `package.json` has `"name": "deepseek-harness"` and `"repository.url": "git+https://github.com/TencentEdgeOne/deepseek-harness.git"`.
  - `README.md` begins `# DeepSeek Harness` and describes the upstream EdgeOne Makers template.
  - repository code search for `PQG-Harness` returned no matches at audit time.
- Technical analysis: The current tracked metadata makes the local repository look like the upstream template rather than a separately governed production repository derived from a known Tencent snapshot. This is not merely branding: tooling and operators can use `package.json.repository`, README, and provenance files to decide where issues, source-of-truth changes, and upstream syncs belong.
- Impact: Ownership and source-of-truth ambiguity can cause changes or bug reports to be directed to the wrong repository, obscure the exact upstream baseline, and make later forensic/audit work harder.
- Recommendation: In the documentation/governance remediation phase, add an explicit provenance/ownership marker stating the local canonical repository, Tencent adapter upstream URL, last imported upstream commit/tree, import date, and sync policy. Review whether `package.json.repository` should point to the local canonical repository while preserving the upstream attribution separately. Do not remove required upstream license/attribution.
- Dependency/interaction with other audit domains: Licensing/attribution details should be coordinated with **A11**. Dependency lineage remains an **A08** concern.

### P3
No P3 findings requiring a separate finding. Release/tag hygiene is captured under gaps because tag inventory could not be fully verified.

## 7. What is already good / should be preserved
- The exact local baseline is stable and unambiguous: `70119cfdae992a203a5e29eb24e91c7200222a7c`.
- Git object evidence gives a strong provenance anchor: local tree `489ec3e0...` exactly equals Tencent adapter HEAD tree `489ec3e0...`.
- Because the matching upstream baseline is the current Tencent adapter HEAD, there is no unreviewed Tencent content delta to import at audit time.
- The repository retains the MIT license file from the Tencent template; any future provenance cleanup should preserve required license notices and attribution subject to A11 review.
- The existing branch naming convention `audit/aXX-...` is clear and supports audit isolation.

## 8. Gaps and NOT VERIFIED items
1. **Detailed branch-protection settings — NOT VERIFIED.** `GET /branches/main/protection` returned `403 Resource not accessible by integration`. The repository is public and the connected user has admin rights, so this result is best attributed to GitHub App/integration permission scope. GitHub account/plan limitations were not independently queried and must not be inferred. The branch summary nevertheless confirms `protected:false`, and the rulesets endpoint is readable and empty.
2. **Complete tag inventory — NOT VERIFIED.** The available connector rejected the normal tags collection endpoint; `git/refs/tags` returned 404. This audit therefore does not assert a confirmed zero-tag count.
3. **Production deployment mapping — NOT VERIFIED.** The production URL and premise that `main` is production-linked are supplied by the audit prompt. A01 did not inspect EdgeOne deployment configuration or deployment history; A07 should verify exact commit-to-production linkage.
4. **Shell-level common-ancestor commands — NOT VERIFIED in the temporary shell.** Network DNS prevented `git ls-remote`/clone. The common-history conclusion is instead based on direct API evidence (`fork:false`, root commit parents, and object identities).
5. **Current DeepSeek package compatibility — NOT VERIFIED in A01.** The official DeepSeek repository is newer than the Tencent adapter creation date, but package upgrade relevance requires dependency/API analysis by A08.

## 9. Recommended next actions — audit recommendation only
1. Prioritize `A01-P1-01`: design and enable guarded changes to `main` before broader public/stable use.
2. Establish a persistent provenance record such as `UPSTREAM.md` (name subject to planning) containing:
   - local canonical repository;
   - Tencent upstream repository;
   - last imported upstream commit `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`;
   - matching tree `489ec3e0c02a95acd99b554de9e6769c0523afd6`;
   - import/sync procedure;
   - attribution/licensing notes.
3. Adopt a reviewed vendor-patch sync workflow for future Tencent updates. The current sync baseline is exact and should be recorded before local divergence grows.
4. Define release/version governance after tag inventory can be independently confirmed: semantic version intent, release tags, release notes, and production commit markers.
5. Coordinate A07/A09 before enforcing required checks so branch governance matches the actual deployment and CI architecture.

## 10. Handoff to planning phase
Planning should treat A01 as a governance/provenance hardening input, not a request to rewrite history.

Recommended planning decisions:
- Choose the exact `main` ruleset/protection requirements and bypass policy.
- Decide whether production deploys remain branch-following or become commit/release-driven.
- Adopt the vendor-patch upstream sync model anchored at Tencent commit `2110cc1...` / tree `489ec3e0...`.
- Add explicit local ownership/provenance documentation without losing Tencent/DeepSeek attribution.
- Define version/release markers once tag state is independently verified.

Cross-audit handoffs:
- **A03** — reviewer/admin bypass and trust-policy considerations.
- **A07** — verify production URL ↔ branch/commit/deploy linkage.
- **A08** — assess `@deepseek-ai/*` package/version drift and compatibility; do not infer upgrades from A01.
- **A09** — define CI checks that should become required on `main`.
- **A11** — licensing, attribution, ownership, and documentation governance.

## 11. Appendix

### A. Exact identifiers
- Local canonical `main`: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Local canonical tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`
- Tencent adapter HEAD: `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- Tencent adapter HEAD tree: `489ec3e0c02a95acd99b554de9e6769c0523afd6`
- Tencent initial root: `ce79ad2fe3d997602c044f32e45eef14cc42d4ef`
- Tencent initial tree: `124e70c34b86cca71986e1a28b08dc0c8dd16c3d`
- DeepSeek default branch: `master`
- DeepSeek HEAD: `76fda729799fe9b3848dbe2c211d4b231032b81e`
- DeepSeek HEAD tree: `70f782cd316210b7f64d76ff72494b7382508436`

### B. Upstream adapter commit sequence observed
1. `ce79ad2fe3d997602c044f32e45eef14cc42d4ef` — `Initial commit: EdgeOne Makers DeepSeek Harness template`
2. `27b3e509aebd9944195843560b090185b62cd038` — `docs: refresh the Makers contact dialog copy`
3. `9cb0c13c7ef8a41c9a8f5b5a0c35ad5aa25f6289` — `fix: default UI locale from hostname and keep only Makers models`
4. `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` — `feat: keep all Makers tools visible and ask before restricted calls`

### C. Severity summary
- P0: **0**
- P1: **1**
- P2: **2**
- P3: **0**

### D. Audit-only mutation policy
This A01 activity is documentation-only. The only intended repository mutation is this report on branch `audit/a01-baseline-upstream-governance`, followed by a docs-only PR to `main`. No merge is part of the audit.