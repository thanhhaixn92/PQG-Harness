# WP3 Command Cancellation Verification

## Status

**BLOCKED — controlled EdgeOne Preview is not available from the current execution environment.**

WP3 repository-side lifecycle, leasing, current-context, SSE cancellation, and Stop transition are GREEN. The remaining live gate is specifically whether `context.utils.abortActiveRun(conversationId)` stops an already-running sandbox command strongly enough that the command cannot continue mutating the workspace after Stop.

This document intentionally does not convert that external verification gap into PASS.

## Build under verification

- Repository: `thanhhaixn92/PQG-Harness`
- Branch: `impl/wp3-sidecar-core`
- Source-side GREEN SHA before this evidence-only commit: `a38d9cd40a5ecbc4ea306276df12b62377f6f59e`
- Final quality run for that SHA: `33885038510` — **SUCCESS**
- Production Git Auto Deploy: owner-confirmed **disconnected** during Foundation Core implementation

## Source-side evidence

| WP3 behavior | RED evidence | GREEN evidence | Result |
|---|---|---|---|
| Explicit lifecycle, bounded startup, idempotent close | `4315b9274a2dc9fe5bf1661d2481551f205d6d41`, run `33877447446` | `0d52268301791e49da4318576c58d5422379057c`, run `33877865710` | PASS |
| Latest Gateway/MCP context, SSE early abort, Stop independence | `cdfba88dc926b756ac5c7e64ca669eb34c93a3f3`, run `33878293312` | through `0916ad523c75341c7065cf3ed6a797c577d9e781`, run `33879134465` | PASS |
| Unary response lease held through body streaming | `7a9c38fc92b45992a392bc28fcb237c559609d3f`, run `33884867924` | `a38d9cd40a5ecbc4ea306276df12b62377f6f59e`, run `33885038510` | PASS |

## Controlled Preview test still required

Use a disposable Preview conversation only:

1. Start one approved workspace command that appends a non-secret heartbeat line to `wp3-stop-heartbeat.txt` once per second for a bounded period.
2. Confirm at least two heartbeat lines were written.
3. Invoke the product Stop action for the same conversation.
4. Record the heartbeat count immediately after Stop resolves.
5. Wait longer than two heartbeat intervals.
6. Read the file again.
7. PASS only if the heartbeat count does not increase after Stop.
8. Reopen the same conversation and verify the final workspace checkpoint reflects the stopped state.

If writes continue after Stop, do **not** destroy the sandbox or improvise a broad kill mechanism. Open a separate narrowly scoped design for command process ownership/kill and keep the Foundation Freeze gate blocked.

## Pass criteria

Live WP3 cancellation becomes **PASS** only when all of the following are recorded without secrets:

- Preview deployment identifier/domain;
- deployed commit SHA parity;
- disposable conversation identifier or redacted test label;
- command started and produced heartbeat state;
- Stop sidecar outcome;
- Stop platform abort outcome;
- heartbeat writes ceased after Stop;
- recovered workspace state matched the stopped checkpoint.

Until then, status remains **BLOCKED (live command-cancellation verification)**. Repository-only WP4–WP7 work may continue, but Foundation Freeze cannot claim this live gate as GREEN.