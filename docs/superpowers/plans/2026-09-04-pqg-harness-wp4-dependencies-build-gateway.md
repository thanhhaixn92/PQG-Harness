# PQG-Harness WP4 Dependencies, Build & Gateway Compatibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply only low-blast-radius dependency/build hardening, make DSH version intent explicit, verify native tarball integrity, and tighten Gateway privacy/error behavior without performing a DSH platform upgrade.

**Architecture:** Preserve the currently working `0.1.0-rc.6` DSH runtime wave and EdgeOne build sequence. Convert DSH manifest intent to exact pins, patch `ws` inside the same 8.21 line, add lock-integrity verification for exceptional native restores, pin an exact EdgeOne-tested Node version only after Preview verification, and separate verified Gateway contract decisions from unverified model/provider assumptions.

**Tech Stack:** npm lockfile v3, Node.js 24, EdgeOne Makers build runtime, OpenAI-compatible Gateway, DeepSeek Harness.

**Spec:** `docs/audit/phase-1/PHASE-1B-coordinator-consolidation.md` — M11, M12, M14, M15, M18.

## Global Constraints

- **No DSH feature/version upgrade in this WP.** All direct `@deepseek-ai/dsh-*` dependencies remain `0.1.0-rc.6`.
- Do not jump to Vite 8, TypeScript 7, OTel 2.x, MCP SDK 1.30, or Zod 4.5 merely for freshness.
- Preserve `build:makers` and the second Linux/x64 install until equivalent packaging is proven.
- Preserve fail-fast frontend/runtime patching.
- Any Gateway header whose authoritative semantics remain unknown is not silently deleted on `main`; resolve it in Preview first.
- Never expose API keys in test output/logs.

---

## File map

**Modify:**
- `package.json`
- `package-lock.json`
- `scripts/restore-host-frontend-natives.mjs`
- `agents/_gateway-proxy.ts`
- `agents/_dsh-web-sidecar.ts` only if a verified model-compat change is justified.
- `edgeone.json` only after exact Node verification.
- `.env.example` only for explicitly introduced non-secret Gateway policy toggles.

**Create:**
- `scripts/lib/lock-integrity.mjs`
- `tests/lock-integrity.test.ts`
- `tests/dependency-contract.test.ts`
- expand `tests/gateway-proxy.test.ts`
- optional `MODEL_COMPATIBILITY.md` if provider limits cannot be encoded from authoritative machine-readable data.

---

### Task 1: Make the current DSH wave exact in the manifest without upgrading it

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `tests/dependency-contract.test.ts`

**Interfaces:**
- Every direct package whose name is `@deepseek-ai/dsh` or starts `@deepseek-ai/dsh-` resolves to exactly `0.1.0-rc.6` in both root manifest intent and installed lock entry.

- [ ] **Step 1: Write the failing contract test**

```ts
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'))

const directDsh = Object.entries(pkg.dependencies)
  .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))

test('direct DSH family is pinned to the reviewed rc.6 wave', () => {
  assert.ok(directDsh.length > 20)
  for (const [name, version] of directDsh) {
    assert.equal(version, '0.1.0-rc.6', `${name} manifest intent`)
    assert.equal(lock.packages[`node_modules/${name}`]?.version, '0.1.0-rc.6', `${name} lock version`)
  }
})
```

- [ ] **Step 2: Run and verify failure**

```bash
node --experimental-strip-types --test tests/dependency-contract.test.ts
```

Expected: FAIL on current caret-declared DSH packages.

- [ ] **Step 3: Convert only direct DSH caret specs to exact `0.1.0-rc.6`**

Do not change Cordis, MCP, OTel, ws, zod, Vite, TypeScript or native packages in this task.

Use a deterministic script rather than manual editing:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs'
const path = 'package.json'
const pkg = JSON.parse(fs.readFileSync(path, 'utf8'))
for (const name of Object.keys(pkg.dependencies)) {
  if (name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-')) {
    pkg.dependencies[name] = '0.1.0-rc.6'
  }
}
fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + '\n')
NODE
npm install --package-lock-only --ignore-scripts
```

- [ ] **Step 4: Confirm no DSH package version moved**

```bash
node --experimental-strip-types --test tests/dependency-contract.test.ts
git diff -- package.json package-lock.json
```

Expected: root spec changes from caret to exact; locked DSH package versions remain `0.1.0-rc.6`.

- [ ] **Step 5: Run quality sequence**

```bash
npm ci
npm run prepare:dsh-web
git diff --exit-code -- index.html public agents/api
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/dependency-contract.test.ts
git commit -m "chore: pin reviewed DSH dependency wave"
```

---

### Task 2: Apply the targeted `ws` 8.21.x hardening patch

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tests/dependency-contract.test.ts`

