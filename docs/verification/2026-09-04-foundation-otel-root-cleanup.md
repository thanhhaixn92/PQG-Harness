# Foundation Root OpenTelemetry Cleanup — 2026-09-04

## Scope

This follow-up stays inside Foundation Core. It does not upgrade the DeepSeek Harness `0.1.0-rc.6` wave, does not use `npm audit fix --force`, does not change PQG runtime/product behavior, and does not start a business module.

It is reconciled on top of the already-merged transitive parser refresh at integration commit `aa8dd144ba0576834ac46970b12fe4f5a6cb03ee`.

## Starting dependency state

The preceding transitive refresh moved:

```text
fast-uri: 3.1.5 -> 3.1.7
qs:       6.15.3 -> 6.16.0
```

and reduced `npm audit` to:

```text
12 findings
10 moderate
2 high
0 critical
```

All 12 remaining findings were in the root direct OpenTelemetry `1.30.x` / `0.55.x` dependency wave. npm proposed semver-major `2.x` / `0.222.x` remediation.

A PQG-owned source usage probe found no import from `@opentelemetry/*`, no `JaegerPropagator`, no `OTEL_PROPAGATORS`, and no explicit global propagator registration. The pinned DSH rc.6 graph retains its own nested, newer telemetry packages; this change removes only the redundant root wave carried by the baseline manifest.

## TDD RED

A permanent dependency contract was added first:

```text
unused root OpenTelemetry stack is not carried as direct dependencies
```

RED evidence:

```text
commit: 1dd42744949711f7a464b761f0d48365ccfab27d
quality run: 33894591865
result: FAILURE as expected
```

The run passed install, DSH preparation, generated drift guard, and typecheck. Test summary:

```text
90 tests
89 pass
1 fail
```

The single failure was the new root-OpenTelemetry contract. The existing `fast-uri >= 3.1.7` and `qs >= 6.16.0` contract remained green.

## Remediation

The 17 root direct `@opentelemetry/*` dependencies were removed from `package.json`.

The lockfile was reconciled semantically against the already-merged transitive-refresh lockfile rather than accepting a broad npm metadata rewrite. A temporary guarded workflow was used only to create the lockfile commit and was deleted before final verification.

Guard properties:

- desired package-node set came from the previously demonstrated audit-zero cleanup candidate;
- metadata for every package node common to the current integration tree was preserved;
- package additions were forbidden;
- removals were allowed only for reviewed old OpenTelemetry nodes and their explicit helper-node set;
- `npm ci` had to succeed;
- `npm audit` total had to be zero before the workflow could commit.

Reconcile evidence:

```text
run: 33894812422
LOCK_ADDITIONS: []
lockfile commit: af71d5d04c1274ed27182fde9a14a62825e60a75
lockfile change: 670 deletions, 0 additions
```

The removed helper nodes were dependencies used only by the eliminated root instrumentation wave (`@types/shimmer`, `acorn`, `acorn-import-attributes`, `cjs-module-lexer`, `import-in-the-middle`, `is-core-module`, `module-details-from-path`, `path-parse`, `require-in-the-middle`, `resolve`, `shimmer`, and `supports-preserve-symlinks-flag`).

The guarded install/audit result was:

```text
added 562 packages
563 packages audited
0 vulnerabilities
```

Newer telemetry packages still required by the DSH graph remain in the lockfile; this is not a blanket removal of telemetry support.

## Clean GREEN evidence

The temporary reconcile workflow was deleted before the final candidate.

```text
clean candidate: b3bf346c71c041d113f4bcbf86117ae800afec79
quality run: 33894930007
result: SUCCESS
```

Fresh quality completed:

```text
npm ci: SUCCESS
prepare:dsh-web: SUCCESS
generated drift guard: SUCCESS
typecheck: SUCCESS
tests: SUCCESS
build: SUCCESS
```

The permanent dependency contracts now require:

- direct DSH packages remain exactly `0.1.0-rc.6`;
- `ws` remains exactly `8.21.3`;
- `fast-uri >= 3.1.7`;
- `qs >= 6.16.0`;
- no redundant root `@opentelemetry/*` direct dependency is reintroduced without an explicit reviewed need.

## Interpretation

`npm audit = 0` is point-in-time evidence for this lockfile and the npm advisory database at verification time. It is not a claim that the supply chain is permanently vulnerability-free. New advisories can affect the same versions later, and install-script/native-package trust remains a separate concern.

The DSH rc.6 compatibility wave remains intentionally frozen. Future DSH or telemetry changes require isolated compatibility review, source quality, controlled Preview telemetry/smoke verification, and rollback evidence.

Foundation Freeze remains blocked by the independent live EdgeOne and repository-enforcement gates in `docs/release/RELEASE_CHECKLIST.md`.
