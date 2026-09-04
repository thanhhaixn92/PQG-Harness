# PQG-Harness Phase 2 — Execution Contract & Plan Self-Review Corrections

> **Mandatory:** Read this file together with the Phase 2 master index before executing any WP. This file resolves notation and interface ambiguities discovered during plan self-review. Where this file conflicts with an earlier WP example, **this file wins**.

## 1. Scope

This is a planning correction document only. It changes no runtime/source/configuration. It exists to ensure the WP plans are executable without guessing.

## 2. Dynamic evidence is not literal repository content

Some WP examples use angle-bracket notation to describe values that can only be known from the live EdgeOne/GitHub environment, such as a Preview URL, deployment ID, exact verification date, or observed access-control name.

**Execution rule:** never commit angle-bracket tokens such as `<preview-host>`, `<date>`, `<id>`, `<evidence>`, `<env>`, or `<control name>` literally. At execution time:

1. obtain the real value from the named authoritative source;
2. verify it;
3. write the exact observed value;
4. if the value cannot be verified, write `NOT VERIFIED` and keep the associated release gate open.

For shell commands that need the Preview URL, copy the exact EdgeOne Preview origin into a local shell variable and use the variable:

```bash
PREVIEW_URL='https://actual-preview-origin-copied-from-edgeone-console'
curl -fsS "$PREVIEW_URL/build-meta.json"
```

The quoted URL above is an execution-time local value, not text to commit to a plan/report unless it is the actual observed deployment URL.

For dates, use UTC-aware ISO 8601 generated at execution time:

```bash
date --iso-8601=seconds
```

For Git identity, never type a placeholder; derive it:

```bash
RELEASE_SHA="$(git rev-parse HEAD)"
RELEASE_TREE="$(git rev-parse 'HEAD^{tree}')"
```

## 3. WP2 correction — fake sandbox helper is mandatory

WP2's file map described `tests/helpers/fake-sandbox.ts` as optional. Normalize it to **required**.

Create:

```text
tests/helpers/fake-sandbox.ts
```

It owns reusable fake implementations for:

- `files.exists/makeDir/read/write`;
- `commands.run`;
- `persist`;
- `restore`;
- `getHost`;
- `getInfo`;
- `envdAccessToken` test value.

No test may use a real production sandbox to prove unit-level persistence state-machine behavior.

## 4. WP3 correction — exact lifecycle test interfaces

### 4.1 `SidecarStartDependencies`

Define the test seam explicitly in `agents/_dsh-web-sidecar.ts`:

```ts
interface SidecarStartDependencies {
  allocatePort(): Promise<number>
  startGateway(getContext: () => any, conversationId: string): Promise<LocalGatewayProxy>
  startMcp(getContext: () => any, conversationId: string): Promise<LocalMcpBridge>
  spawnChild(port: number, home: string, context: any): ChildProcess
  waitUntilReady(child: ChildProcess, port: number): Promise<void>
  createHostWorkspace(port: number, workspacePath: string): Promise<void>
}
```

Production defaults map exactly to existing behavior:

```ts
const defaultSidecarStartDependencies: SidecarStartDependencies = {
  allocatePort: freePort,
  startGateway: startLocalGatewayProxy,
  startMcp: startLocalMcpBridge,
  spawnChild: spawnDshWebChild,
  waitUntilReady: waitForReady,
  createHostWorkspace: async (port, workspacePath) => {
    await mkdir(workspacePath, { recursive: true })
    await callRpc(port, 'workspace.create', { path: workspacePath })
  },
}
```

Extract existing `spawn(...)` code into:

```ts
function spawnDshWebChild(port: number, home: string, context: any): ChildProcess
```

with the same args/env/stdio as the audited implementation.

### 4.2 Exact cleanup function

Replace any abbreviated `closeSidecarResources(...)` notation in WP3 with this signature:

```ts
async function closeSidecarResources(
  context: any,
  conversationId: string,
  home: string,
  child: ChildProcess,
  gateway: LocalGatewayProxy,
  mcp: LocalMcpBridge,
): Promise<void>
```

Behavior:

1. best-effort `snapshotDshSettingsYaml(context, conversationId, home)`;
2. terminate child with bounded TERM→KILL behavior;
3. close Gateway and MCP using `Promise.allSettled`;
4. never throw solely because settings snapshot failed;
5. report/retain close errors only through the structured lifecycle outcome used by Stop.

### 4.3 Exact stream-controller close helper

WP3 referenced `closeControllerSafely()` without defining it. Use:

```ts
function closeStreamController(controller: ReadableStreamDefaultController<Uint8Array>): void {
  try {
    controller.close()
  } catch {
    // already closed/cancelled
  }
}
```

All WP3 references to `closeControllerSafely()` mean `closeStreamController(controller)`.

### 4.4 Exact startup error strings

Where WP3 examples abbreviated `new Error(...)`, use stable messages:

```ts
throw new Error(`DSH sidecar exited during readiness with code ${String(child.exitCode)}`)
```

and for exhausted retries:

```ts
throw lastError instanceof Error
  ? lastError
  : new Error('DSH sidecar failed to start after 3 attempts')
```

## 5. WP4 correction — lock-integrity API naming and errors

