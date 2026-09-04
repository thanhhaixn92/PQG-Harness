# WP4 Gateway Header Verification Status

## Review date

2026-09-04

## Authoritative public documentation reviewed

- EdgeOne Makers — Unified AI Model Access with Makers Models: `https://pages.edgeone.ai/document/models`
- Tencent EdgeOne — Makers Agents: `https://edgeone.ai/document/211789991131570176`

The reviewed official examples describe the Makers endpoint as OpenAI-compatible and show the standard `Authorization: Bearer ...` and `Content-Type: application/json` request headers. They do not document the semantics of the adapter's two nonstandard headers below.

## Nonstandard compatibility headers

| Header | Status | Foundation Core decision |
|---|---|---|
| `x-prompt-log` | **NOT VERIFIED** | Preserve existing adapter behavior for compatibility; do not infer logging/privacy semantics from the name. |
| `x-gateway-quota-bypass` | **NOT VERIFIED** | Preserve existing adapter behavior for compatibility; do not infer quota/billing semantics from the name. |

No new environment toggle is introduced because there is no authoritative public contract to define a safe toggle against. These headers remain an explicit release limitation until EdgeOne publishes or otherwise provides verifiable semantics.

## Response/public-error hardening completed

WP4 now:

- forwards only `content-type`, `cache-control`, `retry-after`, and `x-request-id` from Gateway responses;
- suppresses provider/server/debug/auth-like response headers;
- returns `AI_GATEWAY_PROXY_FAILED` without raw exception text from the loopback Gateway;
- returns `DSH_WEB_PROXY_FAILED` without raw exception text from the Host proxy;
- emits a stable `DSH_WEB_STREAM_FAILED` marker instead of raw exception text for Host SSE setup/runtime errors;
- logs only exception names at these boundaries, not prompt bodies, API keys, workspace content, or preview credentials.

## Evidence

- Task 9 RED: commit `887b9707e564d803b835275962ad480bbfbf4cb1`, quality run `33886585612` — expected four behavior failures.
- Task 9 GREEN: commit `d3981ca1eb442093e5a98ba68f231dda2e863743`, quality run `33886813673` — **SUCCESS**.
