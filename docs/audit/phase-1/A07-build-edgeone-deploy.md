# A07 — Build, EdgeOne deployment, preview/production workflow & quotas

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Baseline comparison: matches the prompt's expected baseline exactly; no baseline drift detected at audit start.
- Audit date/time: 2026-09-04 16:55 ICT (UTC+07:00)
- Auditor/subagent: A07
- Verdict: **PARTIAL**
- Finding count: **P0=0, P1=1, P2=6, P3=0**
- Audit mode: AUDIT-ONLY / DOCUMENTATION-ONLY; no runtime/source/config/dependency/deployment changes made.

## 2. Scope
This audit covers the build and EdgeOne Makers deployment domain requested by A07:

- `edgeone.json` build/runtime settings;
- `package.json` scripts and Node engine;
- installation and build commands;
- generated frontend and generated Agent API routes;
- Linux/native optional dependencies;
- runtime packaging, prune and cleanup scripts;
- output directory;
- Agent and Sandbox timeouts;
- Git-connected Auto Deploy model;
- Production vs Preview branch workflow;
- known production URL;
- GitHub Actions presence/absence and risk of duplicate deployment responsibility;
- rollback/redeploy behavior;
- current EdgeOne Makers Free Edition quotas and constraints;
- custom-domain readiness;
- operational dependence on environment variables.

Out of scope: implementing fixes, changing EdgeOne Console settings, adding CI/CD, changing dependencies, changing secrets/environment variables, changing deployment configuration, triggering deployments, or merging the audit PR.

## 3. Method
1. Verified canonical `main` directly through GitHub and recorded exact SHA `70119cfdae992a203a5e29eb24e91c7200222a7c` before analysis.
2. Read repository configuration and build scripts at the exact base SHA, including:
   - `edgeone.json`
   - `package.json`
   - `package-lock.json`
   - `.env.example`
   - `.gitignore`
   - `README.md`
   - `scripts/prepare-dsh-web.mjs`
   - `scripts/generate-dsh-api-routes.mjs`
   - `scripts/restore-host-frontend-natives.mjs`
   - `scripts/prune-agent-dependencies.mjs`
   - `scripts/clean-agent-node.mjs`
   - generated `index.html` and `agents/api/*` inventory.
3. Queried repository `.github` at the exact base SHA; GitHub returned `404 Not Found`, confirming no repository-level `.github` directory and therefore no GitHub Actions workflow at this baseline.
4. Reviewed current official EdgeOne Makers documentation, prioritizing first-party sources only, including Build Guide, `edgeone.json`, Deployment Overview, Create Deploys, Manage Deploys, Project Management, Agents, Limits and Quotas, and GitHub Actions integration documentation.
5. Attempted a black-box request to the known production URL from the available execution environment. DNS resolution was unavailable in that environment, so production health remains `NOT VERIFIED`; no deployment was altered.
6. No secret values were read, printed, written, or copied into this report.

## 4. Architecture / current-state summary

### 4.1 Repository-controlled build configuration
`edgeone.json` explicitly sets:

- `installCommand`: `npm ci`
- `buildCommand`: `npm run build:makers`
- `outputDirectory`: `dist`
- `nodeVersion`: `24`
- `agents.framework`: `openai-sdk`
- `agents.timeout`: `300`
- `agents.sandbox.timeout`: `300`
- a long `agents.externalNodeModules` allow-list for DeepSeek Harness runtime dependencies and `zod`.

The project declares `engines.node` as `^22.19 || >=24`, so Node 24 is compatible with the package engine constraint.

### 4.2 Actual build chain
The effective build chain is:

1. EdgeOne installation phase: `npm ci`.
2. `npm run build:makers`.
3. `npm run build`:
   - `npm run prepare:dsh-web`
     - copies the published `@deepseek-ai/dsh-web-frontend/dist` into `public/`;
     - patches selected published bundles using exact string match points;
     - generates boot metadata;
     - rewrites both root `index.html` and `public/index.html`;
     - runs `scripts/generate-dsh-api-routes.mjs`, which generates the DSH Host API proxy route files under `agents/api/`.
   - `vite build`, producing the static web output in `dist/`.
