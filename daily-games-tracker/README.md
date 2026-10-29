# Winstitute of Higher Thinking

An invitation-only, iPhone-first tracker for Krillion and MapTap. Players submit completed results through one universal Apple Shortcut; Pages Functions validate the capture before saving it to Cloudflare D1.

The `/user` page provides the signed-in player view, while `/daily` and `/all-time` retain their existing privacy and ranking rules. The source tree includes the server, client, migrations, service worker, credential-free Shortcut source, and synthetic fixtures used by the automated checks.

Production identity, device credentials, player data, install links, hosted origins, deployment IDs, project/account IDs, D1 identifiers, Access audiences and operational evidence are supplied outside this repository through private platform settings or ignored local files. The committed `wrangler.jsonc` and `.env.example` contain local placeholders only; they do not publish remote bindings or configured install values.

For the deployed release and the exact remaining human checks, see [current project status](PROJECT_STATUS.md) and the [production runbook](PRODUCTION_RUNBOOK.md).

## Local verification

Use Node.js 22 from this directory:

```sh
npm ci
npm run typecheck
npm test
npm run test:database
npm run build
```

For a local Pages/Functions/D1 session, run `npm run db:local:migrate`, `npm run build`, and `npm run dev:pages`, then open `http://localhost:8788`. The all-zero D1 identifier in the base binding is an inert local placeholder. Supply remote D1 IDs, Access audiences, administrator identities, hosted origins and install values through private platform configuration before a remote operation. Remote migrations and deployment are not run by these checks.

The fixtures use fixed test dates and synthetic values. Tests cover capture validation, parsers, authorization, registration, device login, sessions, user statistics, admin mutations, leaderboards, migrations, and duplicate-safe submissions. Local checks do not establish physical iPhone behavior, native Shortcut acceptance, cloud performance, or production readiness.

## Shortcut source

Credential-free Cherri source and the pinned toolchain lock are under `shortcut/cherri-migration/`. The pinned GitHub Actions workflow compiles and inspects unsigned probes and the complete client. Task 7 completed the protected Actions-only signing flow for the version-1 candidate from source `29c4acea`; the verified signed result and state are stored in private R2. Website-only commits after that signing run did not change or re-sign the Shortcut. User-directed retries of previously ambiguous outcomes remain authorized when the exact reviewed package, source/digest checks and valid private R2 state pass, without repeat approval. No configured Shortcut or install link is committed.

The full client source receives its runtime destination from private external configuration. Hosted origins, deployment identities, credentials and per-user device codes remain runtime inputs and are never stored in this public repository.
