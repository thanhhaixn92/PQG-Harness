# A10 — Frontend, productization, localization, accessibility & generated-code boundaries

## 1. Metadata
- Repository: `thanhhaixn92/PQG-Harness`
- Base branch: `main`
- Exact base SHA: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Baseline comparison: matches the prompt's expected baseline SHA; no baseline drift observed at audit start.
- Audit date/time: 2026-09-04 16:57 ICT (UTC+07:00)
- Auditor/subagent: A10
- Verdict: **PASS WITH RISKS**
- Finding count: P0 = 0, P1 = 1, P2 = 4, P3 = 1

## 2. Scope
This audit is documentation-only and covers the frontend/productization domain requested by A10:

- root `index.html`;
- `public/`, including generated assets, generated DSH client bundles, favicon, manifest, and public shell;
- the vendored `@deepseek-ai/dsh-web-frontend` flow;
- frontend patches in `scripts/prepare-dsh-web.mjs`;
- current DeepSeek/EdgeOne branding and upstream/TencentEdgeOne links;
- locale behavior, English/Chinese copy, and feasibility of Vietnamese;
- responsive/mobile behavior visible from source and tests;
- baseline accessibility of the project-owned UI additions;
- model selector, permission selector, settings, session/workspace UX;
- generated versus hand-maintained boundaries;
- the feasibility of productizing PQG without making upstream synchronization unnecessarily fragile.

Excluded from deep audit: backend trust boundaries, MCP implementation, AI Gateway internals, CI/CD, dependency provenance, and production deployment configuration except where they directly determine frontend behavior. Those belong to the respective Phase 1 audit domains.

No source, CSS, HTML, JavaScript, dependencies, generated frontend, tests, deployment configuration, runtime configuration, release, or production data were changed.

## 3. Method
1. Resolved canonical `main` through the GitHub branch endpoint and recorded exact SHA `70119cfdae992a203a5e29eb24e91c7200222a7c` before auditing.
2. Inspected the repository tree and the frontend build inputs/outputs at that exact SHA.
3. Read `package.json`, `README.md`, `.gitattributes`, `index.html`, `public/manifest.webmanifest`, `public/favicon.svg`, generated locale/client bundles, `scripts/prepare-dsh-web.mjs`, and `tests/dsh-web.test.ts`.
4. Traced `npm run build` into `prepare:dsh-web`, the upstream DSH distribution copy, bundle patching, boot-graph construction, and final shell writes.
5. Classified current modifications into cosmetic productization, functional UI changes, and upstream-sensitive patches.
6. Reviewed project-owned dialog/chrome behavior and generated component changes for baseline keyboard/accessibility and responsive risks.
7. Attempted non-mutating production verification. The available execution environment could not fetch the EdgeOne production hostname or run a browser automation binary. Therefore desktop/mobile live behavior, WCAG contrast, keyboard traversal, and production-to-SHA parity are explicitly **NOT VERIFIED**.
8. A temporary local clone was attempted only for read-only verification, but the execution container could not resolve `github.com`; repository inspection therefore used the connected GitHub API instead. No local or remote source mutation resulted from this failed attempt.

## 4. Architecture / current-state summary
### 4.1 Frontend generation flow
`package.json` defines:

- `prepare:dsh-web`: `node scripts/prepare-dsh-web.mjs && node scripts/generate-dsh-api-routes.mjs`;
- `build`: `npm run prepare:dsh-web && vite build`;
- dependency `@deepseek-ai/dsh-web-frontend: ^0.1.0-rc.6` with a lockfile present.

`README.md` explicitly describes `public/` as the **Official DSH Web Shell (generated)** and states that `npm run prepare:dsh-web` vendors the official Web Shell into `public/`.

The final block of `scripts/prepare-dsh-web.mjs` is authoritative for the generated boundary:

1. `rm(publicDir, { recursive: true, force: true })`;
2. recreate `public/`;
3. `cp(webDist, publicDir, { recursive: true })` from `node_modules/@deepseek-ai/dsh-web-frontend/dist`;
4. enumerate DSH web client packages and write patched `public/plugins/<package>/client.js` files;
5. read upstream `dist/index.html`;
6. inject Makers bootstrap/chrome into the shell;
7. write the resulting HTML to both root `index.html` and `public/index.html`.

