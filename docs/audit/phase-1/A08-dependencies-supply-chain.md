# A08 — Dependencies, lockfile, supply chain & upstream compatibility

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Audit date/time: `2026-09-04 17:02 ICT (UTC+07:00)`
- Auditor/subagent: `A08`
- Verdict: **PASS WITH RISKS**

## 2. Scope
Audit-only / documentation-only review of dependency and supply-chain posture at the exact base SHA above. Scope included:

- `package.json` and `package-lock.json`;
- direct/transitive version posture and semver intent;
- `@deepseek-ai/dsh-*` release-wave consistency;
- `@modelcontextprotocol/sdk`, `ws`, `zod`, OpenTelemetry packages;
- native optional dependencies and runtime-native restoration;
- Node/Vite/TypeScript version posture;
- current published DSH versions and current upstream adapter/core commits;
- freshness versus compatibility risk;
- generated/compiled patch coupling, especially `scripts/prepare-dsh-web.mjs`;
- install-script and native-binary supply-chain signals;
- license/notice/SBOM signals;
- dependency update strategy.

No source, dependency, lockfile, generated asset, test, CI/CD, EdgeOne configuration, runtime configuration, release, tag, deployment, or `main` branch content was modified.

## 3. Method
1. Verified the canonical `main` branch head before auditing. The observed head is exactly `70119cfdae992a203a5e29eb24e91c7200222a7c`, matching the baseline anticipated by the audit prompt.
2. Reviewed first-party dependency manifests and build/runtime scripts at that SHA via GitHub content APIs.
3. Inspected lockfile entries for concrete versions, registry URLs, integrity fields, native platform constraints, and selected transitive packages.
4. Compared the project tree against the current `TencentEdgeOne/deepseek-harness` adapter branch and checked the current `deepseek-ai/deepseek-harness` canonical upstream branch.
5. Checked current npm package pages for selected high-impact dependencies and DSH packages, and checked GitHub upstream security advisories/releases for selected security-sensitive packages.
6. Searched first-party repository code for direct `ws` usage to assess reachability. No first-party `WebSocketServer` / `from 'ws'` import was found by repository code search; this does **not** prove the dependency is unreachable through DSH or dynamic/transitive paths.
7. No `npm audit fix`, dependency update, package install, lockfile regeneration, source formatter, or runtime mutation was performed. A full registry-backed vulnerability scanner was not run; this is explicitly listed as NOT VERIFIED.

## 4. Architecture / current-state summary
The project is a Node/Vite web harness whose manifest identifies `TencentEdgeOne/deepseek-harness` as its repository source. Production build preparation is more than a conventional `npm ci`:

- `npm run prepare:dsh-web` copies published `@deepseek-ai/*` browser client bundles into `public/plugins/...` and applies project-specific compatibility patches to compiled `lib/client.js` files before Vite builds the frontend.
- `scripts/prepare-dsh-web.mjs` is therefore a **compatibility layer over published DSH package artifacts**, not merely a static asset copier.
- `npm run build:makers` subsequently runs a Linux/x64-focused `npm ci --ignore-scripts --os=linux --cpu=x64 --include=optional`, restores host-native packages when needed, prunes dependency content, and cleans an EdgeOne agent-node directory.
- `scripts/restore-host-frontend-natives.mjs` restores missing host-native Rollup/esbuild/Koffi packages using exact versions read from `package-lock.json`, while asserting Linux Sharp/libvips/Koffi runtime packages exist.
- `scripts/prune-agent-dependencies.mjs` contains an additional exact-string compatibility patch that converts an eager `node-pty` import in `@deepseek-ai/dsh-subprocess-local` to a lazy import before pruning Windows-only binaries/source maps.

The dependency graph is reproducibly locked under `npm ci`, but the manifest expresses a mixture of exact and caret ranges. This matters most for DSH because the current compatibility layer patches implementation text from specific published package builds.

A strong current-state signal is that the project base commit has tree SHA `489ec3e0c02a95acd99b554de9e6769c0523afd6`, and the current `TencentEdgeOne/deepseek-harness` `main` commit `2110cc1bb5f6d5436593927fa6a4fa46e6f16407` points to the **same tree SHA**. Therefore the audited project content is content-identical to the current adapter `main` at audit time, despite different commit SHAs/history.

