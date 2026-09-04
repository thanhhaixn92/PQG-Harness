# PQG-Harness WP6 Productization, Vietnamese UX & Accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a maintainable PQG-owned product layer over the hardened upstream shell, remove hostname-driven Chinese defaults, improve custom chrome accessibility, and introduce Vietnamese only through a verified locale-extension path rather than proliferating fragile compiled-bundle patches.

**Architecture:** Product identity lives in a hand-maintained config outside generated `public/`. `prepare-dsh-web.mjs` applies product metadata after copying upstream assets. Core DSH locale selection remains limited to languages actually registered by the pinned DSH build; browser preference chooses among supported locales. Full Vietnamese is added only if the pinned runtime exposes a stable registration path that can be proven by a focused prototype; otherwise the product ships English core UI with a documented Vietnamese-localization deferral rather than a half-translated compiled fork.

**Tech Stack:** DSH Web generated shell, Node build script, browser DOM, CSS/ARIA, EdgeOne Preview.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M21, plus M12/M19 generated-boundary constraints.

## Global Constraints

- Do not hand-edit generated `public/`, generated root `index.html`, or vendored plugin files.
- Do not put cosmetic branding inside model/workspace/permission compatibility patches.
- Preserve upstream attribution and licensing links in a separate About/Attribution surface.
- Product name in this plan is exactly `PQG Harness`; do not invent an expansion of `PQG`.
- Do not invent a full Vietnamese translation by machine-substituting compiled strings.
- No logo/font asset is invented in this WP. Keep the existing favicon until the owner supplies/approves a PQG visual asset; product naming can still be completed independently.

---

## File map

**Create:**
- `config/product.mjs` — PQG product metadata/copy/link source-of-truth.
- `tests/product-config.test.ts` — product metadata generation contract.
- `docs/localization/vi-status.md` — factual Vietnamese coverage/extension decision.

**Modify:**
- `scripts/prepare-dsh-web.mjs` — read product config; post-copy title/manifest; browser-language locale fallback; accessible custom chrome.
- `tests/dsh-web.test.ts` — generated contracts for branding/locale/a11y.
- `README.md` and optionally `README_zh.md` only after product identity is stable.
- `package.json` metadata after A11 attribution rules are preserved.

---

### Task 1: Create one product-owned metadata source

**Files:**
- Create: `config/product.mjs`
- Create: `tests/product-config.test.ts`

**Interfaces:**

```js
export const product = Object.freeze({
  name: 'PQG Harness',
  shortName: 'PQG',
  repositoryUrl: 'https://github.com/thanhhaixn92/PQG-Harness',
  upstreamAdapterUrl: 'https://github.com/TencentEdgeOne/deepseek-harness',
  upstreamCoreUrl: 'https://github.com/deepseek-ai/deepseek-harness',
})
```

Custom chrome copy is also product-owned:

```js
export const productCopy = Object.freeze({
  en: { source: 'Source', preview: 'Preview', deploy: 'Deploy', about: 'About' },
  zh: { source: '源码', preview: '预览', deploy: '部署', about: '关于' },
})
```

Do not add `vi` here until Task 4 decides the locale architecture; avoid claiming full Vietnamese coverage from a few labels.

- [ ] **Step 1: Write test**

Assert product name/shortName/local canonical repository and both upstream attribution URLs are present and immutable enough for import.

- [ ] **Step 2: Create config and run test**

```bash
node --experimental-strip-types --test tests/product-config.test.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add config/product.mjs tests/product-config.test.ts
git commit -m "feat: add PQG product configuration"
```

---

### Task 2: Apply PQG metadata only after upstream assets are copied

**Files:**
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`

**Interfaces:**
- Generated `index.html` title = `PQG Harness`.
- Generated `public/manifest.webmanifest` `name=PQG Harness`, `short_name=PQG`.
- Existing favicon remains intentionally unchanged until approved brand asset exists.

- [ ] **Step 1: Add failing generated-output assertions**

After preparation:

```ts
assert.match(indexHtml, /<title>PQG Harness<\/title>/)
const manifest = JSON.parse(await readFile('public/manifest.webmanifest', 'utf8'))
assert.equal(manifest.name, 'PQG Harness')
assert.equal(manifest.short_name, 'PQG')
```

Also assert direct generated output still contains upstream attribution where the product's About/Source links require it.

- [ ] **Step 2: Import `product` into producer script**

```js
import { product, productCopy } from '../config/product.mjs'
```

- [ ] **Step 3: Add a post-copy manifest writer**

After `cp(webDist, publicDir, ...)`:

```js
const manifestPath = join(publicDir, 'manifest.webmanifest')
const webManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
webManifest.name = product.name
webManifest.short_name = product.shortName
await writeFile(manifestPath, JSON.stringify(webManifest, null, 2) + '\n')
```

- [ ] **Step 4: Replace page title in generated shell through a guarded transformation**

Use `mustReplace` against the upstream published title and `product.name`; do not hand-edit generated HTML afterward.

- [ ] **Step 5: Use local canonical repo for primary Source link, keep upstream in About copy**

Primary GitHub/Source action should use `product.repositoryUrl`. The contact/about dialog should include plain links or text to `product.upstreamAdapterUrl` and `product.upstreamCoreUrl`, preserving attribution.

- [ ] **Step 6: Run prepare + drift review**

```bash
npm run prepare:dsh-web
npm run test:prepared
npm run build:prepared
```

Review generated diff to ensure metadata changes only occur through the producer.

- [ ] **Step 7: Commit source + generated output according to repository convention**

```bash
git add config/product.mjs scripts/prepare-dsh-web.mjs tests/dsh-web.test.ts index.html public
git commit -m "feat: apply PQG product metadata"
```

---

### Task 3: Remove hostname-driven Chinese default and use browser preference among actually shipped locales

**Files:**
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`

