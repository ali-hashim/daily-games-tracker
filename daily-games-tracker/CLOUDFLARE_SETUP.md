# Cloudflare configuration recovery

Cloudflare Pages, preview and production D1, Access, and the private R2 signing bucket are already provisioned. A new computer must reconnect to those existing resources; do not create replacement projects, databases, buckets, secrets, or signing state. The current deployment and outstanding owner checks are in [project status](PROJECT_STATUS.md). See the [production runbook](PRODUCTION_RUNBOOK.md) before any remote operation.

## Recover the existing Pages configuration

From the repository root, enter the application directory. Use the locked CLI, not a global or auto-installed Wrangler:

    cd daily-games-tracker
    npm ci
    npm exec --offline -- wrangler --version
    npm exec --offline -- wrangler login
    npm exec --offline -- wrangler whoami
    npm exec --offline -- wrangler pages project list

Run login only if this computer has no valid session. Authenticate to the owner-approved Cloudflare account; never copy .wrangler or an OAuth profile from another device. Identify the existing Pages project privately from the account dashboard and the read-only project list. Do not record its name or identifiers in public files.

Before downloading configuration, ensure there is no existing wrangler.toml to overwrite. Add these paths to the local Git exclude file before creating files:

    $exclude = (git rev-parse --git-path info/exclude).Trim()
    Add-Content -LiteralPath $exclude -Value @('/daily-games-tracker/wrangler.toml','/daily-games-tracker/wrangler.jsonc.portable-placeholder')

From the application directory, read the existing project configuration:

    npm exec --offline -- wrangler pages download config <existing-private-project-name>
    git check-ignore -q wrangler.toml

This command downloads current project configuration into an app-root wrangler.toml; do not pass --force. Treat that file as private: it includes resource bindings and identifiers and may include plain-text variables. The export does not reveal Cloudflare secret values. Confirm preview and production bindings against the existing Cloudflare dashboard without printing secret values. If it is already present, stop and preserve it rather than overwriting it.

After reviewing the export, move it out of automatic config discovery into ignored local storage. From the application directory:

```powershell
New-Item -ItemType Directory -Force tmp/private-platform | Out-Null
if (Test-Path tmp/private-platform/wrangler.toml) { throw 'Preserve the existing private configuration first.' }
git check-ignore -q tmp/private-platform/wrangler.toml
if ($LASTEXITCODE -ne 0) { throw 'Private configuration path must be ignored.' }
Move-Item -LiteralPath wrangler.toml -Destination tmp/private-platform/wrangler.toml
```

Keep the export out of commits, reports, logs, and screenshots. Ordinary local development uses the tracked placeholder JSONC, not this export.

GitHub Actions secret values cannot be exported from GitHub. If a credential must be recovered or rotated, use its authorized source (Cloudflare or the owner’s password manager) and update only the relevant existing setting. Do not copy credentials between computers, change unrelated settings, rerun the completed R2 state migration, or create new signing state. Preserve the existing SHORTCUT_BUCKET binding and signed object/state.

## Local development

Local development needs no Cloudflare login or remote resources. Copy .env.example to .dev.vars only when local Functions need variables; it contains inert local placeholders. See the [portable development handoff](../DEVELOPMENT_HANDOFF.md) for Node 22 setup and local Pages/D1 commands. On Windows, if a deep clone causes an opaque SQLite/path error, pass the same short private --persist-to directory to local D1 migration and wrangler pages dev; details are in the runbook.

## Remote operation boundaries

The checked-in wrangler.jsonc and npm scripts use placeholders and are not deploy targets. Pages deploy in Wrangler 4.151.3 does not support --config or --env; it discovers the existing project TOML from the actual working directory. The runbook gives the swap-and-restore procedure and requires separate authorization before deployment. D1 has different flags; inspect its installed command help and privately verify the selected database before any separately authorized remote write. No resource creation or migration is part of ordinary setup.

References: [Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/) and [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/).