The canonical DeepSeek upstream has moved further: `deepseek-ai/deepseek-harness` default branch `master` was observed at `76fda729799fe9b3848dbe2c211d4b231032b81e` (2026-09-03), with the merge message referencing the `0.1.2-rc.1` release wave. The published `@deepseek-ai/dsh` package was also observed at `0.1.2-rc.1` on npm, whereas the audited lockfile resolves the project DSH family predominantly to `0.1.0-rc.6`.

## 5. Evidence inventory

| Evidence | Confirmed observation |
|---|---|
| `package.json` | Node engine `^22.19 || >=24`; mixed exact/caret dependency ranges; build scripts use `npm ci --ignore-scripts`; direct `ws`, `zod`, MCP SDK, OTel, DSH family, Vite/TS, and Linux-native optional packages. |
| `package-lock.json` | lockfile v3; DSH entries sampled consistently at `0.1.0-rc.6`; `ws` locked `8.21.0`; `zod` `4.4.3`; MCP SDK `1.29.0`; TypeScript `6.0.3`; Vite `7.3.6`; Linux Sharp/libvips/Koffi entries have registry `resolved` URLs and `integrity` hashes. |
| `scripts/prepare-dsh-web.mjs` | Exact string replacement against published compiled client bundles; `mustReplace()` fail-fast; WebSocket-to-SSE patch; settings/model/preset/workspace/locale/export patches; generated plugin source is hashed to a 12-character SHA-256 revision. |
| `scripts/restore-host-frontend-natives.mjs` | Missing host natives restored with `npm pack --ignore-scripts` using versions from lockfile, then manually extracted with `tar`; Linux Sharp/libvips/Koffi required. |
| `scripts/prune-agent-dependencies.mjs` | Exact-string patch against `@deepseek-ai/dsh-subprocess-local` to make `node-pty` lazy; fails if expected source text is absent; prunes platform files/source maps. |
| `agents/_mcp-bridge.ts` | Direct use of `@modelcontextprotocol/sdk` and `zod`; creates `McpServer` and `StreamableHTTPServerTransport` integration. |
| Project `main` | `70119cfdae992a203a5e29eb24e91c7200222a7c`; tree `489ec3e0c02a95acd99b554de9e6769c0523afd6`. |
| TencentEdgeOne adapter `main` | `2110cc1bb5f6d5436593927fa6a4fa46e6f16407`; same tree `489ec3e0c02a95acd99b554de9e6769c0523afd6`. |
| DeepSeek canonical upstream `master` | `76fda729799fe9b3848dbe2c211d4b231032b81e`; commit references `0.1.2-rc.1`. |
| npm: `@deepseek-ai/dsh` | observed current version `0.1.2-rc.1` at audit time. |
| npm: selected DSH browser packages | observed current tags are not a single simple version line; e.g. `dsh-client-connection` `0.0.1-rc.1`, `dsh-client-ui-model-selection` `0.0.1-rc.3`, `dsh-client-ui-settings-models` latest `0.0.1-rc.3` with `0.1.2-rc.1` also exposed as `next`; `dsh-agent` remained `0.1.0-rc.6`. |
| npm: `@modelcontextprotocol/sdk` | audited `1.29.0`; observed current `1.30.0`. Reviewed GitHub advisories affecting older versions are fixed by `1.25.2`, `1.26.0`, and `1.24.0`, so the audited direct version is above those fixed thresholds. |
| npm / ws upstream | audited `ws` `8.21.0`; observed current npm `8.21.3`. Upstream `8.21.1` release reduces fragment limits and counts empty fragments; GitHub advisory/report identifies memory-exhaustion risk in versions before `8.21.1`. |
| npm: `zod` | audited `4.4.3`; observed current `4.5.4`. |
| npm: Vite | audited lock `7.3.6`; observed current `8.2.2`. |
| npm: TypeScript | audited lock `6.0.3`; observed current `7.0.2`. |
| npm: OpenTelemetry | audited stable generation around `1.30.1` plus experimental `0.55.0`; observed current `@opentelemetry/sdk-trace-node` `2.11.0` and experimental `@opentelemetry/api-logs` `0.222.0`, whose npm page explicitly warns of possible breaking changes. |
| Root license files | root `LICENSE` exists and project manifest says MIT. No root `NOTICE`, `THIRD_PARTY_NOTICES`, SPDX/CycloneDX SBOM, Dependabot, or Renovate configuration was observed in the audited root/tree/search. |