**Interfaces:**
- Pinned DSH currently ships `zh` and `en` only.
- Browser primary `zh` => `zh`; all other browser languages, including Vietnamese, => `en` until full `vi` registration exists.
- Persisted/Host locale still overrides provisional initial selection according to DSH runtime behavior.

- [ ] **Step 1: Replace old hostname source-contract test with behavior contract**

Generated locale patch must contain browser-language detection and must **not** contain `.edgeone.dev` hostname routing.

- [ ] **Step 2: Change `patchLocaleBundle()` provisional resolver**

Use:

```js
function resolveInitialLocale() {
  if (typeof window === 'undefined') return 'en'
  const tags = [...navigator.languages ?? [], navigator.language]
  return tags.some(tag => String(tag || '').toLowerCase().split('-')[0] === 'zh') ? 'zh' : 'en'
}
```

Keep HTML `lang` synchronized to the active runtime locale.

- [ ] **Step 3: Make custom Makers chrome follow document language, not hostname**

Delete the independent `intl = location.hostname.endsWith(...)` locale decision. `localeOf()` should derive only from `document.documentElement.lang` and fall back to `en` if unsupported.

Keep host-dependent deploy/contact URLs separate from locale selection if EdgeOne requires different global/China destinations; link routing is not language routing.

- [ ] **Step 4: Run tests**

```bash
npm run prepare:dsh-web
npm run test:prepared
```

Expected: no generated source test asserts `.edgeone.dev` language default; en/zh behavior contract passes.

- [ ] **Step 5: Commit**

```bash
git add scripts/prepare-dsh-web.mjs tests/dsh-web.test.ts index.html public
git commit -m "fix: choose supported locale from browser preference"
```

---

### Task 4: Make an evidence-based Vietnamese locale decision

**Files:**
- Create: `docs/localization/vi-status.md`
- Potential source modifications only if the stable-extension branch below passes.

- [ ] **Step 1: Inspect the exact pinned DSH locale runtime/package APIs**

At the installed `0.1.0-rc.6` wave, identify:
- how locale IDs are registered;
- how package namespace dictionaries are registered;
- whether an external client plugin can add `vi` and dictionaries without rewriting each compiled package;
- whether Settings locale selector reads the runtime registry dynamically.

Use package source/types/docs from the exact installed wave and current official upstream source. Record exact symbols/files in `docs/localization/vi-status.md`.

- [ ] **Step 2: Apply this decision rule**

**Branch A — Stable external registration exists:** create a separate implementation plan/PR for a product-owned `@pqg/locale-vi` client plugin. That plugin must register `vi` plus complete dictionaries for every namespace visible in the shipped UI. Translation files are hand-reviewed Vietnamese resources, not compiled-string replacements. Add `vi` only after a namespace completeness test proves no shipped key falls back unexpectedly for the targeted screens.

**Branch B — No stable external registration exists:** do **not** add dozens of `mustReplace` translation patches. Keep core UI English for Vietnamese browsers, record `Full Vietnamese UI: deferred pending stable locale extension/upstream support`, and localize only future PQG-owned UI surfaces when they do not falsely imply the whole app is Vietnamese.

This decision is intentional and is the complete output of Task 4 if Branch B applies; it is not a placeholder.

- [ ] **Step 3: Commit the evidence record**

```bash
git add docs/localization/vi-status.md
git commit -m "docs: record Vietnamese locale extension decision"
```

---

### Task 5: Fix custom dialog keyboard/focus semantics

