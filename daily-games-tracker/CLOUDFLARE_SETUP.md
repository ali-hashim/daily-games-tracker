# Cloudflare Provisioning Checklist

**Phase 1 historical record:** The earlier Pages and D1 provisioning evidence is retained privately. Hosted origins and deployment identities are intentionally omitted here; current work continues in `PHASE_2_ACCESS_SETUP.md`.

The local application is ready without Cloudflare credentials. Complete this checklist before the first preview deployment. Do not paste API tokens or database credentials into tracked files.

## 1. Authenticate and create resources

```bash
npx wrangler login
npx wrangler pages project create <private-pages-project> --production-branch main
npx wrangler d1 create <private-preview-d1-name>
npx wrangler d1 create <private-production-d1-name>
```

Record the two D1 `database_id` values only in private platform configuration. They are operational resource identifiers and must not be copied into tracked documentation.

## 2. Replace safe placeholders

In a private Wrangler configuration used for remote work:

- replace the local D1 placeholders with private preview and production D1 IDs in the selected environment configuration;
- keep the tracked all-zero placeholders unchanged.

The tracked `wrangler.jsonc` contains inert placeholders and is for local development only. Pages treats a Wrangler file as the source of truth for project configuration, so dashboard settings do not override its binding values. Before running remote commands, create private environment-specific copies beside the tracked file, with the actual Pages project name and D1 and R2 resource names. Put the copy names in the local `.git/info/exclude` file and verify each with `git check-ignore -q <private-config-path>` before adding private values. Select the matching private preview or production configuration with Wrangler's `--config` option for every remote command.

Cloudflare Pages supports separate `env.preview` and `env.production` overrides. Keep the `DB` and `SHORTCUT_BUCKET` binding names the same in every environment, and use the selected environment's private D1 and R2 resources.

## 3. Configure private Shortcut delivery

Complete this owner checklist before enabling signing. Keep resource values and credentials private;
the tracked `wrangler.jsonc` uses the inert bucket placeholder `example-shortcut-bucket`.

1. Create a private R2 bucket for signed Shortcuts and signing state.
2. Create an S3 API token scoped to that bucket with only the required object read/write access.
3. Add these four secrets to the GitHub `wht-shortcut-signing` environment:
   `WHT_R2_ACCOUNT_ID`, `WHT_R2_BUCKET_NAME`, `WHT_R2_ACCESS_KEY_ID`, and
   `WHT_R2_SECRET_ACCESS_KEY`.
4. Bind the bucket as `SHORTCUT_BUCKET` in Cloudflare Pages preview and production. Use the same
   binding name in the private Wrangler configuration copies for both environments.
5. Save the credentials in a password manager. Do not put values in tracked Wrangler files, docs,
   test fixtures, pull-request text, or workflow output.

The tracked Wrangler configuration uses only `example-shortcut-bucket`; substitute the real resource
name only in ignored private Wrangler copies.

### One-time legacy state migration

The new signing guard requires the existing ambiguity record to be migrated before signing. After
the workflow changes reach protected `main`, dispatch
`.github/workflows/shortcut-r2-migrate.yml` with `confirm_migration=true`. The default is false.
That workflow uses the pinned legacy decoder, writes the exact verified plaintext record to private
R2, and verifies the stored bytes without signing or changing the lease. After it succeeds, download
the record to private local storage, compute its SHA-256 there, and set
`WHT_AMBIGUITY_RECORD_SHA256` in the `wht-shortcut-signing` environment. Verify the protected
signing guard accepts the stored record, then remove the legacy
`WHT_AMBIGUOUS_SIGNING_RECORD` and `WHT_SIGNING_OUTPUT_KEY` secrets. Keep the plaintext, envelope,
digest, and credentials out of logs and tracked files. Missing or mismatched state must keep signing
blocked. This documentation is a checklist; it does not execute the migration or configure secrets.

## 4. Migrate and deploy preview

```bash
npm run build
npx wrangler --config <private-preview-config> d1 migrations apply DB --remote --env preview
npx wrangler --config <private-preview-config> pages deploy dist --branch <preview-branch>
```

Verify the generated preview origin privately; do not record its hostname or deployment ID in tracked files:

- `/` loads Winstitute of Higher Thinking;
- `/api/health` returns `status: ok`, `schemaVersion: 1`, and a `request_id`;
- `/api/games` returns Krillion and MapTap;
- API responses include `Cache-Control: no-store` and `X-Request-ID`;
- an unknown `/api/*` route returns the JSON `NOT_FOUND` envelope;
- `/sw.js` is available and API/admin/registration requests never appear in its cache.

## 5. Production safety gate

Do not deploy production yet. Phase 2 must first configure Cloudflare Access for `/admin*` and `/api/admin/*`, establish the initial administrator identity, and verify invitation/device revocation behavior.

When that gate passes:

```bash
npx wrangler --config <private-production-config> d1 migrations apply DB --remote --env production
npx wrangler --config <private-production-config> pages deploy dist --branch <production-branch>
```

References:

- [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Cloudflare Pages D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Cloudflare R2 buckets](https://developers.cloudflare.com/r2/buckets/)