External evidence URLs used in this audit include:

- Project base: `https://github.com/thanhhaixn92/PQG-Harness/commit/70119cfdae992a203a5e29eb24e91c7200222a7c`
- Adapter head: `https://github.com/TencentEdgeOne/deepseek-harness/commit/2110cc1bb5f6d5436593927fa6a4fa46e6f16407`
- Canonical DeepSeek head: `https://github.com/deepseek-ai/deepseek-harness/commit/76fda729799fe9b3848dbe2c211d4b231032b81e`
- DSH npm: `https://www.npmjs.com/package/@deepseek-ai/dsh`
- MCP SDK npm: `https://www.npmjs.com/package/@modelcontextprotocol/sdk`
- MCP advisories: `https://github.com/modelcontextprotocol/typescript-sdk/security/advisories`
- ws npm: `https://www.npmjs.com/package/ws`
- ws releases: `https://github.com/websockets/ws/releases`
- ws incomplete-fragment report: `https://github.com/websockets/ws/issues/2331`
- GitHub advisory report: `https://github.com/advisories/GHSA-73jw-fp74-p77x`
- Zod npm: `https://www.npmjs.com/package/zod`
- Vite npm: `https://www.npmjs.com/package/vite`
- TypeScript npm: `https://www.npmjs.com/package/typescript`
- OTel Node tracing npm: `https://www.npmjs.com/package/@opentelemetry/sdk-trace-node`
- OTel logs API npm: `https://www.npmjs.com/package/@opentelemetry/api-logs`

### Dependency classification matrix

| Dependency / family | Audited posture | Observed upstream/current posture | Classification | Rationale |
|---|---|---|---|---|
| `@deepseek-ai/dsh-*` | Predominantly locked to `0.1.0-rc.6`; manifest mixes exact and `^0.1.0-rc.6` | Canonical upstream has moved to `0.1.2-rc.1`; package tags/version lines differ across subpackages | **DO NOT UPGRADE IN ISOLATION** | Compatibility patches target compiled package text and multiple DSH packages move/tag differently. Treat as one tested upgrade wave. |
| `@modelcontextprotocol/sdk` | exact `1.29.0` | observed `1.30.0` | **REVIEW** | One minor behind; audited version is above reviewed 2025/2026 advisory fixed thresholds. Test local MCP bridge semantics before bump. |
| `ws` | range `^8.21.0`, lock `8.21.0` | observed `8.21.3`; `8.21.1` contains further memory-exhaustion hardening | **UPGRADE CANDIDATE** | Security/reliability reason; see P1 finding. |
| `zod` | exact `4.4.3` | observed `4.5.4` | **REVIEW** | Used directly by MCP bridge; no urgent issue confirmed. Review with MCP SDK bump to reduce compatibility churn. |
| OpenTelemetry stable + experimental set | exact coordinated set around stable `1.30.1` and experimental `0.55.0` | stable current generation observed `2.11.0`; logs experimental `0.222.0` with breaking-change warning | **DO NOT UPGRADE IN ISOLATION** | Large generation jump and mixed stable/experimental compatibility surface. Upgrade as a tested OTel set. |
| Linux Sharp/libvips/Koffi optionals | lock includes platform-specific x64 binaries and integrity values; build asserts their presence | latest versions not exhaustively verified in this audit | **PIN/KEEP** | Native ABI/platform risk is higher than freshness benefit without a targeted EdgeOne runtime compatibility test. |
| Node engine | `^22.19 || >=24` | actual deployed Node version NOT VERIFIED | **REVIEW** | `>=24` is open-ended across future majors; native/runtime support should be tied to tested Node lines. |
| Vite | manifest `^7.0.0`, lock `7.3.6` | observed `8.2.2` | **REVIEW** | Major upgrade, build-tool behavior change risk; no urgent issue confirmed for locked version in this audit. |
| TypeScript | manifest `^6.0.0`, lock `6.0.3` | observed `7.0.2` | **REVIEW** | Major upgrade; coordinate with Vite/Node/typecheck rather than freshness-only bump. |

