# Portable development handoff

This repository is the maintained source for `ali-hashim/daily-games-tracker`. The private WHT workspace, another computer's Codex task, and its local temporary files are not required for ordinary development. The tracked [project status](daily-games-tracker/PROJECT_STATUS.md), [development workflow](DEVELOPMENT_WORKFLOW.md), and [operator runbooks](daily-games-tracker/CLOUDFLARE_SETUP.md) contain the current continuation state.

## Set up a new computer

Install Git and Node.js 22, then clone the public repository and create a short-lived branch:

```sh
git clone https://github.com/ali-hashim/daily-games-tracker.git
cd daily-games-tracker
git switch -c codex/my-change
cd daily-games-tracker
node --version
npm ci
```

The Git root contains the repository and `DEVELOPMENT_WORKFLOW.md`; the second `daily-games-tracker/` directory is the application. Run Git commands at the root and npm/Wrangler commands in the application directory. `npm ci` installs the exact versions in `package-lock.json`, including Wrangler 4.151.3. Do not use `npm install` to replace the lockfile.

No prior machine's `.wrangler` directory, OAuth profile, `.dev.vars`, private task logs, or exported deployment configuration is needed to clone the code or run its local checks. Authenticate with GitHub and Cloudflare independently on the new computer only when the task requires those services. Never copy browser tokens, credential stores, invitation links, device codes, or private signing files between computers.

## Run the application locally

From the nested application directory, create local D1 state, build the static assets, and start Pages with Functions:

```sh
npm run build
```

For local D1 and Pages, use one short, writable state directory. In PowerShell:

```powershell
$localState = Join-Path $env:TEMP 'wht-development-state'
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --persist-to $localState
node node_modules/wrangler/bin/wrangler.js pages dev dist --persist-to $localState
```

On another shell, supply the same short local path to both commands. A deeply nested Windows checkout can cause an opaque SQLite internal error with the default persistence path; the short path resolved that error in the clean-clone verification. This creates disposable local state, not a remote database.

Open `http://localhost:8788`. The local database command has no `--remote` flag and uses the inert local `DB` placeholder. Local Pages variables, when needed, come from a copy of `.env.example` named `.dev.vars`; keep that file local. Local development must not use a downloaded production configuration, real production credentials, or production/preview data. If local D1 startup fails, preserve the exact error privately and diagnose the local Wrangler setup; do not retry it with `--remote`.

Run the repository checks from the application directory when a change requires them:

```sh
npm run format
npm run lint
npm run typecheck
npm test
npm run test:database
npm run build
npm run test:smoke
```

## Existing Cloudflare and signing state

Cloudflare Pages, preview and production D1, Access settings, the private R2 Shortcut bucket, GitHub signing environment, signing state, and the signed version-1 Shortcut already exist. A new computer is not a reason to create replacement projects, databases, buckets, or GitHub environments. Do not rerun the one-time R2 state migration, bootstrap signing state, re-sign, or change install behavior as part of a handoff. Later website commits did not re-sign the version-1 candidate.

To recover the current Pages configuration, use the same authorized Cloudflare account and the read-only project-config download documented in [Cloudflare setup](daily-games-tracker/CLOUDFLARE_SETUP.md). The downloadable TOML contains private binding identities and plain-text variables, so keep it local and ignored. Secret values are not recoverable from GitHub's secret store or the Pages config export. If an existing credential is missing or must be rotated, use its authorized source and update only the affected platform setting; do not invent replacement values or repeat the signing migration.

Remote commands require current account and target readback plus authorization for that specific operation. The tracked Wrangler file and npm remote-operation scripts contain placeholders. Do not deploy or migrate against them. Pages deploy must run with the actual shell working directory at the nested application directory because that directory contains `functions/`; the command has no `--config` or `--env` option. Follow the exact private TOML swap/restore procedure in [the production runbook](daily-games-tracker/PRODUCTION_RUNBOOK.md). Moving to another computer alone authorizes no remote operation.

## Continue the project

The latest production state, accepted decisions, and pending human checks live in [PROJECT_STATUS.md](daily-games-tracker/PROJECT_STATUS.md). The current task disposition is:

- Task 1 established the maintained public repository. Tasks 2–4 are closed with their recorded limitations preserved.
- Task 5 configuration, version preparation, and account-recovery preparation are accepted. The owner canceled the proposed separate production D1 backup, nightly schedule, and alerts; there is no independent production database copy.
- Task 6 setup/help content is included in the current release. Task 7's version-1 candidate was signed through protected CI from source `29c4acea`; later site commits did not change or re-sign it. Tasks 5 and 8 are accepted. Do not repeat Task 7/8 test suites, device acceptance, signing rehearsals, or the phone-side hash comparison without new user direction.
- Task 9 production deployment is complete. The remaining recorded checks are administrator success, nonadministrator denial, authenticated Shortcut download and controlled-test identity cleanup, plus manual acceptance of the latest UI, as listed in project status. Creating new device codes in the User menu is future work; the redownload card is already hidden.
- Task 10 remains open for the complete fresh-user production journey and native iPhone/Safari session, download, and update behavior. Tasks 11–15 remain separate pilot, stabilization, archive-review, cleanup, and final-handoff work.

Task 5's account-recovery paths for Cloudflare and GitHub were confirmed tested by the owner, but that does not replace service access on a new computer. An isolated maintenance-mode proof verified selected online routes and a warmed browser cache; it did not verify true offline navigation or every immutable deployment alias. The worker is not a universal rollback guarantee. Revalidate the exact release and host coverage before relying on maintenance mode.

The private task records are historical evidence, not startup dependencies. Use this repository's current status and the task-specific authorization for follow-up work. Preserve the accepted scope and do not reopen user-accepted checks without new direction.

The [local-work audit](daily-games-tracker/reports/development-work-audit.md) catalogs the older checkout file by file. Unique retired source and the unshipped schema-test assertion are preserved in the [historical archive](docs/archive/2026-10-29-local-work/README.md). Raw task chats, platform exports, logs, credentials, and database data are intentionally excluded; the decisions needed to continue are summarized here and in project status. No copy of the old computer's private temporary folders is required for the documented workflow.