At the audited SHA, root `index.html` and `public/index.html` have the same blob SHA (`18ec91ea2cbfb2b91c834c926af6c6c3e4929aa3`), confirming that both are generated from the same preparation step.

### 4.2 Files that should **not** be edited by hand
The following are generated or regeneration-owned and should not be the primary editing surface:

- `index.html`;
- all of `public/**`, including:
  - `public/index.html`;
  - `public/assets/**`;
  - `public/plugins/**/client.js`;
  - `public/favicon.svg`;
  - `public/manifest.webmanifest`.

Reason: `prepare-dsh-web.mjs` deletes `public/` wholesale and recopies upstream `dist` before writing patched bundles; it also overwrites root `index.html`. A direct manual edit can therefore disappear on the next preparation/build.

Hand-maintained frontend adaptation currently lives primarily in:

- `scripts/prepare-dsh-web.mjs`;
- `tests/dsh-web.test.ts`;
- repository metadata/documentation such as `package.json` and `README*.md`.

### 4.3 Current product adaptation layers
**Cosmetic/product chrome**
- `makersActionsHead` injects GitHub, Deploy, Powered-by, and contact UI.
- The custom chrome uses project-owned HTML strings, CSS, links, and bilingual copy.
- The upstream manifest and shell still identify the application as DeepSeek Harness.

**Functional UI changes**
- `patchModelSelectionBundle`: filters catalog groups to `edgeone-makers`, changes selection loading/optimistic behavior, and menu-close behavior.
- `patchPermissionPresetsBundle` and `patchConversationBundle`: retain permission selection but replace copy/tooltips with EdgeOne Makers sandbox semantics.
- `patchSettingsBundle` / `patchSettingsModelsBundle`: force Host-backed settings persistence, suppress onboarding surfaces, and replace model credential/settings content with Makers-provided-model messaging.
- `patchConversationBundle` / `patchWorkspaceBundle`: convert workspace switching UX to a single static Cloud Workspace representation and hide workspace-management controls.
- `patchAgentPresetBundle`: introduces Makers-mode wording, locks built-in presets, and hides preset selection/settings surfaces.
- `patchLocaleBundle`: changes locale initialization and synchronizes `<html lang>`.

**Upstream-sensitive adaptation**
- Most functional changes are implemented by exact string replacement against compiled DSH client bundles.
- `mustReplace()` deliberately throws if an expected compiled string changes. This is fail-closed and therefore safer than silent mutation, but it also means upstream implementation/detail drift directly breaks the preparation step.
- The custom chrome also attaches to upstream DOM through class-name substrings such as `_centerCol`, `_titleRow`, `_headerUtilities`, `_titleCluster`, and `_composerHero`.

### 4.4 Current locale behavior
Generated `public/plugins/@deepseek-ai/dsh-client-locale/client.js` defines only:

- `LOCALE_IDS = ["zh", "en"]`;
- `LOCALES = [{ id: "zh", label: "中文" }, { id: "en", label: "English" }]`.

The patched `resolveInitialLocale()` returns English only when `location.hostname.endsWith(".edgeone.dev")`; all other hostnames default to Chinese unless a durable Host preference later overrides the provisional selection.

The known production URL is `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`. If that deployment serves this audited frontend and the user has no stored locale preference, the code path resolves to Chinese because `.edgeone.cool` does not match `.edgeone.dev`. This specific production outcome is **INFERRED** from the audited code and known hostname; live production parity was not verified.

### 4.5 Current branding
Confirmed branding remains primarily upstream/template branding:

- `<title>DeepSeek Harness</title>` in generated shell;
- PWA manifest `name: "DeepSeek Harness"`, `short_name: "DSH"`;
- current favicon is the upstream DeepSeek-style SVG copied into generated `public/`;
- `package.json` name/description/repository still describe DeepSeek Harness and point repository metadata to `TencentEdgeOne/deepseek-harness`;
- injected chrome hard-codes the GitHub link to `https://github.com/TencentEdgeOne/deepseek-harness`;
- Deploy/contact links are EdgeOne/Tencent host-dependent links;
- custom copy says “DeepSeek Harness” and “EdgeOne Makers Agents”.

