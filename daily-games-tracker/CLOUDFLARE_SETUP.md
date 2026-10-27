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

Before enabling Shortcut signing, create a private R2 bucket and an S3 API token scoped to that
bucket. Configure the `SHORTCUT_BUCKET` R2 binding in each private preview and production Wrangler
configuration. Configure the signing GitHub environment with these secrets, keeping their values private:

- `WHT_R2_ACCOUNT_ID`
- `WHT_R2_BUCKET_NAME`
- `WHT_R2_ACCESS_KEY_ID`
- `WHT_R2_SECRET_ACCESS_KEY`

The checked-in Wrangler configuration uses only `example-shortcut-bucket`; replace it only in the
private Wrangler copies. Keep credential copies in a password manager.

Before the new signing workflow is enabled, privately migrate and verify the existing ambiguity
record. Use the reviewed legacy helper to decrypt and verify the old record, copy the exact verified
record into private R2, and configure `WHT_AMBIGUITY_RECORD_SHA256` in the signing GitHub
environment with that record's SHA-256 digest. Verify the new guard against the stored record
before retiring the legacy key and record secrets. Missing or mismatched state must keep signing
blocked. No bucket, credential, secret, or state migration is performed by this checklist.

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
