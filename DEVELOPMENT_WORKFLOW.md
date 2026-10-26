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

Keep credentials, device codes, configured Shortcut files, install links, player data, database exports, captures, and operational evidence in platform settings or ignored local paths. Commit safe placeholders, examples, migrations, source, tests, and synthetic fixtures. Public Markdown, reports, manifests, examples, and runtime source must not publish hosted origins, deployment URLs or IDs, Pages project names, account or D1 identifiers, Access audiences or administrator identities, or install links. Keep those values in private platform settings or ignored local configuration, and use inert placeholders when a public contract needs to show a shape. `wrangler.jsonc` may contain only local placeholders in the public tree; remote bindings, APP_ENV values, Access configuration, administrator identity and install URL are supplied privately for the selected environment. `.env.example` documents local placeholders only, and `.dev.vars`/`.env` are local development mechanisms rather than deployment configuration.

Preview and production remain separate Cloudflare environments. Keep remote D1 bindings, Access identifiers, administrator email and Shortcut install URL in private platform configuration; do not copy their values into tracked docs, reports, manifests, source or pull-request text. For local-only overrides, use `.dev.vars`/`.env` with `wrangler pages dev`; remote migration and deployment commands remain explicit operator actions and are reviewed separately from this public source.

Cloudflare documents Wrangler configuration as the source of truth for fields declared in the file, and documents `.dev.vars`/`.env` for local secrets: [Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/), [Pages bindings and local secrets](https://developers.cloudflare.com/pages/functions/bindings/#local-development-with-secrets). Do not assume a dashboard value overrides a checked-in `vars` entry with the same name.

Before any public push, review the staged tree, run the sensitive-content scan, and preserve the signing workflow's protected automatic trigger for relevant reviewed `main` pushes plus its optional manual recovery gate, pinned compile/inspect checks, exact reviewed-source and digest checks, GitHub pending lease, single HubSign POST, AES-256-GCM encrypted intent/result artifacts and fail-closed behavior. User-directed retries of previously ambiguous outcomes are authorized when the exact reviewed package, source/digest checks and valid private state artifacts pass; do not ask for repeat approval. Use ordinary non-force branch updates and the repository's review/CI path after the one-time migration.
