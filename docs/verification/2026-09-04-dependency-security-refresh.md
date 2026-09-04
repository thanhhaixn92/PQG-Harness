# Foundation Dependency Security Refresh — 2026-09-04

## Scope

This verification is a narrow Foundation follow-up. It does not upgrade the DeepSeek Harness `0.1.0-rc.6` wave, does not perform a forced dependency modernization, and does not change any product module or deployment behavior.

The goal was to remove currently fixable transitive parser findings without introducing a semver-major compatibility wave.

## Baseline

A read-only `npm audit --json` report on the Foundation integration source using Node 24 / npm 11.19 reported:

```text
14 vulnerabilities
11 moderate
3 high
0 critical
```

Two findings had compatible transitive fixes inside the existing dependency ranges:

- `fast-uri@3.1.5` — high; transitive through `ajv` / `@modelcontextprotocol/sdk`;
- `qs@6.15.3` — moderate; transitive through Express/body-parser / `@modelcontextprotocol/sdk`.

The reviewed security floors are:

```text
fast-uri >= 3.1.7
qs >= 6.16.0
```

## TDD evidence

RED candidate:

```text
commit: c54757cc463196d50c14b8656bde27090efa31bf
quality run: 33892860123
result: FAILURE as expected
```

The full existing suite remained green except the new dependency-floor contract. The sole failure was:

```text
fast-uri 3.1.5 must be >= 3.1.7
```

## Remediation

The lockfile was refreshed with the compatible existing ranges only:

```text
npm update fast-uri qs --package-lock-only --ignore-scripts
```

No `--force` was used and `package.json` was not changed.

Resulting lock resolutions:

```text
fast-uri: 3.1.7
qs: 6.16.0
```

A permanent regression contract in `tests/dependency-contract.test.ts` now requires both reviewed floors.

Implementation GREEN evidence after removal of the temporary lock-refresh workflow:

```text
commit: 6b9cfe69ee224c50d784d81d67fbe6a07eea3292
quality run: 33893082135
result: SUCCESS
89 tests passed, 0 failed
build: SUCCESS
```

The same quality run's `npm ci` reported:

```text
12 vulnerabilities
10 moderate
2 high
```

## Residual audit findings

A second read-only `npm audit --json` run after remediation (`33893305111`) confirmed that `fast-uri` and `qs` are no longer present in the vulnerability report.

All 12 remaining findings are in the inherited direct OpenTelemetry dependency wave:

```text
@opentelemetry/core                     moderate
@opentelemetry/exporter-metrics-otlp-http moderate
@opentelemetry/exporter-trace-otlp-http   moderate
@opentelemetry/otlp-exporter-base         moderate
@opentelemetry/otlp-transformer            moderate
@opentelemetry/propagator-b3               moderate
@opentelemetry/propagator-jaeger           high
@opentelemetry/resources                   moderate
@opentelemetry/sdk-logs                    moderate
@opentelemetry/sdk-metrics                 moderate
@opentelemetry/sdk-trace-base              moderate
@opentelemetry/sdk-trace-node              high
```

`npm audit` proposes only semver-major remediation for these findings (`2.x` / `0.222.x` package waves). The TencentEdgeOne imported baseline intentionally lists the same OpenTelemetry family as direct dependencies, so removing or independently upgrading individual packages would be a compatibility change rather than a safe transitive refresh.

A repository source-usage probe found no PQG-owned OpenTelemetry import and no explicit Jaeger activation (`JaegerPropagator`, `OTEL_PROPAGATORS`, or `setGlobalPropagator`). This reduces the demonstrated PQG-owned activation surface for the Jaeger-specific issue but does not prove that all DSH/runtime telemetry paths are unaffected.

## Decision

- `fast-uri` and `qs`: **CLOSED** at the reviewed security floors with lockfile regression coverage.
- OpenTelemetry residual wave: **DEFERRED / release-review item**, not silently accepted and not force-upgraded inside Foundation Core.
- Before stable/public release, review the residual OpenTelemetry advisories against the actual DSH/Makers telemetry activation path. If remediation is required, perform one coordinated OpenTelemetry/DSH compatibility migration with full source quality, controlled Preview smoke, telemetry verification, and rollback rehearsal.

Foundation Freeze remains blocked for the independent live EdgeOne and repository-enforcement gates in `docs/release/RELEASE_CHECKLIST.md`.