## 6. Findings

### P0
No P0 finding confirmed.

### P1

#### A08-P1-01 — `ws@8.21.0` is below upstream's subsequent memory-exhaustion hardening release
- ID: `A08-P1-01`
- Severity: **P1 — High**
- Status: **CONFIRMED** for vulnerable-version presence / upstream fix signal; production reachability is **NOT VERIFIED**.
- Evidence:
  - `package.json`: direct dependency `"ws": "^8.21.0"`.
  - `package-lock.json`: `node_modules/ws` resolves exactly to `8.21.0` with registry integrity metadata.
  - npm currently exposes `8.21.3`.
  - `https://github.com/websockets/ws/releases`: release `8.21.1` states that empty fragments are counted toward the limit and lowers default `maxBufferedChunks` / `maxFragments`.
  - `https://github.com/websockets/ws/issues/2331`: upstream report demonstrates that default `8.21.0` settings can retain large numbers of incomplete fragments and amplify memory use.
  - `https://github.com/advisories/GHSA-73jw-fp74-p77x`: advisory report states `ws` before `8.21.1` contains a memory-exhaustion issue. The advisory is marked unreviewed, so this audit relies additionally on the upstream issue and release changes rather than the advisory label alone.
  - First-party GitHub code search found no direct `WebSocketServer` / `from 'ws'` import; that does not establish absence of a DSH/dynamic code path.
- Technical analysis: The lockfile freezes the direct dependency at `8.21.0`. That release fixed an earlier fragment/chunk DoS, but upstream subsequently shipped `8.21.1` specifically to count empty fragments and lower default fragment/chunk limits after an incomplete-message memory-exhaustion report. Because `ws` is a production dependency and both clients and servers can be exposed to hostile WebSocket peers depending on use, retaining `8.21.0` creates an avoidable availability risk. Static first-party search is insufficient to prove exploitability because DSH packages and generated runtime paths may load `ws` indirectly/dynamically.
- Impact: Potential remote availability degradation/OOM if an affected `ws` receive path is reachable. Exploitability in the deployed EdgeOne topology is **NOT VERIFIED**, but the vulnerable locked version is confirmed and the update is patch-level within the existing `^8.21.0` manifest range.
- Recommendation: In planning/implementation, update the lock to at least `ws@8.21.1`, preferably the then-current compatible 8.21.x patch (`8.21.3` observed at audit time), then run DSH sidecar/event/MCP smoke tests and production-topology reachability checks. Do not use `npm audit fix` blindly.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A02 runtime architecture** for actual WebSocket reachability and **A09 tests/CI/observability** for regression coverage.

### P2

#### A08-P2-01 — DSH dependency wave is lock-consistent today but manifest semver intent is unsafe for isolated refreshes
- ID: `A08-P2-01`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - `package.json` mixes exact `0.1.0-rc.6` and caret `^0.1.0-rc.6` declarations across the direct `@deepseek-ai/dsh-*` family.
  - `package-lock.json` samples across core, agent, UI, settings, session, tools, and other DSH packages resolve to `0.1.0-rc.6`, so `npm ci` currently supplies a coherent frozen wave.
  - Canonical upstream `deepseek-ai/deepseek-harness@76fda729...` and npm `@deepseek-ai/dsh` show a newer `0.1.2-rc.1` wave.
  - Current npm tags differ across DSH subpackages (examples in Evidence inventory), so “latest” does not represent one interchangeable family version.
- Technical analysis: The current lockfile is a strong reproducibility control, but the manifest encodes mixed update semantics. A future lock regeneration could move caret-declared packages without moving exact-declared siblings, while the compatibility layer expects specific implementation text and peer interactions. Pre-release semver, package retagging, and package-family decomposition increase the chance that freshness-only tooling proposes a technically invalid partial update.
- Impact: Build failures, runtime/API incompatibility, or subtle UI/host divergence during dependency maintenance even when individual package versions look semver-compatible.
- Recommendation: Treat DSH as a **DO NOT UPGRADE IN ISOLATION** family. In planning, define one tested DSH compatibility bill of materials (BOM) or exact-pin policy for all direct DSH dependencies, regenerate the lock only in an explicit upgrade branch, and require `prepare:dsh-web`, build, typecheck, unit tests, black-box smoke, and patch-point review before adoption.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A01 upstream governance**, **A02 runtime architecture**, **A09 tests/CI**, and **A10 frontend productization**.

