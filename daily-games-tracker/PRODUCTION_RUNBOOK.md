# Production runbook

Use this page for the production Wrangler preflight. The [current project status](PROJECT_STATUS.md) tracks the deployed source and pending human checks; the [production release record](../docs/superpowers/plans/2026-10-25-production-launch.md#current-production-release) preserves dated release history.

## Current baseline

Production is running source `ae36c52800b41f2bbb411c1d5e83e09c37be1f31`. Its D1 database is initialized at schema 3, with minimum/latest Shortcut version `1/1`. Production health returned schema-3 JSON and anonymous authentication returned JSON `401` after the latest Functions deployment. Task 9 still needs the authorized human authentication checks listed in `PROJECT_STATUS.md`; Task 10 is not complete.

Keep production origins, project/account/database identifiers, Access audiences, admin identities, credentials, and deployment evidence in private settings or ignored records. The committed Wrangler JSONC is a placeholder, not a production target.

## Wrangler access and target preflight

1. Run Git commands from the canonical repository root. Run npm and Wrangler from `daily-games-tracker/`. Set the working directory explicitly for every tool call.
2. Use the repository-installed Wrangler CLI and confirm its version. Do not use a global CLI, `npx` auto-install, or the legacy checkout.
3. Put Wrangler diagnostics under an ignored, writable directory and keep log sanitization enabled. A network/DNS error or log-path `EPERM` is not evidence that authentication expired. Retry the same read-only diagnostic with the supported network permission; never move or inspect the OAuth profile to work around it.
4. A successful `whoami` proves account access only. Before any remote command, privately verify the intended account, project/database, branch, environment, effective binding, and operation against current configuration records. Never use the all-zero/example database binding.
5. Inspect the pinned CLI's command-specific help. In the verified version, D1 commands may accept `--config` and `--env`; Pages deploy does not. Pages supports `--branch`. Do not infer that D1 flags work for Pages or add unsupported flags.
6. Pages deployment must run where the application `functions/` directory is present. Running from the wrong directory can publish only static files, leaving API routes to serve the SPA shell. `--cwd <app>` does not repair a CLI invocation whose current working directory omits Functions.
7. Use only the currently verified private configuration procedure for production. A temporary app-root TOML configuration swap was verified for the repair deployment; restore the tracked placeholder configuration afterward. Never deploy with the default placeholder JSONC. If using a config-free staging directory, include `functions/`, `shared/`, `parsers/`, required dependencies, and run the CLI with that staging directory as its actual current directory.
8. Before and after an authorized deploy, privately compare the runtime configuration readbacks and confirm that the intended Functions are included. Keep preview and production bindings separate. This preflight grants no deployment or database-write authority by itself.

## Recovery note

A static-only production upload was repaired by deploying reviewed application source from the actual app directory with Functions included. Subsequent help-heading and share-metadata changes are part of the current `ae36c52` release. The recovery made no database writes. For another incident, stop and verify the working directory, packaged Functions, private target configuration, and health/auth responses before making a second deployment; retain raw diagnostics only in ignored private storage.
