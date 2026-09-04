# Foundation Core Source Checkpoint — 2026-09-04

## Scope

This checkpoint records the reviewed Foundation source state after WP7 and the subsequent narrow dependency-security cleanup. It does not declare Foundation Freeze complete and it does not represent a Production deployment.

## WP7 integration checkpoint

```text
WP7 merge commit: e8a952d159bef610592f43d28ea3cbee6860c701
WP7 merge tree: 727854ecc42cb82e227dd85442159d562af7dd67
WP7 final candidate: 1a410d1742b86ba0981b55036c4598bbbf4bd10b
WP7 candidate tree: 727854ecc42cb82e227dd85442159d562af7dd67
```

The WP7 merge tree equaled the final WP7 candidate tree exactly. Final WP7 quality evidence:

```text
run: 33891360316
result: SUCCESS
steps: npm ci -> prepare:dsh-web -> generated drift guard -> typecheck -> tests -> build
```

A post-WP7 evidence-only checkpoint was later merged as `0a6b68320e6a53378c0046d2a8aebdac2f345c21`.

## Dependency security follow-up

The Foundation dependency follow-up remained source-only and did not start module work.

First, the compatible transitive parser refresh moved the reviewed vulnerable resolutions to:

```text
fast-uri: 3.1.7
qs:       6.16.0
```

That refresh was merged into integration before the root telemetry cleanup.

The remaining npm findings were then traced to a redundant root OpenTelemetry direct dependency wave. A PQG-owned source usage review found no direct `@opentelemetry/*` import, no `JaegerPropagator`, no `OTEL_PROPAGATORS`, and no explicit global propagator registration. The pinned DSH rc.6 dependency graph retains its own newer nested telemetry packages.

TDD and reconcile evidence for removing only the redundant root wave:

```text
RED commit: 1dd42744949711f7a464b761f0d48365ccfab27d
RED quality: 33894591865 — expected FAILURE, 89/90 tests pass
semantic reconcile: 33894812422 — LOCK_ADDITIONS [], 563 packages audited, 0 vulnerabilities
clean candidate: b3bf346c71c041d113f4bcbf86117ae800afec79
clean quality: 33894930007 — SUCCESS
final docs-aligned candidate: ce0c92bc80f7759442ed90a0ea264906b20b54e0
final quality: 33895275632 — SUCCESS
```

The temporary write-enabled reconcile workflow was deleted before final quality. The final PR changed only the root dependency manifest, semantic lock deletions, one permanent dependency contract, Known Limitations, and the verification record.

The reviewed Foundation source state immediately before the docs-only checkpoint merge was:

```text
reviewed source commit: f24f69f2368c0c36241f646e39b5ca06114a44a8
reviewed source tree:   43125c8dc47dfa1519c226ad0818397f47be42e7
```

The subsequent verified docs-only checkpoint merge was:

```text
checkpoint merge: b3f9fec1e127ae3a410e445840c456f77935a37e
checkpoint tree:  99cc554cc334b9c4058120b5af3f11b6a6a390cf
```

That merge tree exactly matched the quality-tested checkpoint candidate tree `466daf6563c1554a59c99b9ce1a3dcdad7e70030`. These are immutable evidence points; the moving `integration/foundation-core` head must be read from GitHub rather than embedded here as a "current" SHA.

Point-in-time npm audit evidence is zero known vulnerabilities for 563 audited packages. This is not a permanent supply-chain guarantee; future advisories and DSH/telemetry compatibility changes still require review.

## Main branch guardrail

Fresh GitHub verification after the owner reported EdgeOne reconnect:

```text
main commit: 70119cfdae992a203a5e29eb24e91c7200222a7c
main tree: 489ec3e0c02a95acd99b554de9e6769c0523afd6
protected: false
required-status-check enforcement: off
required contexts/checks: []
repository rulesets: []
```

No Foundation work has been merged to `main`.

EdgeOne Git integration is now **OWNER-REPORTED RECONNECTED**. Because reconnect occurred before required `quality` enforcement was configured, the safety rule changes from "do not reconnect" to **"do not merge/promote through `main` until the actual deployment branch is verified and required quality enforcement is configured"**.

See `docs/verification/2026-09-04-edgeone-reconnect-status.md`.

## Known EdgeOne deployment probe

Canonical non-secret origin supplied by the project owner:

```text
https://pqg-harness.edgeone.cool/
```

The owner supplied a tokenized access URL for verification. The credential/query parameters are intentionally not stored in this repository.

After reconnect and after receiving that access URL, fresh probes from the current execution runtime still failed before application content was available:

- direct runtime HTTP failed DNS resolution for `pqg-harness.edgeone.cool`;
- the separate web-fetch path returned no application response.

The same environment limitation prevented a verified request to `/build-meta.json`.

Interpretation:

- this is **BLOCKED by the execution environment**, not an application FAIL;
- reconnect itself is owner-reported and not independently Console-verified from this session;
- deployed SHA/parity remains NOT VERIFIED;
- Production/Preview branch mapping remains NOT VERIFIED;
- root/API access/auth, runtime smoke, Preview durability/cancellation, native observability and rollback remain unresolved live gates;
- no Foundation change has been merged to `main` by this work.

## Source status

WP0–WP7 plus the reviewed dependency follow-up are source-side GREEN at the recorded evidence commits. Foundation Freeze remains **BLOCKED / not complete** until the mandatory live EdgeOne and repository-enforcement rows in `docs/release/RELEASE_CHECKLIST.md` are closed or explicitly owner-accepted with a dated reason.

No Task, Writing, Planning, Document or Data module work is included in this checkpoint.
