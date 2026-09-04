# Contributing

- Do not develop directly on `main`.
- Use `feature/*`, `fix/*`, `sync/*`, or other review branches.
- EdgeOne Auto Deploy is the deployment owner; GitHub Actions is validation-only.
- Do not hand-edit generated `public/`, generated `agents/api/*`, or generated root `index.html`; edit the producer script/source and regenerate.
- Before PR: run `npm ci`, `npm run prepare:dsh-web`, generated drift check, `npm run typecheck`, `npm run test:prepared`, `npm run build:prepared`.
- DSH dependencies are a coordinated wave: never upgrade one DSH package in isolation.
- Preserve upstream attribution and update `UPSTREAM.md` for upstream imports.
