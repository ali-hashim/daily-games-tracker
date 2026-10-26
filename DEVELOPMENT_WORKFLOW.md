# Development workflow

`canonical-daily-games-tracker/` is the canonical checkout for `ali-hashim/daily-games-tracker`. The private WHT workspace and its historical snapshot are migration evidence; they are not a second editable application tree. The resolved local path is recorded only in the private migration handoff.

Work from a short-lived branch in this checkout, review the diff and sensitive-content scan, then run the application checks from `daily-games-tracker/`:

```sh
npm ci
npm run typecheck
npm test
npm run test:database
npm run build
```

The application workflow runs these checks on pull requests and pushes. The pinned Cherri workflow is separate and remains unsigned; it compiles credential-free source only when its source or tooling changes. A normal application push does not deploy Pages, migrate a remote D1 database, distribute a Shortcut, or invoke HubSign.

Keep credentials, device codes, configured Shortcut files, install links, player data, database exports, captures, and operational evidence in platform settings or ignored local paths. Commit safe placeholders, examples, migrations, source, tests, and synthetic fixtures. Public hostnames and intentionally public D1/Access resource identifiers may remain in source when they are part of the documented runtime contract. `wrangler.jsonc` is the source of truth for the reviewed preview/production D1 bindings, APP_ENV values, and preview Access values. It deliberately omits the private `ADMIN_EMAIL` and `SHORTCUT_INSTALL_URL` names from tracked `vars`; provision those names as per-environment Cloudflare Secrets through the dashboard or Wrangler before using a hosted environment. `.env.example` documents local placeholders only, and `.dev.vars`/`.env` are local development mechanisms rather than deployment configuration.

Preview and production are separate Cloudflare environments. Keep the committed D1 bindings, APP_ENV values and preview Access identifiers aligned with the reviewed platform configuration; supply the administrator email and Shortcut install URL as per-environment Secrets before using a deployment command. For local-only overrides, use `.dev.vars`/`.env` with `wrangler pages dev`; remote deployment commands read the checked-in Wrangler configuration plus the configured Cloudflare Secrets. Remote migrations and deployments remain explicit operator actions.

Cloudflare documents Wrangler configuration as the source of truth for fields declared in the file, and documents `.dev.vars`/`.env` for local secrets: [Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Pages bindings and local secrets](https://developers.cloudflare.com/pages/functions/bindings/#local-development-with-secrets). Do not assume a dashboard value overrides a checked-in `vars` entry with the same name.

Before any public push, review the staged tree, run the sensitive-content scan, and preserve the signing workflow's permanent false guard and all-zero reviewed-commit sentinel. Use ordinary non-force branch updates and the repository's review/CI path after the one-time migration.