#### A08-P2-02 — `prepare-dsh-web.mjs` is fail-fast but tightly coupled to compiled implementation strings
- ID: `A08-P2-02`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - `scripts/prepare-dsh-web.mjs`: `mustReplace(source, find, replacement, label)` throws when an exact patch point is absent.
  - The script patches exact compiled JavaScript/CSS/localized strings for connection transport, settings persistence/models, model selection, agent preset UI, permission presets, conversation UI, workspace UI, locale logic, and session-log export.
  - `patchConnectionBundle()` replaces exact `readWebSocket(...)` calls with `readSse(...)` and throws if either expected call is missing.
  - `clientPackages()` reads each published package's `lib/client.js`, patches selected packages, writes generated copies under `public/plugins/...`, and adds a 12-character SHA-256 revision derived from the patched output.
  - `scripts/prune-agent-dependencies.mjs` adds another exact-string compatibility patch against `@deepseek-ai/dsh-subprocess-local` (`node-pty` eager import -> lazy import), with its own fail-fast guard.
- Technical analysis: Fail-fast exact matching is materially safer than silently applying a partial patch, and output hashing is good cache-integrity hygiene. However, exact implementation strings and generated CSS class names are not stable public contracts. The script verifies that named snippets still exist; it does not prove that surrounding upstream semantics, event contracts, lifecycle ordering, or interaction between patched modules remain compatible. There is no checked compatibility manifest tying each patch function to an expected source package version/content hash. A DSH update therefore has a large review radius even when every `mustReplace()` still matches.
- Impact: Upgrade-induced build breakage (likely caught early) and a residual risk of semantically stale patches that still match text but no longer express the intended behavior.
- Recommendation: Preserve fail-fast behavior. In planning, add a compatibility manifest/test layer that records producer package/version or source hash for patched bundles, tests expected post-patch behavior, and makes the DSH wave upgrade explicitly review every patch function. Prefer upstream-supported extension points over compiled-string patching where/when available; do not refactor during this audit phase.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A01 upstream governance**, **A02 runtime architecture**, **A09 CI/tests**, and **A10 frontend**.

#### A08-P2-03 — Host-native restoration is version-locked but not explicitly anchored to lockfile integrity
- ID: `A08-P2-03`
- Severity: **P2 — Medium**
- Status: **CONFIRMED**
- Evidence:
  - `package-lock.json` contains `integrity` fields for native packages such as `@img/sharp-linux-x64@0.35.3`, `@img/sharp-libvips-linux-x64@1.3.2`, and `@koromix/koffi-linux-x64@3.1.5`.
  - `scripts/restore-host-frontend-natives.mjs` obtains the version from `lock.packages[...]`, then executes `npm pack --json --ignore-scripts <name>@<version>` and manually extracts the returned tarball with `tar -xzf` into `node_modules`.
  - The script does not read/compare the lockfile's `resolved` or `integrity` field for the restored tarball.
  - `prepare:makers-runtime` otherwise begins with `npm ci --ignore-scripts --os=linux --cpu=x64 --include=optional`, which is a stronger lock-governed installation path.
- Technical analysis: The restoration helper is constrained to an exact package name/version from the lock and suppresses package lifecycle scripts, both positive controls. Nevertheless, the helper's trust anchor for the restored tarball is npm's registry resolution/metadata at execution time rather than the exact `package-lock.json` integrity value already committed for that artifact. The subsequent manual extraction also sits outside npm's lockfile installation transaction. This is a narrower supply-chain guarantee than the normal `npm ci` path.
- Impact: Increased exposure to registry/provenance drift or an unexpected same-version artifact on the exceptional native-restore path; native packages also have high runtime/ABI blast radius.
- Recommendation: In planning, preserve exact-version and `--ignore-scripts` behavior but make restoration verify the tarball against the committed lockfile `integrity` (and, where practical, expected `resolved` source) before extraction, or replace the exceptional path with a package-manager mechanism that retains lock integrity guarantees. Keep Sharp/libvips/Koffi as **PIN/KEEP** until EdgeOne Linux/x64 runtime compatibility is explicitly tested.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A07 build/deploy**, **A03 security/secrets**, and **A09 CI**.

