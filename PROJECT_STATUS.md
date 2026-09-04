# PQG-Harness project status

## Source
- Canonical branch: `main`
- Audited baseline: `70119cfdae992a203a5e29eb24e91c7200222a7c`
- Upstream provenance: see `UPSTREAM.md`

## Known deployment
- Known URL: `https://pqg-harness-dp0dukyw6bfl.edgeone.cool/`
- Git-connected EdgeOne deployment: DISCONNECTED by the project owner on 2026-09-04; repository changes no longer auto-deploy while disconnected.
- Production branch mapping: NOT APPLICABLE while Git integration is disconnected; must be re-verified before any future reconnect.
- Preview branch behavior: NOT APPLICABLE while Git integration is disconnected; must be re-verified before any future reconnect.
- Access/auth policy: NOT VERIFIED — confirm in EdgeOne Console before public/stable use.
- Deployed commit parity: NOT VERIFIED; the existing deployment may remain on an earlier source revision until a controlled redeploy is performed.

## Foundation Core status
- WP0 quality/governance: source-side GREEN.
- WP1 security/permissions: source-side GREEN.
- WP2 workspace durability: source-side GREEN; controlled Preview recycle/recovery remains BLOCKED.
- WP3 sidecar lifecycle/Stop: source-side GREEN; controlled Preview command-cancellation proof remains BLOCKED.
- WP4 dependency/supply-chain hardening: source-side GREEN through reviewed DSH `0.1.0-rc.6` pins, `ws@8.21.3`, and package-lock SRI verification before exceptional native extraction.
- WP4 public Gateway/Host exposure: source-side GREEN. Gateway response headers are allowlisted and public proxy errors are code-only.
- `x-prompt-log` / `x-gateway-quota-bypass`: NOT VERIFIED from authoritative public EdgeOne documentation; preserved only as inherited compatibility behavior. See `docs/verification/2026-09-04-wp4-gateway-header-status.md`.

## Deployment safety rule
Do not reconnect Git Auto Deploy until Phase 2 changes have passed the quality gate and a controlled deployment/reconnect plan has been reviewed. Reconnection must re-verify Production/Preview branch mapping, access policy and deployed commit parity before enabling automatic promotion.

## Release status
Developer/MVP hardening. Not approved as stable/public production until Foundation Core release gates are closed or explicitly owner-accepted.