No PQG-specific product name, favicon/logo, Vietnamese locale, or PQG-owned custom links were found in the audited frontend.

## 5. Evidence inventory
| Evidence | Relevance |
|---|---|
| GitHub `branches/main` at audit start | Exact canonical base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c` |
| `package.json` | Build pipeline, DSH frontend dependency, project metadata/upstream repository |
| `README.md` | Documents `public/` as generated and explains preparation flow |
| `scripts/prepare-dsh-web.mjs` — `mustReplace`, patch functions, `clientPackages`, `makersActionsHead`, `makersBootstrap`, final copy/write block | Primary hand-maintained frontend adaptation and generated boundary |
| `index.html` and `public/index.html` | Generated shell, title, bootstrap, project-owned chrome, same blob SHA |
| `public/manifest.webmanifest` | PWA name/short name and favicon reference |
| `public/favicon.svg` | Current upstream visual identity |
| `public/plugins/@deepseek-ai/dsh-client-locale/client.js` — `LOCALE_IDS`, `LOCALES`, `LocaleRuntime`, `resolveInitialLocale` | Shipped languages and initialization behavior |
| `public/assets/**` | Hashed upstream/generated JS/CSS/fonts/lang assets |
| `tests/dsh-web.test.ts` | Contract tests for patch presence, locale hostname rule, chrome strings, workspace restrictions, model/permission behavior; no browser-rendered viewport/a11y execution |
| `.gitattributes` | Only special-cases trailing whitespace for `public/**/*.js`; does not mark generated assets semantically |

## 6. Findings
### P0
No P0 finding identified in the A10 scope.

### P1
#### A10-F01 — Product behavior is tightly coupled to exact compiled-upstream bundle text and private DOM structure
- ID: A10-F01
- Severity: P1
- Status: **CONFIRMED**
- Evidence:
  - `scripts/prepare-dsh-web.mjs`, symbol `mustReplace()`: every exact patch point throws when the compiled upstream text no longer matches.
  - Same file, symbols `patchSettingsModelsBundle`, `patchModelSelectionBundle`, `patchAgentPresetBundle`, `patchPermissionPresetsBundle`, `patchConversationBundle`, `patchWorkspaceBundle`, `patchLocaleBundle`: functional behavior is rewritten inside compiled `@deepseek-ai/*/lib/client.js` output.
  - Same file, `makersActionsHead`: project chrome locates upstream layout via substring selectors `_centerCol`, `_titleRow`, `_headerUtilities`, `_titleCluster`, `_composerHero`.
  - `tests/dsh-web.test.ts`: tests assert generated string patterns and patch presence rather than stable upstream extension contracts.
- Technical analysis:
  - The design intentionally fails closed when a patch point changes, which is good defensive behavior and should be preserved.
  - However, the current patch surface spans locale, model selection, agent presets, permissions, conversation, workspace, settings, settings-models, session-log export, and connection behavior. Product copy, UI restrictions, transport adaptation, and upstream DOM placement are concentrated in one large build script.
  - A normal upstream DSH release can change formatting, bundler output, internal variable names, CSS-module structure, or component structure without changing public behavior. Such changes can break PQG preparation even when no intended product behavior changed.
  - Because custom chrome also binds to upstream private DOM class fragments, successful bundle preparation alone does not guarantee correct visual placement after an upstream UI refactor.
- Impact:
  - Significant upgrade/synchronization cost before stable public use.
  - Higher probability that an upstream update becomes a blocking frontend integration event.
  - Cosmetic PQG work risks accidentally touching functional patches, increasing regression blast radius.
- Recommendation:
  - In planning, split frontend adaptation into explicit layers: (1) product-owned cosmetic shell/branding config, (2) product-owned extension/plugin surfaces using stable APIs/slots, and (3) the smallest possible set of unavoidable compiled-bundle compatibility patches.
  - Keep exact-match assertions for unavoidable patches, but add a patch manifest that names upstream package/version, target symbol/behavior, rationale, and expected test.
  - Prefer stable slot/plugin APIs over DOM class-substring anchoring where DSH exposes them; where not exposed, treat those selectors as compatibility shims with rendered smoke coverage.
  - Do not mix PQG naming, favicon, links, or translation-only changes into functional model/workspace/permission patches.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A08/A09 for dependency upgrade/reproducibility and test/CI coverage. Do not duplicate those audits here.

### P2
#### A10-F02 — Locale architecture currently excludes Vietnamese and defaults non-`.edgeone.dev` hosts to Chinese
- ID: A10-F02
- Severity: P2
- Status: **CONFIRMED** for shipped locale set and hostname rule; **INFERRED** for fresh-user behavior on the known production URL because live deployment parity is not verified.
- Evidence:
  - `public/plugins/@deepseek-ai/dsh-client-locale/client.js`: `LOCALE_IDS = ["zh", "en"]`; `LOCALES` contains only Chinese and English.
  - Same bundle, `resolveInitialLocale()`: returns `en` only for hostnames ending in `.edgeone.dev`, otherwise `zh`.
  - `scripts/prepare-dsh-web.mjs`, `patchLocaleBundle`: explicitly removes browser-language detection and installs the hostname default rule.
  - `tests/dsh-web.test.ts`, test `locale defaults from hostname instead of the browser language`: asserts the hostname rule and asserts that `detectBrowserLocale` is absent.
  - Known production hostname ends in `.edgeone.cool`, not `.edgeone.dev`.
- Technical analysis:
  - Adding `lang="vi"` or Vietnamese text only to the custom Makers chrome would not constitute Vietnamese localization of the DSH application.
  - The DSH locale runtime requires an allowed locale ID and per-namespace dictionaries. Many UI packages register their own `zh`/`en` dictionaries, so full Vietnamese support is a functional localization change across multiple bundles/namespaces.
  - The current hostname rule is a market-routing policy, not user-language detection. For a PQG product targeting Vietnamese users, that policy is a poor default unless the product deliberately wants Chinese on all non-`.edgeone.dev` hosts.
- Impact:
  - Vietnamese cannot be selected in Settings.
  - Fresh users on a `.edgeone.cool` deployment are expected to see Chinese by default if no Host preference exists.
  - Partial Vietnamese chrome over an English/Chinese application would create inconsistent language and accessibility metadata.
- Recommendation:
  - Treat Vietnamese as a **functional UI/localization feature**, not cosmetic copy replacement.
  - Define a product locale policy first: product-config default, browser language fallback, and durable user preference ordering.
  - Add `vi` through a supported locale-extension mechanism across all required namespaces. If DSH has no stable override/registration extension, upstream contribution or a dedicated product locale plugin/build adapter is preferable to dozens of ad hoc compiled-string substitutions.
  - Update `<html lang>` to support `vi`, and ensure custom chrome uses the same active locale source.
- Dependency/interaction with other audit domains:
  - A09 should own automated localization/locale-switch tests once planned; A11 should own documentation/governance for translation ownership if applicable.

#### A10-F03 — PQG cosmetic productization has no isolated source-of-truth; DeepSeek/EdgeOne identity and external links remain hard-coded
- ID: A10-F03
- Severity: P2
- Status: **CONFIRMED**
- Evidence:
  - `index.html`: `<title>DeepSeek Harness</title>`.
  - `public/manifest.webmanifest`: `name = "DeepSeek Harness"`, `short_name = "DSH"`, icon `/favicon.svg`.
  - `public/favicon.svg`: current upstream favicon artwork.
  - `package.json`: package name `deepseek-harness`, description identifies the official DeepSeek Harness Web UI, repository points to `TencentEdgeOne/deepseek-harness`.
  - `scripts/prepare-dsh-web.mjs`, `makersActionsHead`: hard-coded TencentEdgeOne GitHub link; host-specific EdgeOne/Tencent Deploy and Contact URLs; bilingual copy repeatedly names DeepSeek Harness and EdgeOne Makers Agents.
- Technical analysis:
  - Branding is split across generated upstream files, package metadata, docs, and injected custom chrome.
  - Directly editing `public/favicon.svg`, `public/manifest.webmanifest`, or either generated `index.html` is unsafe because preparation overwrites them.
  - The least-conflict current surface for PQG-only chrome and links is the project-owned `makersActionsHead`/shell-postprocessing area, because that code is not a textual replacement inside a compiled DSH component.
  - Favicon/manifest/name changes should likewise be applied **after** the upstream `cp(webDist, publicDir)` step from a hand-maintained product-owned source/config, not edited in `public/`.
- Impact:
  - Current public identity is not a coherent PQG product.
  - Upstream/vendor links may be inappropriate as primary product navigation.
  - Without a central product configuration, future branding changes will be scattered and more likely to conflict with upstream refreshes.
- Recommendation:
  - Introduce, during planning, a small hand-maintained productization source-of-truth outside `public/` for: product name, short name, page title, logo/favicon source, custom links, and custom chrome copy.
  - Apply those values in the post-copy preparation phase.
  - Keep attribution/upstream links where licensing/governance requires them, but separate “PQG product navigation” from “upstream/vendor attribution”.
  - Do not place branding changes inside model, permission, workspace, or settings bundle patches.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A11 for licensing/attribution requirements before removing or demoting upstream/vendor links.

#### A10-F04 — Project-owned dialog/locked-control accessibility is incomplete for keyboard and assistive-technology users
- ID: A10-F04
- Severity: P2
- Status: **CONFIRMED** for the custom code paths audited.
- Evidence:
  - `scripts/prepare-dsh-web.mjs`, `makersActionsHead`: contact card uses `role="dialog"`, `aria-modal="true"`, and `aria-labelledby`, opens by focusing the “later” button, closes on Escape, and restores focus to the opener.
  - Same code: no Tab/Shift+Tab focus containment and no background `inert`/equivalent behavior is implemented for this custom modal.
  - Same file, `makersBootstrap`: locked-item explanatory tooltip is triggered by `pointerover`; there is no corresponding focus/focusin trigger.
  - `patchAgentPresetBundle`: menu entries are visually represented through `dsh-makers-locked`/`data-tip` and guarded in `onSelect`, but the constructed item object shown in the patch does not expose an explicit disabled state; settings cards use real `disabled` buttons and improved `aria-label`, creating inconsistent semantics between surfaces.
- Technical analysis:
  - The dialog has several correct baseline attributes and focus-return behavior; these should be preserved.
  - `aria-modal="true"` represents a modal interaction contract, but the custom implementation does not itself enforce focus containment or make the rest of the page inert.
  - Pointer-only explanatory tooltips make the reason for a locked state difficult or impossible to discover from keyboard focus alone.
  - A visually disabled menu option that accepts keyboard selection but silently no-ops can be confusing even if it prevents the prohibited action.
- Impact:
  - Keyboard users can encounter inconsistent focus behavior or undiscoverable lock explanations.
  - Screen-reader semantics may not match the visual state.
  - Accessibility risk is concentrated in project-owned additions, so it can regress independently of upstream DSH accessibility.
- Recommendation:
  - Use an established accessible dialog primitive or implement focus containment, background inertness, labelled/described relationships, and robust close/focus restoration.
  - Expose locked menu items through the menu component's real disabled semantics if supported; otherwise present them as non-actionable descriptive rows with an accessible reason.
  - Trigger explanatory text on keyboard focus as well as pointer hover, or prefer persistent accessible descriptions over custom hover-only tooltips.
  - Add keyboard-only and screen-reader-oriented browser tests in the planning/implementation phase.
- Dependency/interaction with other audit domains:
  - A09 should own automated browser/a11y test integration once implementation begins.

#### A10-F05 — Responsive/mobile intent exists, but rendered behavior and production viewport compatibility are not validated by the current test approach
- ID: A10-F05
- Severity: P2
- Status: **CONFIRMED** for test coverage gap; live viewport outcome is **NOT VERIFIED**.
- Evidence:
  - `scripts/prepare-dsh-web.mjs`, `makersActionsHead`: custom chrome has container-query thresholds at 880 px and 360 px, overlap geometry checks, `ResizeObserver`, action-label compaction, and optional hiding of the powered-by element.
  - Same code depends on upstream layout class fragments and live geometry (`getBoundingClientRect`) to decide compaction.
  - `package.json` contains Node test tooling but no Playwright/Cypress browser dependency.
  - `tests/dsh-web.test.ts`, test `page chrome keeps GitHub, deploy, and a contact dialog`: asserts CSS/JS strings such as `@container dsh-center (max-width:880px)` and data attributes; it does not render desktop/mobile viewports.
- Technical analysis:
  - The implementation shows deliberate responsive design effort and should not be treated as absent.
  - String-contract tests can prove that responsive code is generated, but cannot prove that upstream header geometry, hit-testing, zoom, mobile viewport, focus visibility, touch target spacing, or modal layout works after composition.
  - Because placement depends on upstream internal DOM structure, rendered smoke tests provide disproportionate value here.
- Impact:
  - Mobile regressions can pass the current tests.
  - An upstream shell change can leave generated strings intact while changing actual composition enough to overlap or hide product chrome.
- Recommendation:
  - Add non-mutating browser smoke coverage at representative widths (for example phone, tablet, desktop) and at least one high-zoom/narrow-content case.
  - Assert visibility/overlap of model selector, permission selector, settings access, session/workspace chrome, injected GitHub/Deploy/Powered-by UI, and contact dialog.
  - Keep this as rendered verification; do not replace it with more source-string assertions.
- Dependency/interaction with other audit domains:
  - Cross-audit handoff to A09 for test/CI implementation and A12 for production black-box smoke ownership.

### P3
#### A10-F06 — Generated ownership is documented for `public/`, but root `index.html` and generated artifacts are not self-identifying
- ID: A10-F06
- Severity: P3
- Status: **CONFIRMED**
- Evidence:
  - `README.md` labels `public/` as generated.
  - `scripts/prepare-dsh-web.mjs` also writes root `index.html`, but the project-structure documentation does not equivalently mark root `index.html` as generated.
  - `.gitattributes` contains only `public/**/*.js whitespace=-trailing-space`; it does not mark generated frontend files for repository tooling/review.
  - Generated `index.html` and public assets do not contain a project-level “do not edit; generated by…” ownership marker beyond internal injection comments.
- Technical analysis:
  - The actual generated boundary is stronger than the documentation suggests: `public/` is replaced wholesale and root `index.html` is overwritten every preparation.
  - New contributors can reasonably assume root `index.html`, `public/manifest.webmanifest`, or `public/favicon.svg` are ordinary source files.
- Impact:
  - Low-severity maintenance churn and lost edits after regeneration.
  - Review noise when generated output is modified instead of the authoritative preparation/config source.
- Recommendation:
  - Document root `index.html` explicitly as generated.
  - In planning, consider generated-file markers/review metadata that do not interfere with the upstream shell or build process.
  - Establish the rule: product-owned source/config lives outside `public/`; generated output is reviewed for reproducibility but not hand-maintained.
- Dependency/interaction with other audit domains:
  - A08/A09 may own reproducibility/diff checks; A11 may own contributor documentation.

## 7. What is already good / should be preserved
1. **Fail-closed patching.** `mustReplace()` rejects unexpected upstream bundle text instead of silently producing a partially patched frontend. Although the current patch surface is too broad, this safety property is valuable.
2. **Clear generated `public/` concept.** The README already identifies the upstream-vendored shell as generated, and the script deterministically recreates it.
3. **Model selector is intentionally scoped.** `patchModelSelectionBundle` filters visible groups to `edgeone-makers` and contains explicit optimistic-selection logic rather than presenting unsupported providers as normal choices.
4. **Permission selector remains visible and explanatory.** Tests confirm the composer permission picker remains present and the copy is adapted to Makers sandbox semantics instead of simply hiding the control.
5. **Workspace simplification is intentional and tested.** The current UX presents a single Cloud Workspace and removes workspace switching/creation surfaces that do not fit the Makers session sandbox model.
6. **Settings persistence is consciously adapted.** Settings and model welcome state are forced to Host-backed persistence rather than memory-only behavior off loopback.
7. **Custom chrome includes several accessibility basics.** External links use `noopener noreferrer`; the navigation has an `aria-label`; decorative SVGs are `aria-hidden`; focus-visible outlines exist; the contact dialog has `role=dialog`, `aria-modal`, labelled title, Escape close, and focus return.
8. **Responsive intent is present.** Container queries, ResizeObserver, overlap checks, compact states, and a mobile hiding threshold show that narrow layouts were considered rather than ignored.
9. **Charset handling is defensive.** The preparation script preserves UTF-8 charset early in the head and `tests/dsh-web.test.ts` explicitly guards the first-1024-byte encoding requirement before Chinese injected copy.
10. **Functional restrictions have contract tests.** `tests/dsh-web.test.ts` guards model filtering, workspace simplification, permission copy, settings persistence, locale policy, chrome links/copy, session-log behavior, and generated plugin graph.

## 8. Gaps and NOT VERIFIED items
### NOT VERIFIED
1. **Production desktop rendering:** the known production URL could not be fetched/rendered from the available audit execution environment.
2. **Production mobile rendering:** no live mobile viewport could be opened; therefore overlap, truncation, touch layout, mobile navigation, and modal behavior are not verified against production.
3. **Production-to-base-SHA parity:** it is not verified that the current production URL is serving frontend assets generated from exact base SHA `70119cfdae992a203a5e29eb24e91c7200222a7c`.
4. **Keyboard end-to-end behavior:** no browser session was available to tab through custom chrome, locked preset menus, settings, model selector, permission selector, or contact dialog.
5. **Screen-reader behavior:** accessible-name/role/state announcements were not tested with assistive technology.
6. **WCAG color contrast:** computed production colors/contrast were not measured.
7. **Zoom/reflow:** 200%/400% zoom and small reflow behavior were not rendered.
8. **Test execution:** source tests were inspected, but the test suite was not executed because the temporary execution environment could not clone/resolve GitHub and no prepared dependency tree was available locally.
9. **Full upstream extension API:** this audit did not independently inspect every API/slot available in upstream DSH source beyond what is visible in the vendored/generated client and current patch code. Therefore recommendations favor known current low-conflict surfaces and call out where an upstream-supported extension should be preferred if available.

These gaps are the reason the verdict is not an unconditional PASS.

## 9. Recommended next actions — audit recommendation only
### Priority 1 — Establish a productization boundary before adding PQG UI
Create a planning design for a small hand-maintained PQG product configuration/source layer outside generated `public/`. It should own only cosmetic/product metadata: product name, short name, page title, favicon/logo source, custom links, and product-owned chrome copy.

Apply it after the upstream `dist` copy in the preparation pipeline. Do not edit generated `index.html`, `public/manifest.webmanifest`, `public/favicon.svg`, or hashed assets manually.

### Priority 2 — Reduce compiled-bundle patch surface
Inventory each `mustReplace` patch and classify it as:

- required transport/runtime compatibility;
- required functional product behavior;
- cosmetic/product copy;
- legacy/no longer needed.

Move cosmetic changes out first. For functional changes, investigate stable DSH slot/plugin APIs before retaining compiled text rewrites.

### Priority 3 — Design Vietnamese localization as a first-class feature
Do not implement Vietnamese as a few string replacements. Plan:

- locale ID `vi` in the locale service;
- Vietnamese option in Settings;
- dictionaries for required namespaces/components;
- fallback policy;
- product/browser/default precedence;
- `<html lang="vi">` synchronization;
- product chrome translation from the same active locale;
- translation completeness tests.

### Priority 4 — Keep model/permission/workspace changes separate from cosmetic PQG work
The following are functional behavior and should not be modified merely to rebrand:

- filtering to `edgeone-makers` models;
- optimistic model selection behavior;
- permission presets and Makers sandbox explanations;
- Host-backed settings persistence;
- single Cloud Workspace/session UX;
- preset lock/hide behavior.

Any change to these requires functional regression analysis, not just visual review.

### Priority 5 — Add rendered frontend smoke/a11y coverage
Add browser-level tests for desktop/mobile and keyboard interaction. Minimum coverage should include:

- initial locale and manual language selection;
- model selector;
- permission selector;
- Settings navigation;
- single Cloud Workspace/session UX;
- PQG custom chrome once introduced;
- contact dialog focus containment/close/restore;
- locked-state discoverability;
- overlap/reflow at narrow widths.

### Lowest-conflict extension points for requested productization
| Productization need | Recommended extension point | Conflict class |
|---|---|---|
| PQG name / title / short name | Product-owned config applied to shell/manifest after `cp(webDist, publicDir)` | Cosmetic; low-to-medium upstream sensitivity |
| PQG favicon/logo | Product-owned asset outside `public/`, copied into generated output after upstream copy | Cosmetic; low upstream sensitivity |
| Custom links | Project-owned `makersActionsHead`/custom chrome, preferably parameterized from product config | Cosmetic; relatively low upstream sensitivity |
| Product chrome wording | Same project-owned chrome copy table/config | Cosmetic; relatively low upstream sensitivity |
| Preset wording | Current `patchAgentPresetBundle` is the available in-repo point, but it is compiled-bundle sensitive; prefer a stable DSH locale/UI extension if upstream provides one | Functional/copy; high upstream sensitivity today |
| Vietnamese locale | Locale runtime + dictionaries across namespaces through a stable plugin/upstream extension; avoid HTML-only or chrome-only translation | Functional; high scope/upstream sensitivity |
| Model selector behavior | Existing `patchModelSelectionBundle`; do not mix with branding | Functional; high upstream sensitivity |
| Permission selector | Existing permission/conversation patches; do not mix with branding | Functional; high upstream sensitivity |
| Settings behavior | Existing settings/settings-models patches | Functional; high upstream sensitivity |
| Session/workspace UX | Existing conversation/workspace patches | Functional; high upstream sensitivity |

## 10. Handoff to planning phase
Planning should preserve the current working architecture while creating a cleaner productization seam.

Suggested planning decomposition:

1. **PQG cosmetic shell package/config** — no behavior changes.
2. **Vietnamese localization workstream** — explicitly functional, with translation ownership and completeness criteria.
3. **Upstream patch reduction workstream** — evaluate stable DSH extension surfaces and isolate compatibility shims.
4. **Accessibility hardening workstream** — custom dialog, locked controls, keyboard/focus behavior.
5. **Rendered smoke workstream** — desktop/mobile/zoom and production parity checks.

Required planning constraint: generated frontend outputs remain generated. No plan should treat `index.html` or `public/**` as the source-of-truth for manual product edits.

Cross-audit handoffs:
- A08/A09: upstream/dependency update mechanics, reproducibility, and automated test strategy.
- A11: attribution/licensing/documentation implications of changing DeepSeek/EdgeOne/Tencent branding and links.
- A12: live production desktop/mobile black-box verification and production-to-commit parity.

## 11. Appendix
### A. Cosmetic vs functional vs upstream-sensitive matrix
| Current change | Cosmetic productization | Functional UI | Upstream-sensitive |
|---|---:|---:|---:|
| Page title / PWA name / favicon | Yes | No | Low if applied post-copy; generated files themselves are overwrite-prone |
| Makers GitHub/Deploy/Contact chrome | Yes | Minor navigation behavior | Medium because placement uses upstream DOM class fragments |
| English/Chinese custom chrome copy | Yes | Locale presentation | Low/medium |
| Locale initialization rule | No | Yes | High — compiled locale bundle patch |
| Add full Vietnamese UI | No | Yes | High unless upstream/stable plugin extension exists |
| Model group filtering | No | Yes | High |
| Optimistic model selection/menu behavior | No | Yes | High |
| Permission descriptions/tooltips | Copy plus trust UX | Yes | High |
| Host-backed settings persistence | No | Yes | High |
| Hide onboarding/provider credential UI | No | Yes | High |
| Single Cloud Workspace presentation | No | Yes | High |
| Hide workspace management | No | Yes | High |
| Lock/hide agent presets | No | Yes | High |
| Session log download adaptation | No | Yes | High |

### B. Generated ownership rule for future contributors
**Edit the generator/config, not the generated frontend.** In particular:

- Do not hand-edit root `index.html`.
- Do not hand-edit `public/index.html`.
- Do not hand-edit `public/assets/**`.
- Do not hand-edit `public/plugins/**`.
- Do not hand-edit `public/favicon.svg` or `public/manifest.webmanifest` as the permanent source of a PQG customization.

Any desired persistent frontend customization must be expressed in a hand-maintained source/configuration or stable upstream extension and then regenerated.

### C. Severity summary
- P0: 0
- P1: 1 — A10-F01
- P2: 4 — A10-F02 through A10-F05
- P3: 1 — A10-F06

### D. Audit-only confirmation
This A10 branch/report introduces **no runtime/source changes**. The only intended branch difference from exact base SHA is this Markdown audit report.