### P3

#### A08-P3-01 — Update-policy signals are insufficient for a dependency graph with compatibility patches
- ID: `A08-P3-01`
- Severity: **P3 — Low**
- Status: **CONFIRMED** for repository-visible configuration; organization-level automation is **NOT VERIFIED**.
- Evidence:
  - No Dependabot/Renovate configuration was observed in the audited repository tree/search.
  - `package.json` has no dependency-health script and no documented grouped-upgrade policy.
  - A directly locked `ws@8.21.0` remained below an upstream security/reliability patch (`8.21.1+`) at audit time.
- Technical analysis: This project should not accept ordinary automated version bumps indiscriminately because DSH and OTel require coordinated waves. The absence of visible automation is therefore not itself a defect; the gap is the lack of a repository-visible policy that distinguishes safe patch candidates (`ws`) from coordinated families (`@deepseek-ai/dsh-*`, OTel, native packages).
- Impact: Security patch latency or, conversely, risky freshness-driven partial updates when maintenance is done manually.
- Recommendation: In planning, define a grouped dependency policy: frequent advisory review for network/security packages; automatic PRs only for low-blast-radius patch updates; explicit grouped rules for DSH/OTel/native stacks; required tests and rollback criteria. Coordinate any CI implementation with A09.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A09 tests/quality/CI/observability** and **A11 operations/governance**.

#### A08-P3-02 — Third-party license/SBOM evidence is incomplete
- ID: `A08-P3-02`
- Severity: **P3 — Low**
- Status: **CONFIRMED** for artifact absence; legal/license compliance is **NOT VERIFIED**.
- Evidence:
  - Root `LICENSE` exists and project manifest declares MIT.
  - Lockfile entries include multiple third-party license families (examples observed include MIT, Apache-2.0, BSD-2-Clause, ISC).
  - No root `NOTICE`, `THIRD_PARTY_NOTICES`, SPDX/CycloneDX SBOM, or generated third-party attribution inventory was observed.
- Technical analysis: The lockfile provides package/version/integrity data but is not a complete redistribution/license-obligation record. Generated frontend bundles and packaged agent dependencies can redistribute third-party code. Absence of an attribution artifact does not prove license non-compliance, but it leaves compliance evidence incomplete and complicates incident response/provenance review.
- Impact: Low near-term runtime risk; maintainability/compliance evidence gap for public distribution or formal release governance.
- Recommendation: In planning, generate an SBOM and third-party license inventory from the exact release lock/build, review exceptions/notice obligations, and retain it as a release artifact. Do not infer legal compliance solely from package metadata.
- Dependency/interaction with other audit domains: Cross-audit handoff to **A11 documentation/licensing/operations/governance**.

## 7. What is already good / should be preserved
1. **Exact baseline discipline:** audit base SHA was verified rather than assumed.
2. **Current adapter synchronization:** audited project tree exactly matches current `TencentEdgeOne/deepseek-harness` `main` tree at audit time.
3. **Lockfile reproducibility:** lockfile v3 pins concrete tarball versions with registry integrity metadata; sampled DSH packages are coherently locked to `0.1.0-rc.6` under `npm ci`.
4. **Install-script reduction:** Makers runtime install uses `npm ci --ignore-scripts`; host-native `npm pack` also passes `--ignore-scripts`. A search of the audited lock content did not reveal `"hasInstallScript": true`; package tarball lifecycle behavior beyond lock metadata remains NOT VERIFIED.
5. **Fail-fast patching:** `mustReplace()` and other explicit guards turn many incompatible DSH artifact changes into build-time errors instead of silently producing an obviously partial patch.
6. **Generated output revisioning:** patched browser plugin output is SHA-256-derived and revisioned, reducing stale-cache ambiguity.
7. **Native platform assertions:** build helper explicitly checks required Linux/x64 Sharp/libvips/Koffi packages instead of silently proceeding without them.
8. **MCP security baseline is reasonably current:** `@modelcontextprotocol/sdk@1.29.0` is above the fixed versions for the reviewed DNS-rebinding, ReDoS, and shared-transport data-leak advisories checked during this audit (`1.24.0`, `1.25.2`, `1.26.0`).
9. **MCP transitive spot-checks are on patched versions:** the lock resolves `fast-uri@3.1.5`, `hono@4.13.2`, `express-rate-limit@8.6.2`, and `ip-address@10.5.0`; no issue was raised from the previously reported older thresholds for those packages.
10. **Avoid freshness-only major jumps:** retaining the currently tested Vite 7 / TypeScript 6 / OTel generation until a coordinated compatibility exercise is safer than chasing current majors without evidence.

