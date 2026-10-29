# Development workflow

The [portable development handoff](DEVELOPMENT_HANDOFF.md) is the starting point for a new computer, local setup, current task status, and restoring existing Cloudflare configuration. This repository is the maintained source for `ali-hashim/daily-games-tracker`; the historical private workspace is not another editable application checkout.

For each change, use a short-lived branch from the public repository. Run Git from the repository root and application commands from its nested `daily-games-tracker/` directory. Install the lockfile exactly and run the project checks:

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run test:database
npm run build
npm run test:smoke
```

The application workflow runs the applicable checks on pull requests and pushes. A normal source change does not deploy Pages, mutate remote D1, or invoke Shortcut signing. The separate Cherri workflows have their own protected build and signing rules; a new computer does not require a signing-state migration or a new signed artifact.

Keep credentials, device codes, configured Shortcuts, player data, database exports, captures, and operational evidence in platform settings or ignored local paths. Public Markdown, reports, manifests, examples, source, and pull-request text must not publish hosted origins, deployment URLs or IDs, Pages project names, account or D1 identifiers, Access audiences or administrator identities, or private install links. The tracked `wrangler.jsonc` and npm remote-operation scripts contain inert placeholders. `.env.example` contains local placeholders and may be copied to `.dev.vars` for local Pages Functions development only.

Preview and production are existing, separate Cloudflare environments. Do not create replacement projects, databases, buckets, or signing state when moving to a new computer. Recover the existing Pages project configuration from the authenticated account as described in [CLOUDFLARE_SETUP.md](daily-games-tracker/CLOUDFLARE_SETUP.md) and [PRODUCTION_RUNBOOK.md](daily-games-tracker/PRODUCTION_RUNBOOK.md). The Pages deploy command does not accept `--config` or `--env`; the runbook documents the private app-root TOML swap and exact restoration of the tracked placeholder file. D1 commands have different flags; inspect their installed command help before any separately authorized remote operation.

Current release state, owner-accepted limitations, and remaining human checks are recorded in [PROJECT_STATUS.md](daily-games-tracker/PROJECT_STATUS.md). Before a publication-sensitive change, follow [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md), review the complete diff, and preserve the protected signing workflow's reviewed-source, digest, pending-lease, single-request, and private-R2 safeguards. An already completed signed delivery is not evidence of a later signing run.
