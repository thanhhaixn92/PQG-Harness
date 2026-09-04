# Main Branch Guardrail Verification — 2026-09-04

Repository: `thanhhaixn92/PQG-Harness`

Direct GitHub branch metadata was re-read after the project owner reported EdgeOne Git integration reconnected. The canonical `main` remains:

```text
commit: 70119cfdae992a203a5e29eb24e91c7200222a7c
protected: false
protection.enabled: false
required_status_checks.enforcement_level: off
required_status_checks.contexts: []
required_status_checks.checks: []
repository rulesets: []
```

## Interpretation

The `quality` workflow exists and has been used as the source-side gate for Foundation candidates, but GitHub currently does **not** enforce that workflow as a required check on `main`.

Phase 1B finding M09 therefore remains open at the repository-enforcement layer.

The original safety plan required this guardrail **before** reconnecting a Git-linked deployment. The project owner has now reported EdgeOne Git integration **RECONNECTED on 2026-09-04** before the guardrail was configured. This is a sequencing deviation, not evidence that the guardrail is no longer required.

## Required action now

Before any merge/push is used as a release or Production-promotion mechanism:

1. verify the actual EdgeOne Production branch after reconnect;
2. protect that deployment branch or create an equivalent repository ruleset;
3. require pull-request based changes for the deployment branch where supported;
4. require the `quality` check before merge/promotion;
5. verify the rule is active by re-reading branch/ruleset metadata;
6. verify deployed `/build-meta.json` after any approved promotion.

Until these steps are complete, **do not merge Foundation changes to `main` on the assumption that the reconnect is safe**.

The GitHub connector available to this execution environment exposes branch-protection/ruleset reads but no administration write action, so this repository setting cannot safely be applied from the current session. It is retained as an explicit Foundation Freeze blocker rather than represented as complete.

See `docs/verification/2026-09-04-edgeone-reconnect-status.md` for the owner-reported reconnect evidence and current live-verification limitations.