## 8. Gaps and NOT VERIFIED items
- **NOT VERIFIED:** Whether `ws@8.21.0` is reachable by an unauthenticated or hostile network peer in the deployed EdgeOne topology. Static first-party search was insufficient to establish reachability through DSH/dynamic paths.
- **NOT VERIFIED:** A complete vulnerability inventory of every direct/transitive package from a registry-backed scanner (`npm audit`, OSV, Snyk, GitHub Dependabot alert state). This audit performed targeted advisory verification only and did not claim a vulnerability-free graph.
- **NOT VERIFIED:** Actual production Node version, libc/ABI, and native binary environment used by the EdgeOne deployment; only repository engine/build constraints were audited.
- **NOT VERIFIED:** Full integrity/provenance behavior of `npm pack` in the EdgeOne build environment and whether the fetched native tarball bytes equal the committed lockfile integrity value on every build.
- **NOT VERIFIED:** Full third-party license/notice compliance or legal obligations; no dedicated license scanner/SBOM artifact was available in scope.
- **NOT VERIFIED:** Organization-level Dependabot/Renovate/security tooling that may exist outside repository-visible configuration.
- **NOT VERIFIED:** Compatibility of any proposed newer DSH, OTel, Vite, TypeScript, Zod, MCP SDK, or native package versions. No dependency versions were changed or tested because this phase is audit-only.
- **NOT VERIFIED:** Production behavior after hypothetical changes to `prepare-dsh-web.mjs`; no changes were made.

## 9. Recommended next actions — audit recommendation only
Priority order for the planning/implementation phase:

1. **P1:** Prepare a minimal `ws` patch update to `>=8.21.1` (prefer then-current compatible 8.21.x), with runtime reachability review and sidecar/event smoke coverage.
2. Define a **DSH atomic upgrade policy/BOM**. Do not allow isolated DSH package updates; reconcile exact vs caret manifest intent during a dedicated compatibility change.
3. Build a **patch compatibility manifest/test suite** for `prepare-dsh-web.mjs` and the `node-pty` patch in `prune-agent-dependencies.mjs`, retaining fail-fast behavior and adding producer-version/content-hash plus behavioral assertions.
4. Strengthen **native restore provenance** by verifying downloaded tarballs against committed lock integrity or using a lock-enforcing restoration mechanism.
5. Review MCP SDK `1.30.x` and Zod `4.5.x` together as a small controlled compatibility change, not as an urgent security response.
6. Keep OTel as a coordinated **DO NOT UPGRADE IN ISOLATION** set until the project has a dedicated migration plan across stable 2.x and experimental logs packages.
7. Review Node support policy and explicitly document/test supported Node major lines; do not rely indefinitely on the open-ended `>=24` engine expression.
8. Treat Vite 8 and TypeScript 7 as planned major upgrades, not routine freshness bumps.
9. Add repository-visible dependency governance: grouped update classes, security review cadence, required tests, rollback rules, and ownership.
10. Produce an exact-release SBOM and third-party license/notice inventory for public/stable release governance.

## 10. Handoff to planning phase
Planning should preserve the current lock-first and fail-fast philosophy while reducing two forms of hidden coupling: (a) semver ranges that imply packages can move independently when they cannot, and (b) compatibility patches that depend on compiled implementation strings without a source-version/hash contract.

Suggested work packages:

