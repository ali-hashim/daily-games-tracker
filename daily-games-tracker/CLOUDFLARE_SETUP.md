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

In `wrangler.jsonc`:

- replace the local D1 placeholders with private preview and production D1 IDs in the selected environment configuration;
- keep the all-zero local placeholder unchanged.

Cloudflare Pages supports `env.preview` and `env.production` overrides. The D1 binding name must remain `DB` in every environment.

## 3. Migrate and deploy preview

```bash
npm run build
npm run db:preview:migrate
npm run deploy:preview
```

Verify the generated preview origin privately; do not record its hostname or deployment ID in tracked files:

- `/` loads Winstitute of Higher Thinking;
- `/api/health` returns `status: ok`, `schemaVersion: 1`, and a `request_id`;
- `/api/games` returns Krillion and MapTap;
- API responses include `Cache-Control: no-store` and `X-Request-ID`;
- an unknown `/api/*` route returns the JSON `NOT_FOUND` envelope;
- `/sw.js` is available and API/admin/registration requests never appear in its cache.

## 4. Production safety gate

Do not deploy production yet. Phase 2 must first configure Cloudflare Access for `/admin*` and `/api/admin/*`, establish the initial administrator identity, and verify invitation/device revocation behavior.

When that gate passes:

```bash
npm run db:production:migrate
npm run deploy:production
```

References:

- [Cloudflare Pages Wrangler configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/)
- [Cloudflare Pages D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/)
