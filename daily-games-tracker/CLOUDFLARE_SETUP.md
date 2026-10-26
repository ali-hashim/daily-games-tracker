# Cloudflare Provisioning Checklist

**Phase 1 completed:** Pages and both D1 databases are provisioned. The preview is verified at `https://7d209a65.winstitute-of-higher-thinking.pages.dev`. The steps below are the historical provisioning checklist; current work continues in `PHASE_2_ACCESS_SETUP.md`.

The local application is ready without Cloudflare credentials. Complete this checklist before the first preview deployment. Do not paste API tokens or database credentials into tracked files.

## 1. Authenticate and create resources

```bash
npx wrangler login
npx wrangler pages project create winstitute-of-higher-thinking --production-branch main
npx wrangler d1 create wht-preview-db
npx wrangler d1 create wht-production-db
```

Record the two D1 `database_id` values. They are resource identifiers, not secret credentials.

## 2. Replace safe placeholders

In `wrangler.jsonc`:

- replace `11111111-1111-1111-1111-111111111111` with the preview D1 ID;
- replace `22222222-2222-2222-2222-222222222222` with the production D1 ID;
- keep the all-zero local placeholder unchanged.

Cloudflare Pages supports `env.preview` and `env.production` overrides. The D1 binding name must remain `DB` in every environment.

## 3. Migrate and deploy preview

```bash
npm run build
npm run db:preview:migrate
npm run deploy:preview
```

Verify the generated preview URL:

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
