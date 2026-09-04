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

## Deployment safety rule
Do not reconnect Git Auto Deploy until Phase 2 changes have passed the quality gate and a controlled deployment/reconnect plan has been reviewed. Reconnection must re-verify Production/Preview branch mapping, access policy and deployed commit parity before enabling automatic promotion.

## Release status
Developer/MVP hardening. Not approved as stable/public production until Phase 2 release gates are closed.
