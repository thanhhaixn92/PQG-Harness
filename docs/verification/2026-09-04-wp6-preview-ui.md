# WP6 Preview UI Verification — 2026-09-04

## Scope

WP6 Foundation Core adds a small PQG-owned product layer on top of the prepared DSH Web UI. Generated HTML and `public/` artifacts are produced through the preparation/product-layer scripts; they are not treated as the source of truth.

Production Git Auto Deploy remains owner-confirmed disconnected. No Production deployment is performed by this verification.

## Source-side checks

| Check | Status | Evidence |
|---|---|---|
| PQG product config is one frozen source of identity | PASS | `tests/product-config.test.ts` |
| HTML title and web manifest identify `PQG Harness` | PASS | `tests/product-ui-contract.test.ts` |
| local GitHub link points to `thanhhaixn92/PQG-Harness` | PASS | generated contract test |
| TencentEdgeOne adapter and DeepSeek core attribution retained | PASS | generated metadata contract |
| initial locale is based on browser language, not hostname | PASS | `tests/dsh-web.test.ts`, `tests/locale-contract.test.ts` |
| `vi-VN` resolves to shipped English rather than partial Vietnamese | PASS by design | `docs/localization/vi-status.md` |
| contact dialog closes with Escape | PASS by generated contract | producer-generated keyboard handler |
| Tab / Shift+Tab focus containment | PASS by generated contract | `tests/product-ui-contract.test.ts` |
| focus returns to the opener after close | PASS by generated contract | opener capture/restoration contract |
| background app root is inert while the dialog is open when supported | PASS by generated contract | producer-generated inert fallback |
| external focus is redirected back into the modal | PASS by generated contract | focusin/focusout ownership handlers |

## Controlled Preview checks

A controlled EdgeOne Preview domain/browser session is not available from the current execution environment. The following cases are therefore **BLOCKED**, not inferred as PASS.

| Case | Status | Required future evidence |
|---|---|---|
| 390 px phone shell usability | BLOCKED | controlled Preview screenshot + interaction check |
| 768 px tablet shell usability | BLOCKED | controlled Preview screenshot + interaction check |
| 1440 px desktop shell usability | BLOCKED | controlled Preview screenshot + interaction check |
| keyboard-only open / Tab / Shift+Tab / Escape / focus-return | BLOCKED | real browser interaction |
| screen-reader dialog announcement | BLOCKED | real browser/accessibility-tree check |
| Vietnamese browser (`vi-VN`) renders complete English fallback | BLOCKED | controlled browser locale test |
| Chinese browser keeps shipped Chinese locale | BLOCKED | controlled browser locale test |
| English browser keeps shipped English locale | BLOCKED | controlled browser locale test |

## Foundation Core interpretation

WP6 can be source-side GREEN once the full quality workflow passes on the final candidate and the generated artifacts match the producer. The viewport/browser cases above remain live verification items for the final Foundation release gate and must not be represented as completed until a controlled Preview exists.