4. `npm run prepare:makers-runtime`:
   - runs a second clean dependency installation: `npm ci --ignore-scripts --os=linux --cpu=x64 --include=optional`;
   - runs `scripts/restore-host-frontend-natives.mjs`;
   - asserts Linux Sharp/libvips/Koffi native packages are present.
5. `scripts/prune-agent-dependencies.mjs`:
   - patches `@deepseek-ai/dsh-subprocess-local/lib/index.js` so `node-pty` is lazily imported;
   - removes Windows-only `node-pty` artifacts;
   - removes dependency source maps.
6. `scripts/clean-agent-node.mjs` removes `.edgeone/agent-node` and stale `.edgeone/agent-node.stale-*` directories if present.

### 4.3 Mandatory vs housekeeping classification
Based on direct code behavior at this SHA:

**Build/runtime-semantic steps — treat as mandatory unless later proven equivalent without them:**

- first `npm ci` installation phase;
- `prepare:dsh-web` and generated API-route generation;
- `vite build`;
- Linux-targeted dependency preparation and native-package assertions;
- the `node-pty` lazy-import patch in `prune-agent-dependencies.mjs`, because it changes runtime loading behavior rather than merely deleting files.

**Packaging/housekeeping behavior — not evidence for deletion:**

- removal of Windows-only `node-pty` files;
- removal of dependency source maps;
- deletion of `.edgeone/agent-node` and `.edgeone/agent-node.stale-*`.

These cleanup steps can reduce stale/output baggage, but this audit does **not** recommend removing any of them because no equivalence test or EdgeOne build-log evidence was available.

### 4.4 Output model
`outputDirectory: dist` is consistent with Vite's default production output. The project also contains `agents/`, which EdgeOne Makers treats as an Agent runtime source directory independent of the static frontend output. This matches official Makers examples where static `dist` output and `agents/` coexist in one project.

### 4.5 Deployment model
Official EdgeOne Makers documentation currently defines two system environments:

- **Production** — associated with the production branch, typically `main`;
- **Preview** — for non-production Git branches and pre-production validation.

The requested flow `feature/* -> Preview -> main -> Production` is therefore platform-compatible. However, actual associated branches and Auto Deploy switches are EdgeOne Console state and are not represented in this repository; the current project mapping is `NOT VERIFIED`.

### 4.6 Current Free Edition constraints relevant to this repository
According to current official EdgeOne Makers Limits and Quotas documentation at audit time:

| Category | Current Free Edition limit |
|---|---:|
| Projects | 40 |
| Builds | 500/month |
| Concurrent builds | 1 |
| Build timeout | 20 minutes per build |
| Build compute | 4 cores / 6 GB |
| Maximum file size | 25 MB |
| Files per project | 20,000 |
| Total project storage | 5 GB per site |
| Custom domains | 200 |
| Free SSL certificate | Supported |
| Agent executions | 200,000/month |
| Agent total memory time | 100,000 GB-s/month |
| Agent max runtime/request | 3,600 s |
| Agent max idle session | 300 s |
| Agent max concurrent running sessions | 40 |
| Sandbox total memory time | 100,000 GB-s/month |
| Sandbox max concurrent running sessions | 20 |
| Sandbox max runtime/instance | 3,600 s |
| Sandbox default timeout | 300 s |
| Built-in model free quota | 500,000 tokens/month |

The same official quota page documents `agents.timeout` as 30–1800 seconds and `agents.sandbox.timeout` as 300–3600 seconds, while the official `edgeone.json`/Agent quick-start pages currently describe `agents.timeout` up to 3600 seconds. This first-party documentation is inconsistent on the upper Agent timeout bound. The repository's value of `300` seconds is within **all** documented ranges, so the discrepancy does not affect the current configuration.

## 5. Evidence inventory