**Files:**
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`

**Interfaces:**
- Dialog traps Tab/Shift+Tab while open.
- Page content outside dialog becomes inert where supported.
- Escape/overlay close returns focus to opener.
- Focus behavior is restored on close.

- [ ] **Step 1: Add source-contract assertions for explicit accessibility logic**

Assert generated chrome includes:
- `focusable` selector;
- Tab/Shift+Tab cycle;
- `inert` handling;
- Escape close;
- opener focus restoration.

These remain source contracts until rendered smoke runs in Task 7.

- [ ] **Step 2: Add focus trap implementation**

On open:

```js
const previousActive = document.activeElement
const appRoot = document.querySelector('#root')
if (appRoot && 'inert' in appRoot) appRoot.inert = true
...
```

Use a helper returning visible enabled focusables inside `.dsh-makers-contact-card`:

```js
'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'
```

Handle `keydown` while dialog open:
- Escape closes;
- Tab on last → first;
- Shift+Tab on first → last.

On close, clear inert and focus the saved opener if still connected.

- [ ] **Step 3: Run preparation/tests**

```bash
npm run prepare:dsh-web
npm run test:prepared
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-dsh-web.mjs tests/dsh-web.test.ts index.html public
git commit -m "fix: harden Makers dialog keyboard behavior"
```

---

### Task 6: Make locked-item explanations keyboard discoverable

**Files:**
- Modify: `scripts/prepare-dsh-web.mjs`
- Modify: `tests/dsh-web.test.ts`

- [ ] **Step 1: Add focus-based tooltip trigger**

The existing tooltip host discovery already resolves `[data-tip]`. Add:

```js
document.addEventListener('focusin', event => {
  const host = hostOf(event.target)
  if (host) show(host)
})
document.addEventListener('focusout', hide)
```

- [ ] **Step 2: Prefer real disabled semantics where the upstream component supports them**

Inspect the exact pinned component input shape. If `disabled` is a supported field for menu rows, use it and attach the reason through accessible description. If not supported, preserve selection guard but ensure the locked row is focusable/described consistently. Do not invent unsupported props.

- [ ] **Step 3: Run tests**

```bash
npm run prepare:dsh-web
npm run test:prepared
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/prepare-dsh-web.mjs tests/dsh-web.test.ts index.html public
git commit -m "fix: expose locked-state help to keyboard users"
```

---

### Task 7: Rendered Preview verification at representative viewports

**Files:**
- No source changes unless defects are observed and separately fixed.

- [ ] **Step 1: Deploy WP6 branch to EdgeOne Preview**

Verify `/build-meta.json` matches branch HEAD.

- [ ] **Step 2: Test viewports**

At minimum:
- 390×844 phone;
- 768×1024 tablet;
- 1440×900 desktop;
- desktop browser zoom 200%;
- narrow content/side rail open state.

- [ ] **Step 3: Verify**

For each viewport:
- title says PQG Harness;
- source/preview/deploy actions do not overlap selectors;
- model selector usable;
- permission selector usable;
- session/workspace navigation usable;
- dialog opens, traps focus, Escape closes, focus returns;
- locked state reason discoverable by keyboard;
- no critical console errors.

- [ ] **Step 4: Locale smoke**

Browser language `vi-VN`: core UI must not default to Chinese. Expected core language is English unless Task 4 Branch A fully implemented Vietnamese. Browser language `zh-CN`: Chinese. Browser language `en-US`: English.

- [ ] **Step 5: Record screenshots/evidence outside generated source**

Use verification documentation or PR attachments; do not commit private browser/session data.

---

### Task 8: Align repository/product metadata after attribution review

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Preserve: `LICENSE`

- [ ] **Step 1: README first section**

Make the first lines state:

```markdown
# PQG Harness

PQG Harness is a project derived from the TencentEdgeOne DeepSeek Harness adapter and the DeepSeek Harness ecosystem. It keeps the upstream architecture while adding PQG-specific hardening and product behavior.
```

Link `UPSTREAM.md` and preserve upstream project links/license attribution.

- [ ] **Step 2: Update package identity without pretending to publish an npm package**

Because `private:true`, set:

```json
"name": "pqg-harness",
"description": "PQG Harness on EdgeOne Makers, derived from the TencentEdgeOne DeepSeek Harness adapter.",
"repository": {
  "type": "git",
  "url": "git+https://github.com/thanhhaixn92/PQG-Harness.git"
}
```

Do not remove MIT license or upstream provenance documentation.

- [ ] **Step 3: Run full quality sequence**

```bash
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api || true
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Generated diff is expected only if producer changes from this WP have not yet been committed; after regeneration/commit the clean-tree check must pass.

- [ ] **Step 4: Commit**

```bash
git add README.md package.json package-lock.json
git commit -m "docs: establish PQG Harness product identity"
```

---

## WP6 acceptance criteria

- [ ] Product name/repository metadata has one source-of-truth and generated output is reproducible.
- [ ] Generated files are never hand-maintained.
- [ ] Vietnamese browsers no longer default to Chinese.
- [ ] Full Vietnamese is added only through a proven stable extension path; otherwise English-core deferral is explicitly documented.
- [ ] Dialog is keyboard-modal and restores focus.
- [ ] Locked-state reasons are discoverable with keyboard focus.
- [ ] Phone/tablet/desktop/200% zoom Preview smoke passes.
- [ ] Upstream attribution/licensing is preserved.

## Rollback

Product config/metadata, locale default, accessibility changes and repository metadata are separate commits. If a product chrome change breaks an upstream layout, revert that product-layer commit only; do not weaken runtime security/durability changes or edit generated bundles directly.