Use one function name everywhere:

```js
export function lockPackageEntry(lock, name) {
  const entry = lock.packages?.[`node_modules/${name}`]
  if (typeof entry?.version !== 'string' || entry.version.length === 0) {
    throw new Error(`Could not resolve ${name} version from package-lock.json.`)
  }
  if (typeof entry?.integrity !== 'string' || entry.integrity.length === 0) {
    throw new Error(`Could not resolve ${name} integrity from package-lock.json.`)
  }
  return entry
}
```

Do not use a second spelling such as `packageLockEntry`.

`MODEL_COMPATIBILITY.md` is **required** in WP4 Task 7, not optional. It must distinguish `CONFIRMED` values from `NOT DOCUMENTED`; it must not invent provider limits.

When recording the EdgeOne Node verification in `PROJECT_STATUS.md`, use the exact deployment ID and ISO date read during execution. If they cannot be obtained, record:

```markdown
- EdgeOne build Node exact deployment evidence: NOT VERIFIED
```

and do not claim the Node pin has been operationally verified.

## 6. WP5 correction — exact build-meta schema

The angle-bracket strings shown in the WP5 schema are type descriptions, not values. `scripts/write-build-meta.mjs` must write real values derived from Git:

```js
{
  commit: git('rev-parse', 'HEAD'),
  tree: git('rev-parse', 'HEAD^{tree}'),
  packageVersion: pkg.version,
}
```

Validate with:

```js
const SHA40 = /^[0-9a-f]{40}$/
if (!SHA40.test(meta.commit)) throw new Error('Invalid Git commit SHA for build metadata.')
if (!SHA40.test(meta.tree)) throw new Error('Invalid Git tree SHA for build metadata.')
```

When `PROJECT_STATUS.md` records topology, write one factual bullet per observation. Do not use literal alternatives such as `enabled|disabled`; write the single observed state. If access policy cannot be inspected, write:

```markdown
- Agent access policy: NOT VERIFIED — stable/public release blocked
```

When Preview URL is required, use the local `PREVIEW_URL` procedure from §2.

## 7. WP6 correction — complete dialog focus-management skeleton

WP6 showed an abbreviated open-path. Use this complete state skeleton rather than an ellipsis:

```js
let dialogOpener = null
let inertTarget = null

const focusables = () => [...dialog.querySelectorAll(
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
)].filter((node) => node instanceof HTMLElement && !node.hidden)

const open = () => {
  dialogOpener = document.activeElement instanceof HTMLElement ? document.activeElement : more
  inertTarget = document.querySelector('#root')
  if (inertTarget instanceof HTMLElement && 'inert' in inertTarget) inertTarget.inert = true
  dialog.hidden = false
  const items = focusables()
  ;(items[0] || dialog.querySelector('.dsh-makers-contact-card'))?.focus?.()
}

const close = () => {
  dialog.hidden = true
  if (inertTarget instanceof HTMLElement && 'inert' in inertTarget) inertTarget.inert = false
  inertTarget = null
  const target = dialogOpener
  dialogOpener = null
  if (target?.isConnected) target.focus()
}

const onDialogKeydown = (event) => {
  if (dialog.hidden) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
    return
  }
  if (event.key !== 'Tab') return
  const items = focusables()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

dialog.addEventListener('keydown', onDialogKeydown)
```

Before using `.focus()` on `.dsh-makers-contact-card`, give the card `tabindex="-1"` in the generated markup so there is a deterministic fallback focus target.

## 8. WP7 correction — release evidence notation

Do not write literal:

```text
CLOSED — <evidence>
```

Instead, every master-finding row in release evidence must contain a concrete reference, for example one or more of:

- exact test name + green CI run URL/ID;
- exact Preview deployment ID + build SHA;
- exact file/symbol + commit SHA;
- exact Console control label + ISO verification date;
- exact smoke test ID + verification document path.

If evidence is unavailable, status remains `NOT VERIFIED`; it may not be replaced with prose confidence.

For release approval date, generate/record the real ISO date at approval time. Never commit `<date>`.

## 9. No-placeholder self-review rule for implementation agents

Before committing any Phase 2 plan-generated source/docs, run:

```bash
rg -n 'TBD|TODO|implement later|fill in details|<preview-host>|<deployment|<control name>|<env>|<evidence>|<date>' \
  --glob '!docs/audit/**' \
  --glob '!docs/superpowers/plans/**' \
  .
```

Expected: no new implementation/documentation placeholders. Existing third-party/generated source is outside this rule unless modified by the project.

## 10. Plan consistency check

The corrected Phase 2 execution contract is:

```text
WP0: safety rail / provenance / Preview workflow
WP1: fail-closed permissions / sensitive data / preview-token boundary / auth verification
WP2: native durable workspace + legacy migration
WP3: sidecar lifecycle / current context / stop/cancel
WP4: exact DSH intent / ws patch / native integrity / Gateway contract
WP5: deployed SHA / topology / live smoke / observability / rollback rehearsal
WP6: product config / locale policy / accessibility / evidence-based Vietnamese decision
WP7: security + architecture + runbook + release/license evidence
```

No source implementation begins merely because this plan exists. Owner approval of Phase 2 execution remains required.