# Winstitute of Higher Thinking

An invitation-only, iPhone-first tracker for Krillion and MapTap. Players submit completed results through one universal Apple Shortcut; Pages Functions validate the capture before saving it to Cloudflare D1.

The `/user` page provides the signed-in player view, while `/daily` and `/all-time` retain their existing privacy and ranking rules. The source tree includes the server, client, migrations, service worker, credential-free Shortcut source, and synthetic fixtures used by the automated checks.

Production identity, device credentials, player data, install links, and operational evidence are supplied outside this repository through platform settings or ignored local files. The committed `wrangler.jsonc` keeps the reviewed preview/production D1 bindings, APP_ENV values and preview Access identifiers because they are public resource configuration; private `ADMIN_EMAIL` and `SHORTCUT_INSTALL_URL` are intentionally omitted from tracked `vars` and must be provisioned as per-environment Cloudflare Secrets. `.env.example` contains local placeholders only. It does not contain a configured hosted install link.

## Local verification

Use Node.js 22 from this directory:

```sh
npm ci
npm run typecheck
npm test
npm run test:database
npm run build
```

For a local Pages/Functions/D1 session, run `npm run db:local:migrate`, `npm run build`, and `npm run dev:pages`, then open `http://localhost:8788`. The all-zero D1 identifier in the base binding is a local placeholder. Preview and production use separate reviewed D1 IDs; supply private administrator and install values as Cloudflare Secrets before a remote operation. Remote migrations and deployment are not run by these checks.

The fixtures use fixed test dates and synthetic values. Tests cover capture validation, parsers, authorization, registration, device login, sessions, user statistics, admin mutations, leaderboards, migrations, and duplicate-safe submissions. Local checks do not establish physical iPhone behavior, native Shortcut acceptance, cloud performance, or production readiness.

## Shortcut source

Credential-free Cherri source and the pinned toolchain lock are under `shortcut/cherri-migration/`. The pinned GitHub Actions workflow compiles and inspects unsigned probes and the complete client. Signing remains fail-closed: the separate signing workflow retains its permanent `false && inputs.confirm_external_signing` guard and all-zero reviewed-commit sentinel. No configured Shortcut or install link is committed.

The full client source uses the reviewed preview origin as its runtime destination. That endpoint is a public application setting in the source; credentials and per-user device codes remain runtime inputs and are never stored in the repository.
