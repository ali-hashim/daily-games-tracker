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

## Recover configuration on a new computer

Follow [Cloudflare configuration recovery](CLOUDFLARE_SETUP.md) to sign in, identify the existing project, and download its configuration. Store the verified export at the ignored application-relative path `tmp/private-platform/wrangler.toml`. The export and dashboard provide existing resource bindings and readable variables. Existing secret values stay in their platform secret stores; the new computer does not need to export GitHub signing secrets to use the existing protected workflow. Recover or rotate a missing credential from its authorized source only when a task requires it. Do not recreate signing state or rerun the completed migration.

## Local database and Functions

From the application directory, use Node 22 and `npm ci`, then `npm run build`. On Windows, use the same short writable persistence directory for migration and the local server:

```powershell
$localState = Join-Path $env:TEMP 'wht-development-state'
node node_modules/wrangler/bin/wrangler.js d1 migrations apply DB --local --persist-to $localState
node node_modules/wrangler/bin/wrangler.js pages dev dist --persist-to $localState
```

The clean-clone verification applied all three migrations and returned schema-3 JSON from `/api/health`. Its original deeply nested default SQLite path failed with an opaque internal error; changing only the persistence directory resolved it. Keep local state separate from production/preview data. Local tests do not prove native acceptance or authorize a remote write.

## Authorized Pages promotion

A new-computer setup does not deploy anything. For a separately authorized release, identify the reviewed commit, build it, privately verify the account/project and both environments against the configuration export, and set `$project` and `$branch` to that verified target. Preview uses its intended preview branch; production uses the existing production branch. Do not derive the target from example configuration or publish its value.

Run the following from the actual application directory containing `functions/`. This temporarily removes JSONC discovery, installs the verified private TOML, and restores the original tracked file even if deployment fails:

```powershell
$privateConfig = (Resolve-Path tmp/private-platform/wrangler.toml).Path
$placeholder = Join-Path (Get-Location).Path 'wrangler.jsonc'
$saved = "$placeholder.portable-placeholder"
if (-not $project -or -not $branch) { throw 'Set and privately verify the authorized target first.' }
if (-not (Test-Path functions) -or -not (Test-Path dist)) { throw 'Use the built application directory.' }
if ((Test-Path $saved) -or (Test-Path wrangler.toml)) { throw 'Preserve existing temporary/private configuration first.' }
$originalHash = (Get-FileHash -LiteralPath $placeholder -Algorithm SHA256).Hash
try {
    Move-Item -LiteralPath $placeholder -Destination $saved
    Copy-Item -LiteralPath $privateConfig -Destination wrangler.toml
    node node_modules/wrangler/bin/wrangler.js pages deploy dist --project-name $project --branch $branch --commit-hash (git rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) { throw 'Pages deployment failed; inspect private diagnostics.' }
} finally {
    if (Test-Path wrangler.toml) { Remove-Item -LiteralPath wrangler.toml }
    if (Test-Path $saved) { Move-Item -LiteralPath $saved -Destination $placeholder }
    if ((Get-FileHash -LiteralPath $placeholder -Algorithm SHA256).Hash -ne $originalHash) { throw 'Tracked configuration restoration mismatch.' }
}
```

Before running this procedure, exclude `wrangler.toml` and `wrangler.jsonc.portable-placeholder` using the setup guide. Afterward, re-download the project configuration privately, compare effective bindings/variables with the preflight export, and move the readback out of config discovery. Verify JSON health with schema 3, anonymous protected API denial, the released assets, and actual navigation on the intended host. A successful static upload alone is insufficient. Keep preview and its database intact. Do not repeat signing, accepted Task 7/8 checks, or phone acceptance as part of documentation or machine setup.