- **WP-A08-1 — ws security patch:** one controlled 8.21.x patch update, runtime reachability analysis, regression tests, no unrelated dependency churn.
- **WP-A08-2 — DSH wave management:** inventory every direct DSH package, map patched producer packages, select a single upstream release/commit target, and prove all patch points and runtime behavior together.
- **WP-A08-3 — Patch contract:** machine-readable expected producer version/hash + post-patch behavior checks for `prepare-dsh-web.mjs` and `prune-agent-dependencies.mjs`.
- **WP-A08-4 — Native provenance:** lock-integrity verification for host-native restore and explicit EdgeOne Linux/x64/Node ABI test matrix.
- **WP-A08-5 — Dependency governance/SBOM:** grouped update automation policy, advisory cadence, SBOM, third-party license inventory.

No implementation is included in this audit report.

## 11. Appendix

### A. Key audited versions

| Item | Manifest intent | Locked / observed project version | Observed current upstream version/status | Classification |
|---|---:|---:|---:|---|
| `@deepseek-ai/dsh` | `^0.1.0-rc.6` | `0.1.0-rc.6` | `0.1.2-rc.1` | DO NOT UPGRADE IN ISOLATION |
| `@deepseek-ai/dsh-agent` | `0.1.0-rc.6` | `0.1.0-rc.6` | `0.1.0-rc.6` observed npm | DO NOT UPGRADE IN ISOLATION |
| `@modelcontextprotocol/sdk` | `1.29.0` | `1.29.0` | `1.30.0` | REVIEW |
| `ws` | `^8.21.0` | `8.21.0` | `8.21.3` | UPGRADE CANDIDATE |
| `zod` | `4.4.3` | `4.4.3` | `4.5.4` | REVIEW |
| `typescript` | `^6.0.0` | `6.0.3` | `7.0.2` | REVIEW |
| `vite` | `^7.0.0` | `7.3.6` | `8.2.2` | REVIEW |
| OTel stable SDK/core set | exact 1.x | principally `1.30.1` (API `1.9.1`) | `sdk-trace-node 2.11.0` observed | DO NOT UPGRADE IN ISOLATION |
| OTel experimental logs/export set | exact `0.55.0` | `0.55.0` | `api-logs 0.222.0` observed | DO NOT UPGRADE IN ISOLATION |
| Sharp Linux x64 | `^0.35.3` | `0.35.3` | not exhaustively checked | PIN/KEEP |
| Sharp libvips Linux x64 | `^1.3.2` | `1.3.2` | not exhaustively checked | PIN/KEEP |
| Koffi Linux x64 | `^3.1.5` | `3.1.5` | not exhaustively checked | PIN/KEEP |
| Node | `^22.19 || >=24` | deployed version NOT VERIFIED | not assessed as a package dependency | REVIEW |

### B. DSH packages explicitly patched by `prepare-dsh-web.mjs`
The script dispatches patch functions for at least:

- `@deepseek-ai/dsh-client-connection`
- `@deepseek-ai/dsh-client-ui-agent-preset`
- `@deepseek-ai/dsh-client-ui-permission-presets`
- `@deepseek-ai/dsh-client-ui-conversation`
- `@deepseek-ai/dsh-client-ui-workspace`
- `@deepseek-ai/dsh-client-ui-settings`
- `@deepseek-ai/dsh-client-ui-settings-models`
- `@deepseek-ai/dsh-client-ui-model-selection`
- `@deepseek-ai/dsh-session-log-export`
- `@deepseek-ai/dsh-client-locale`

It also excludes selected upstream web client packages (`dsh-client-ui-directory-picker-browse`, `dsh-client-hmr`, `dsh-cordis-client-runner`, `dsh-client-ui-cordis`) from the generated plugin inventory. These are all part of the DSH upgrade blast radius.

### C. Finding counts
- P0: **0**
- P1: **1**
- P2: **3**
- P3: **2**

### D. Final audit statement
At exact base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`, dependency installation is substantially reproducible under the committed lock and current adapter source is synchronized with the TencentEdgeOne upstream tree. The main actionable high-risk item is the locked `ws@8.21.0` relative to subsequent upstream memory-exhaustion hardening. The broader maintainability risk is not simply “old packages”; it is **coupled upgrade topology**: DSH compiled-artifact patches, pre-release package-family versioning, native binary handling, and coordinated OTel generations make isolated automated bumps unsafe. The appropriate strategy is targeted security patches plus explicit, test-backed dependency waves.