### Repository evidence pinned to base SHA
- Canonical branch SHA: `main -> 70119cfdae992a203a5e29eb24e91c7200222a7c`.
- `edgeone.json`: explicit install/build/output/Node/Agent/Sandbox configuration.
- `package.json`: Node engine and scripts `prepare:makers-runtime`, `prepare:dsh-web`, `build`, `build:makers`, `test`, `typecheck`.
- `package-lock.json`: lockfile v3; deterministic dependency graph for `npm ci` at this SHA.
- `.env.example`: `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`, `AI_GATEWAY_MODEL` placeholders, with no secret values committed.
- `.gitignore`: excludes `node_modules`, `dist`, `.edgeone`, `.env`, logs and generated archive.
- `README.md`: declares `AI_GATEWAY_API_KEY` and `AI_GATEWAY_BASE_URL` required for the documented model-gateway configuration and describes local development.
- `scripts/prepare-dsh-web.mjs`: exact-match patching of published frontend bundles; copies frontend distribution; writes root/public `index.html`; fails loudly when expected patch points change.
- `scripts/generate-dsh-api-routes.mjs`: deterministic list of DSH API method route proxies generated under `agents/api/`.
- `scripts/restore-host-frontend-natives.mjs`: reads exact package versions from `package-lock.json`, restores missing host-native packages through `npm pack`, and asserts Linux runtime native packages.
- `scripts/prune-agent-dependencies.mjs`: lazifies `node-pty`, removes Windows-only files and source maps, and throws if expected upstream source patch points no longer match.
- `scripts/clean-agent-node.mjs`: removes only `.edgeone/agent-node` and stale siblings.
- `.github`: absent at this SHA (`404 Not Found`).
- Known production URL supplied to the audit: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`.

### Official EdgeOne sources reviewed
- Build Guide: https://pages.edgeone.ai/document/build-guide
- `edgeone.json`: https://pages.edgeone.ai/document/edgeone-json
- Limits and Quotas: https://pages.edgeone.ai/document/limits-and-quotas
- Deployment Overview: https://pages.edgeone.ai/document/deployment-overview
- Create Deploys: https://pages.edgeone.ai/document/create-deploys
- Manage Deploys: https://pages.edgeone.ai/document/manage-deploys
- Project Management: https://pages.edgeone.ai/document/project-management
- Import Git Repository: https://pages.edgeone.ai/document/importing-a-git-repository
- Agents: https://pages.edgeone.ai/document/agents
- Agents Quick Start: https://pages.edgeone.ai/document/agents-quick-start
- Conversation Management: https://pages.edgeone.ai/document/agents-conversation-storage
- GitHub Actions integration: https://pages.edgeone.ai/document/using-github-actions

## 6. Findings

### P0
No P0 finding confirmed.

### P1

#### A07-F01 — Production/Preview branch association and Auto Deploy state are not auditable from the repository
- ID: A07-F01
- Severity: P1
- Status: **NOT VERIFIED**
- Evidence:
  - Repository has `main` and audit branches, but no file records the Makers environment-to-branch associations or Auto Deploy switches.
  - Official Build Guide and Project Management docs state Production and Preview environments, branch associations, domains, Auto Deploy, and environment variables are managed in Makers Project Settings / Environment Management.
  - Current official documentation supports Production from the production branch and Preview for non-production branches, but current project Console state was not accessible in this audit.
- Technical analysis:
  - The desired `feature/* -> Preview -> main -> Production` workflow is compatible with the platform.
  - Correctness depends on the Console mapping actually being `main -> Production` and non-production branches -> Preview, with Auto Deploy enabled/disabled intentionally.
  - Because these controls are outside Git, repository review alone cannot prove that a feature/audit branch will not become Production or that Preview is generated as expected.
- Impact:
  - A mis-associated branch or unintended Auto Deploy setting can bypass the intended promotion flow, fail to create previews, or deploy an unintended branch to the live environment.
- Recommendation:
  - Before stable/public use, record Console evidence showing: Production associated branch, Preview behavior, Auto Deploy state for both environments, and domains bound to each environment.
  - For the intended workflow, verify one disposable `feature/*` branch produces Preview only, then verify merge to `main` creates Production.
  - Do not add a second deploy mechanism merely to compensate for unverified Console state; first establish the existing source of deployment truth.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A01 for branch governance/protection and to A09 for non-deploying quality gates.

### P2

#### A07-F02 — `nodeVersion: "24"` is a floating major rather than an exact documented pre-installed version
- ID: A07-F02
- Severity: P2
- Status: **INFERRED**
- Evidence:
  - `edgeone.json`: `"nodeVersion": "24"`.
  - `package.json`: `engines.node = "^22.19 || >=24"`.
  - Current official Build Guide lists exact pre-installed Node versions including `24.5.0`, `24.11.0`, and `24.18.0`.
  - Official `edgeone.json` documentation recommends selecting a pre-installed version and warns that other values may cause deployment failure; its example uses an exact version.
- Technical analysis:
  - The package engine permits Node 24, so there is no package-engine conflict.
  - The reproducibility concern is platform resolution: a major-only value can potentially resolve differently as the platform changes, while an exact pre-installed version defines the build runtime unambiguously.
  - Current first-party documentation itself has evolved over time regarding supported Node versions, reinforcing the value of explicit pinning after validation.
- Impact:
  - Future redeploys of the same commit can become more dependent on platform version-resolution behavior, weakening deterministic rollback/rebuild guarantees.
- Recommendation:
  - In the planning/fix phase, verify the currently successful EdgeOne Node 24 version in build logs/Console, then pin an exact documented pre-installed version compatible with `package.json` engines.
  - No Node change is made in this audit.
- Dependency/interaction with other audit domains:
  - Coordinate with A08 for dependency/native compatibility before changing the runtime version.

#### A07-F03 — The build performs two clean npm installations, increasing build-time and registry-failure exposure under a single-build Free Edition limit
- ID: A07-F03
- Severity: P2
- Status: **INFERRED**
- Evidence:
  - `edgeone.json` install phase: `npm ci`.
  - `package.json` `build:makers` runs `prepare:makers-runtime` after the Vite build.
  - `prepare:makers-runtime` runs another `npm ci --ignore-scripts --os=linux --cpu=x64 --include=optional`.
  - Official Free Edition limits: 1 concurrent build, 20-minute build timeout, 500 builds/month, 4 cores/6 GB.
  - EdgeOne build logs/timing for this project were not accessible.
- Technical analysis:
  - The second install is purposeful: it forces a Linux x64 optional-dependency tree for Agent packaging after the frontend has already been built and then checks/restores native packages.
  - It should therefore not be treated as redundant housekeeping without evidence.
  - Nevertheless, two clean installs increase network/registry operations and total build work, making transient registry issues and timeout margin more operationally relevant.
- Impact:
  - Longer or more failure-prone builds; one concurrent build can serialize Preview/Production activity; repeated retries consume the monthly build quota.
- Recommendation:
  - Preserve the current second-install step until an equivalent packaging path is proven.
  - Capture actual EdgeOne phase timing from build logs and set an operational threshold for warning when total build time approaches the 20-minute limit.
  - Any future optimization should demonstrate identical Linux native/runtime artifacts before removal or consolidation.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A08 for native/optional dependency behavior and A09 for build observability.

#### A07-F04 — Runtime packaging depends on exact source-text patches of published third-party bundles
- ID: A07-F04
- Severity: P2
- Status: **INFERRED**
- Evidence:
  - `scripts/prepare-dsh-web.mjs` uses `mustReplace(...)` and explicit expected string fragments for multiple published DSH frontend bundles; it throws if patch points no longer match.
  - `scripts/prune-agent-dependencies.mjs` patches `@deepseek-ai/dsh-subprocess-local/lib/index.js` to lazy-import `node-pty` and throws if the expected import/method structure is not found.
  - `package-lock.json` pins the installed dependency graph used by `npm ci`.
- Technical analysis:
  - At the current lockfile, this approach is reasonably reproducible because the patched package bytes are tied to the lockfile.
  - The design is intentionally fail-fast, which is preferable to silently shipping an incompatible patch.
  - The failure point appears when dependency versions are upgraded or lockfile contents change: published bundle formatting or source structure can change even when functional intent is similar.
- Impact:
  - Dependency upgrades can turn into deployment/build failures until patch points are reviewed and revalidated; the runtime `node-pty` patch is semantically important, not merely cosmetic.
- Recommendation:
  - Treat these patches as explicit compatibility contracts in the planning phase.
  - Require upgrade-time validation of every patch point plus generated frontend/route smoke tests before accepting dependency changes.
  - Do not remove the patches as “cleanup” without runtime equivalence evidence.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A08 (dependency/supply-chain compatibility) and A09 (tests for generated/packaged outputs).

#### A07-F05 — Production and Preview environment-variable readiness is operationally critical but not verified
- ID: A07-F05
- Severity: P2
- Status: **NOT VERIFIED**
- Evidence:
  - `.env.example` declares `AI_GATEWAY_API_KEY`, `AI_GATEWAY_BASE_URL`, and `AI_GATEWAY_MODEL` placeholders.
  - `README.md` documents `AI_GATEWAY_API_KEY` and `AI_GATEWAY_BASE_URL` as required for the documented gateway path, with `AI_GATEWAY_MODEL` optional.
  - Official Build Guide states environment variables are scoped/configured by environment and changes apply only to new deployments, not already-created deployments.
  - Current Console variables were not accessible; no secret values were inspected.
- Technical analysis:
  - A build can succeed while model calls later fail if required runtime configuration is missing or scoped only to one environment.
  - Preview and Production can therefore differ operationally even at identical source SHA.
  - Makers Agent templates may inject model-gateway variables automatically in some template flows, but this audit cannot confirm whether that injection is active for this project's current Production and Preview environments.
- Impact:
  - Preview may pass while Production fails model access, or vice versa; environment-variable changes require a new deployment to take effect.
- Recommendation:
  - Verify variable **presence and scope only** in EdgeOne Console for both Preview and Production; do not expose values in audit artifacts.
  - Record which variables are platform-injected versus operator-managed.
  - After any environment-variable change, require a new deployment plus a minimal model-call smoke check.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A05 for AI Gateway/model behavior and A03 for secret-management/trust handling.

#### A07-F06 — Custom-domain readiness and current production URL health are not verified
- ID: A07-F06
- Severity: P2
- Status: **NOT VERIFIED**
- Evidence:
  - Known production URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`.
  - Repository contains no domain configuration that proves a custom domain is bound.
  - Official Free Edition limits currently support up to 200 custom domains and free SSL certificates.
  - Official Manage Deploys/FAQ guidance recommends a custom domain for long-term professional/reliable access.
  - Black-box request from the available audit execution environment could not resolve the hostname, so live HTTP status/UI load could not be independently checked.
- Technical analysis:
  - The EdgeOne-generated domain may be sufficient for technical preview/use, but stable public branding and DNS ownership require Console/DNS state outside the repository.
  - Failure to black-box the URL in this audit is a tooling/network limitation, not evidence that the site is down.
- Impact:
  - Public readiness, DNS ownership, certificate state, and live availability remain unknown.
- Recommendation:
  - Verify the known production URL from an external network and capture HTTP/UI smoke evidence.
  - If stable/public use is intended, verify a custom domain, DNS ownership, SSL issuance/renewal, and Production binding in Console.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A12 for production black-box smoke coverage.

#### A07-F07 — Rollback is constrained by EdgeOne deployment artifact retention and redeploy semantics
- ID: A07-F07
- Severity: P2
- Status: **CONFIRMED**
- Evidence:
  - Official Deployment Overview and Manage Deploys documentation state that when successful deployment records exceed three, Makers retains build artifacts for the three most recent successful deployments; older deployment artifacts become expired and return 401 when accessed.
  - Official docs state a specific deployment record can be redeployed to create a new deployment with the same configuration.
  - Free Edition build quota is 500/month with one concurrent build.
- Technical analysis:
  - This is not an unlimited immutable-artifact rollback store.
  - Recent deployments have a short retained-artifact window; older recovery requires a redeploy/rebuild operation, which consumes build capacity and is more dependent on deterministic build inputs/runtime selection.
  - The current lockfile and `npm ci` improve source dependency reproducibility, but F02's floating Node major and F05's environment-scoped runtime configuration still matter to operational rollback confidence.
- Impact:
  - Incident recovery from versions older than the latest three successful deployments can be slower and less deterministic than a direct artifact promotion model.
- Recommendation:
  - Define a release/rollback runbook that distinguishes: recent retained deployment recovery, specific-record redeploy, and source-SHA rebuild.
  - Before stable release, test rollback/redeploy behavior in Preview and document which configuration/environment-variable snapshot is used by a redeploy in the current Console implementation.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A11 for operational governance/runbook documentation.

### P3
No P3 finding confirmed.

## 7. What is already good / should be preserved
1. **Canonical install is lockfile-driven.** `npm ci` plus `package-lock.json` v3 is the correct baseline for deterministic dependency installation.
2. **Build configuration is explicit.** Install command, build command, output directory, Node major, Agent runtime timeout and Sandbox timeout are committed in `edgeone.json` rather than being wholly implicit in Console defaults.
3. **Current timeout values are conservative and valid.** `agents.timeout=300` and `sandbox.timeout=300` fit all currently documented first-party ranges and match the Sandbox default.
4. **Generated frontend preparation fails loudly.** `prepare-dsh-web.mjs` validates expected bundle patch points and refuses to continue on unrecognized upstream output instead of silently generating a potentially incompatible frontend.
5. **Generated Host API routes are deterministic.** `generate-dsh-api-routes.mjs` contains an explicit method inventory and emits uniform proxy files.
6. **Linux runtime natives are intentionally handled.** The build explicitly targets Linux x64 optional dependencies and asserts Sharp/libvips/Koffi package presence.
7. **The runtime `node-pty` compatibility modification is guarded.** The prune script verifies the exact upstream structure before applying the lazy import.
8. **Build artifacts and local/runtime state are ignored.** `.gitignore` excludes `dist`, `.edgeone`, `node_modules`, `.env` and logs.
9. **Environment template does not contain secret values.** `.env.example` uses empty placeholders.
10. **No GitHub Actions deployment pipeline is present.** This is desirable if EdgeOne Git Auto Deploy is the intended deployment owner. Adding GitHub Actions deployment while keeping EdgeOne Auto Deploy enabled would create duplicate deployment responsibility, extra builds/quota consumption and possible race/confusion over which pipeline owns Production.
11. **The requested promotion model is compatible with EdgeOne.** `feature/* -> Preview -> main -> Production` aligns with the official Production/Preview environment design, subject to Console verification in F01.

## 8. Gaps and NOT VERIFIED items
The following items could not be verified without EdgeOne Console access or external production-network access:

1. Actual Production associated branch.
2. Actual Preview branch behavior/association.
3. Production Auto Deploy enabled/disabled state.
4. Preview Auto Deploy enabled/disabled state.
5. Whether this audit branch itself triggers an automatic Preview deployment after push.
6. Current EdgeOne build duration, phase timing, cache use and headroom against the 20-minute timeout.
7. Current build logs for `npm ci`, Linux native restoration, prune and Agent packaging.
8. Current Production and Preview environment-variable presence/scope; secret values were intentionally not inspected.
9. Whether Makers automatically injects the model-gateway variables for this instantiated project.
10. Current live HTTP status, UI load, Agent endpoint health, and production response behavior at `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`.
11. Whether a custom domain is bound, its DNS ownership state, certificate status, HTTPS enforcement and which environment it targets.
12. Current deployment history and exact Production deployment SHA.
13. Practical redeploy behavior for an older deployment under the current project settings, including which environment-variable/configuration snapshot is reused.
14. Current Free Edition usage consumption versus quota (build count, Agent/Sandbox memory time, model tokens, storage).

## 9. Recommended next actions — audit recommendation only
1. **Capture EdgeOne Console release topology evidence first:** Production branch, Preview behavior, Auto Deploy state, environment domains and build settings.
2. **Validate the intended promotion path:** create/update a disposable `feature/*` branch, confirm Preview only, then merge to `main` and confirm Production only. Do this in the controlled planning/execution phase, not as part of this audit.
3. **Capture one successful build log with phase durations** and specifically measure both `npm ci` phases, Vite build, native preparation and packaging cleanup.
4. **Resolve Node runtime ambiguity:** after confirming the actually used successful Node 24 version, plan an exact version pin compatible with dependency/native requirements.
5. **Keep current packaging steps until proven unnecessary.** Do not remove Linux-native preparation, source patches, pruning or `.edgeone` cleanup solely because they appear unusual.
6. **Establish a single deployment owner.** If EdgeOne Git Auto Deploy is retained, use GitHub CI only for non-deploying checks unless a deliberate migration disables EdgeOne Auto Deploy first. Do not run two autonomous Production deployers.
7. **Verify environment-variable scope without exposing values** and smoke-test a model call after any variable change/redeployment.
8. **Create an operational rollback/redeploy runbook** reflecting the three-successful-deployment artifact retention behavior and the need to rebuild/redeploy older versions.
9. **Verify custom-domain and live Production readiness** before stable/public use.
10. **Track Free Edition quotas operationally, especially builds:** 500/month, one concurrent build and 20-minute timeout are directly relevant to Preview-heavy development and redeploy-based rollback.

## 10. Handoff to planning phase
Planning should preserve the current working build semantics and address risks in this order:

1. Confirm Console release topology and environment-variable scoping.
2. Obtain production/preview smoke evidence and a successful build-log baseline.
3. Decide an exact supported Node version only after confirming native/runtime compatibility.
4. Define the single authoritative deploy mechanism and keep any GitHub CI non-deploying unless EdgeOne Auto Deploy is intentionally replaced.
5. Formalize dependency-upgrade validation for the source-text frontend/runtime patches.
6. Formalize rollback/redeploy and custom-domain operations.

**Cross-audit handoffs:**
- A01: branch protection and merge governance for `main`.
- A03: secret/environment-variable governance.
- A05: Makers AI Gateway/model variable expectations and runtime validation.
- A08: native/optional dependency and third-party patch compatibility.
- A09: build/test quality gates and observability; avoid creating a duplicate deployment pipeline by default.
- A11: release/rollback operational documentation.
- A12: independent black-box Production smoke verification.

## 11. Appendix

### 11.1 Recommended deployment responsibility model
Subject to Console verification, the preferred responsibility split is:

```text
feature/* push
  -> EdgeOne Preview Auto Deploy
  -> review / smoke / functional checks
  -> PR merge to main
  -> EdgeOne Production Auto Deploy
  -> production smoke
```

If GitHub Actions is introduced, its safest default role is **validation only** (tests/typecheck/audit checks), not a second autonomous deployment path. If a CLI-based GitHub Actions deploy becomes a deliberate future choice, disable/replace EdgeOne Git Auto Deploy first and document the migration so one system owns Production.

### 11.2 Build failure points to monitor
- package-registry/network failure during either `npm ci`;
- unsupported/changed Node version resolution;
- upstream DSH frontend bundle patch-point drift;
- generated plugin roster falling below the script's expected minimum;
- generated DSH API route changes;
- missing Linux Sharp/libvips/Koffi packages;
- missing host-native packages that force `npm pack` restoration;
- `@deepseek-ai/dsh-subprocess-local` source drift that breaks the `node-pty` patch;
- EdgeOne Free build timeout / serialized one-build concurrency;
- missing or incorrectly scoped runtime environment variables.

### 11.3 Final audit statement
At exact base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`, the repository-controlled build path is explicit, lockfile-based, defensive and intentionally handles generated DSH frontend/routes plus Linux native runtime packaging. No evidence supports deleting any existing build/prune/cleanup step during this audit. The repository also does not contain a second GitHub Actions deployment pipeline.

The audit remains **PARTIAL** because the decisive Production/Preview/Auto Deploy mapping, environment-variable scope, deployment history, custom-domain state and current live Production health are Console/network facts that were not available for direct verification.
