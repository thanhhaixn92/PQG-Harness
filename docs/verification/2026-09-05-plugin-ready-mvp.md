# Plugin-ready MVP P6 Source Acceptance

Date: 2026-09-05

This record closes the source-side P6 acceptance pass for the plugin-ready substrate. It does not replace live EdgeOne durability, deployment, browser, observability, or rollback evidence.

## Baseline

- Acceptance base `main`: `50212203b5f4afd17a664da0708de6fa83e618b0` (`feat: add module config UI seam`).
- Base tree: `29f59d1c97a26338a01ea7640484237a3aa7480c`.
- DSH train: `0.1.0-rc.6`.
- MCP SDK: `1.29.0`.
- No Task, Writing, Planning, Document, Data, Memory, Workflow, Skill, or other business module is installed by this acceptance pass.

## Source acceptance

The existing PR1–PR3 seams are reused without a second plugin lifecycle, MCP server, registry, event bus, or storage layer.

| Behavior | Evidence | Result |
|---|---|---|
| Zero installed PQG modules remain a valid catalog state | Existing `module catalog is empty when no PQG module is installed` regression | PASS |
| Malformed installed `pqg.module` metadata fails clearly | `rejects installed modules with malformed pqg.module metadata` | PASS |
| Stale policy for an uninstalled module is not exposed | Existing stale-policy catalog regression | PASS |
| Uninstall does not delete the persisted enable override; reinstall restores it | `uninstall hides a module without deleting its persisted enable override` | PASS |
| Persisted policy seeds a new module-capable MCP bridge | Existing `persisted policy seeds bridge state before future tool registration` regression | PASS |
| Enable/disable/remove remains on the existing MCP bridge | Existing MCP lifecycle regression | PASS |
| A failing module tool returns an MCP tool error without taking down Makers core tools | `a failing module tool returns an MCP error without taking down Makers core tools` | PASS |
| PR3 Settings surface remains generated through the reviewed DSH Web graph | Existing generated-artifact and Settings regressions | PASS |

## Quality evidence

The required `quality` workflow on the PR #65 merge candidate is GREEN:

- install: PASS; 563 packages audited, 0 known vulnerabilities at this point in time.
- DSH Web prepare: PASS.
- generated artifact drift: PASS.
- typecheck: PASS.
- tests: **131/131 PASS**.
- production build: PASS.

Exact transient PR head/run identifiers are kept in PR #65 checks instead of this committed record so the document does not become self-referential or stale when the branch is squashed or merged.

These checks prove source compatibility only. They do not prove that a particular EdgeOne Production deployment is running this source.

## Explicitly not proven here

- Generic `pqg.module` `./client` runtime activation/unload on DSH `0.1.0-rc.6` remains intentionally out of scope.
- No reference/conformance package is installed in Production yet.
- No business-module data lifecycle is claimed beyond preservation of the existing module enable-policy record.
- M01 same-conversation fresh-sandbox recycle/restore remains a separate live gate.
- Current Production identity and zero-plugin browser smoke must be verified against `/build-meta.json` after the intended build is deployed.

## Decision

The accepted source candidate is **plugin-ready at the substrate level**: discovery, durable enable policy, MCP tool lifecycle, installed-only Settings catalog, live process-local toggle propagation, startup policy seeding, uninstall tolerance, and module-tool failure isolation have source-side regression evidence.

The next architecture proof should use a minimal reference/conformance module to move from **plugin-ready** to **plugin-proven**. That work must reuse the DSH/Cordis/MCP seams already present rather than introduce another plugin framework.