**Interfaces:**
- Target audited patch: `ws@8.21.3`.
- No other dependency version is intentionally changed.

- [ ] **Step 1: Extend contract test before changing package**

```ts
test('ws is at the reviewed hardened 8.21 patch', () => {
  assert.equal(lock.packages['node_modules/ws']?.version, '8.21.3')
})
```

- [ ] **Step 2: Verify test fails**

```bash
node --experimental-strip-types --test tests/dependency-contract.test.ts
```

Expected: FAIL because lock currently contains `8.21.0` at the audited baseline.

- [ ] **Step 3: Update only ws**

```bash
npm install --save-exact ws@8.21.3
```

Then inspect:

```bash
git diff -- package.json package-lock.json
```

Expected: only `ws` root/lock resolution plus lock metadata needed for that update. If npm changes unrelated package versions, stop and reset this task; do not accept incidental churn.

- [ ] **Step 4: Run adapter boundary tests**

```bash
npm run prepare:dsh-web
npm run typecheck
npm run test:prepared
npm run build:prepared
```

Additionally run the WP3 SSE/sidecar tests explicitly:

```bash
node --experimental-strip-types --test tests/proxy-stream.test.ts tests/sidecar-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/dependency-contract.test.ts
git commit -m "fix: update ws memory hardening patch"
```

---

### Task 3: Verify exceptional native tarballs against committed lock integrity

**Files:**
- Create: `scripts/lib/lock-integrity.mjs`
- Create: `tests/lock-integrity.test.ts`
- Modify: `scripts/restore-host-frontend-natives.mjs`

**Interfaces:**

```js
export function verifySubresourceIntegrity(bytes, integrity) // throws on mismatch
export function lockPackageEntry(lock, name) // returns {version, integrity, resolved}
```

- [ ] **Step 1: Write failing integrity tests**

```ts
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import test from 'node:test'
import { verifySubresourceIntegrity } from '../scripts/lib/lock-integrity.mjs'

const bytes = Buffer.from('known tarball bytes')
const digest = createHash('sha512').update(bytes).digest('base64')

test('lock integrity accepts matching sha512', () => {
  assert.doesNotThrow(() => verifySubresourceIntegrity(bytes, `sha512-${digest}`))
})

test('lock integrity rejects mismatched bytes', () => {
  assert.throws(() => verifySubresourceIntegrity(Buffer.from('changed'), `sha512-${digest}`), /integrity/i)
})
```

- [ ] **Step 2: Implement SRI verifier**

Use Node `crypto`, support whitespace-separated SRI candidates, and require at least one supported `sha512`, `sha384`, or `sha256` candidate to match. Throw if the lock entry has no integrity for a package restored through this exceptional path.

- [ ] **Step 3: Change native package lookup from version-only to full lock entry**

Replace `packageVersion(name)` with:

```js
function packageLockEntry(name) {
  const entry = lock.packages?.[`node_modules/${name}`]
  if (typeof entry?.version !== 'string' || !entry.version) throw new Error(...)
  if (typeof entry?.integrity !== 'string' || !entry.integrity) throw new Error(...)
  return entry
}
```

- [ ] **Step 4: Verify tarball before extraction**

After `npm pack` returns the file, read its bytes:

```js
const entry = packageLockEntry(name)
const tarballPath = join(scratch, filename)
const bytes = await readFile(tarballPath)
verifySubresourceIntegrity(bytes, entry.integrity)
```

Only after verification may the destination be removed/extracted.

- [ ] **Step 5: Run tests and native preparation in a safe build environment**

```bash
node --experimental-strip-types --test tests/lock-integrity.test.ts
npm run typecheck
npm run prepare:makers-runtime
```

Expected: verifier tests PASS and native preparation exits 0. Do not run this on a production filesystem; it operates in the build checkout/node_modules.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/lock-integrity.mjs scripts/restore-host-frontend-natives.mjs tests/lock-integrity.test.ts
git commit -m "fix: verify restored native package integrity"
```

---

### Task 4: Pin an exact EdgeOne-tested Node 24 version only after Preview proof

**Files:**
- Modify: `edgeone.json` only if the target is currently supported.
- Modify: `PROJECT_STATUS.md`

**Interfaces:**
- Planned target: `24.18.0`, because A07 observed it in the official pre-installed Node list at audit time.

- [ ] **Step 1: Re-check current EdgeOne Build Guide before editing**

Pass condition: current official docs still list `24.18.0` as a pre-installed/supported build Node version.

If the exact version is no longer supported, **do not change `edgeone.json` in this task**. Record `Node exact pin deferred — 24.18.0 no longer documented` in the PR and continue with current `24` until a supported exact 24.x is selected by a new reviewed plan.

- [ ] **Step 2: If supported, edit exactly one field**

```json
"nodeVersion": "24.18.0"
```

Do not change `engines.node` in this task; it already accepts Node 24.

- [ ] **Step 3: Push to Preview and inspect build log**

Pass criteria:
- build log reports Node `24.18.0`;
- both npm install phases succeed;
- native Sharp/libvips/Koffi assertions succeed;
- `build:makers` completes;
- UI/sidecar smoke passes.

- [ ] **Step 4: Update `PROJECT_STATUS.md` with non-secret evidence**

```markdown
- EdgeOne build Node: `24.18.0` — verified in Preview build <deployment id/date>
```

- [ ] **Step 5: Commit if and only if Preview passed**

```bash
git add edgeone.json PROJECT_STATUS.md
git commit -m "chore: pin verified EdgeOne Node runtime"
```

If Preview fails specifically because of the exact Node selection, revert the field and do not force the pin.

---

### Task 5: Minimize Gateway public error/header exposure

**Files:**
- Modify: `agents/_gateway-proxy.ts`
- Modify: `agents/api/_proxy.ts`
- Modify: `tests/gateway-proxy.test.ts`
- Create: `tests/proxy-error-policy.test.ts`

**Interfaces:**

Gateway response allowlist:

```ts
const GATEWAY_RESPONSE_HEADERS = new Set([
  'content-type',
  'cache-control',
  'retry-after',
  'x-request-id',
])
```

Public errors expose stable code, not raw exception message.

- [ ] **Step 1: Write tests for header filtering and stable errors**

Extract/test:

```ts
export function gatewayResponseHeaders(headers: Headers): Headers
export function publicError(code: string): { error: string }
```

Assert `authorization`, `server`, arbitrary provider diagnostics are not returned; allowed headers remain.

- [ ] **Step 2: Implement allowlist in Gateway proxy**

Copy only allowlisted headers. Preserve `content-type: text/event-stream` so streaming still works.

- [ ] **Step 3: Redact exception bodies**

Gateway catch becomes:

```ts
console.warn('[gateway] request failed:', error instanceof Error ? error.name : 'unknown')
if (!response.headersSent) response.writeHead(502, { 'content-type': 'application/json' })
response.end(JSON.stringify({ error: 'AI_GATEWAY_PROXY_FAILED' }))
```

Host proxy public catch similarly returns only:

```ts
{ error: 'DSH_WEB_PROXY_FAILED' }
```

Do not log request body, API key, tokenized preview URL, or full prompt.

- [ ] **Step 4: Keep binary/session-specific required headers**

Do not apply the Gateway header allowlist blindly to `/api/session.export`; preserve the existing explicit ZIP/stream/cache headers in Host proxy.

- [ ] **Step 5: Run tests**

```bash
node --experimental-strip-types --test tests/gateway-proxy.test.ts tests/proxy-error-policy.test.ts
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agents/_gateway-proxy.ts agents/api/_proxy.ts tests/gateway-proxy.test.ts tests/proxy-error-policy.test.ts
git commit -m "fix: minimize gateway error and header exposure"
```

---

### Task 6: Resolve `x-prompt-log` and `x-gateway-quota-bypass` contract before changing defaults

**Files:**
- Modify: `agents/_gateway-proxy.ts`, `.env.example`, docs only after authoritative evidence.

- [ ] **Step 1: Obtain authoritative EdgeOne semantics**

Acceptable evidence:
- current official EdgeOne documentation explicitly describing each header; or
- written EdgeOne support/platform owner guidance that can be retained in project operations documentation.

Search/blog inference from header names is not sufficient.

- [ ] **Step 2: Apply deterministic decision for `x-prompt-log`**

If authoritative evidence says it **enables optional prompt retention/logging**, introduce:

```env
AI_GATEWAY_PROMPT_LOG=false
```

and send the header only when explicitly true:

```ts
if (envValue(context, 'AI_GATEWAY_PROMPT_LOG') === 'true') {
  headers['x-prompt-log'] = 'true'
}
```

Default must be privacy-preserving false.

If authoritative evidence says it is required internal plumbing with no prompt persistence effect, keep it and add a code comment/reference. If semantics remain unverified, keep the existing behavior on the current compatibility branch but block confidential/stable release in `PROJECT_STATUS.md`; do not guess.

- [ ] **Step 3: Apply deterministic decision for `x-gateway-quota-bypass`**

If Makers-only and required, send it only when the configured `AI_GATEWAY_BASE_URL` matches the documented Makers Gateway origin/pattern. If optional/unnecessary, remove it. If still undocumented, preserve current compatibility behavior and keep the release gate open.

- [ ] **Step 4: Add tests for whichever verified contract is adopted**

Test header presence/absence from pure header-construction logic; never send a real model request from unit tests.

- [ ] **Step 5: Commit only evidence-backed behavior**

Use commit message:

```bash
git commit -m "fix: apply documented Makers gateway header policy"
```

If no authoritative evidence exists, there is no source commit for this task; only `PROJECT_STATUS.md`/release-gate evidence is updated.

---

### Task 7: Document model compatibility rather than inventing unsupported limits

**Files:**
- Create: `MODEL_COMPATIBILITY.md`
- Modify `agents/_dsh-web-sidecar.ts` only for values backed by authoritative evidence.

- [ ] **Step 1: Build the evidence table**

For every current Makers model ID list:
- model ID;
- source URL/date;
- context window if documented;
- max output if documented;
- developer-role support if documented;
- reasoning compatibility if documented;
- status `CONFIRMED` or `NOT DOCUMENTED`.

- [ ] **Step 2: Do not replace unknown values with guessed smaller numbers**

If per-model limits remain undocumented, retain current compatibility constants temporarily and mark them as adapter compatibility assumptions, not factual provider capabilities. Stable BYOK/vendor expansion remains gated.

- [ ] **Step 3: For any authoritative per-model value, write a failing serialization test first**

Then update `MAKERS_MODELS` to include explicit fields:

```ts
{ id, name, contextWindow, maxTokens, supportsDeveloperRole, ... }
```

and make `modelYaml()` render those fields rather than unconditional globals.

- [ ] **Step 4: Treat `developer -> system` the same way**

Preserve current rewrite for the current Makers compatibility path until provider-specific evidence/config is available. Do not globally remove it merely because newer providers may support `developer`.

- [ ] **Step 5: Commit documentation separately from any evidence-backed code change**

```bash
git add MODEL_COMPATIBILITY.md
git commit -m "docs: record Makers model compatibility evidence"
```

---

## WP4 acceptance criteria

- [ ] DSH direct dependencies are exact `0.1.0-rc.6`; no DSH package upgraded.
- [ ] `ws` is exactly `8.21.3` and adapter tests pass.
- [ ] Exceptional native restore verifies lockfile SRI before extraction.
- [ ] Node exact pin is adopted only after current official support + Preview build proof.
- [ ] Gateway public errors/headers are minimized without breaking SSE/export.
- [ ] Custom Gateway header policy is changed only with authoritative evidence; unresolved semantics remain an explicit release gate.
- [ ] Provider/model limits are not fabricated.
- [ ] Vite/TS/OTel/MCP/Zod major/minor refreshes are not mixed into this WP.

## Rollback

Dependency tasks must be revertible independently: DSH exact-spec change, ws patch, native-integrity check, and Node pin are separate commits. A failed DSH compatibility upgrade is outside this WP entirely and must not be “fixed” by weakening `mustReplace()` guards.