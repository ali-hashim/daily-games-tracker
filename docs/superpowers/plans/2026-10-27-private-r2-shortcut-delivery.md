# Private R2 Shortcut delivery implementation plan

Replace encrypted Actions artifacts with private R2 delivery. The existing signing key also protects intent, provider outcomes and the migrated ambiguity record; the user directed implementation through this dependency. Preserve semantic ambiguity checks and the GitHub pending lease while moving private state to R2. Existing encrypted state requires an owner-performed verified migration before the new workflow may run; missing state fails closed. This change performs no signing, deployment, resource creation, secret setup or remote database mutation.

## Shared contract

- Secrets: WHT_R2_ACCOUNT_ID, WHT_R2_BUCKET_NAME, WHT_R2_ACCESS_KEY_ID, WHT_R2_SECRET_ACCESS_KEY; existing bounded recovery authorization remains private. WHT_AMBIGUITY_RECORD_SHA256 pins the exact migrated R2 record bytes in protected environment configuration, preserving record integrity independently of bucket write access.
- Signed objects: shortcuts/<40-hex-source-commit>/<64-hex-sha256>.shortcut. Publish latest.json with exactly commit, sha256 and key only after the object upload is confirmed.
- Pages binding: SHORTCUT_BUCKET. Authenticated GET /api/shortcut/download validates the manifest and object digest and serves a fixed attachment filename with no-store.
- All private signing state stays in the private bucket; no Actions artifact, encryption dependency or plaintext log output. Never clear an existing lease or old-wire block.

## Tasks and ownership

1. Signing worker owns the signing workflow and phase5a signing scripts/tests. Add failing tests, implement dependency-free SigV4 R2 client with bounded retries and quiet errors, migrate state interfaces, keep pinned build/package/lease/provider guards, then verify targeted tests.
2. Application worker owns functions, src, integration/unit tests, wrangler.jsonc, .env.example, CLOUDFLARE_SETUP.md and DEVELOPMENT_WORKFLOW.md. Implement authenticated/rate-limited download, strict manifest/key/digest validation, install-route helper and environment bindings with placeholders; add meaningful tests first. No package or lockfile edits without coordination.
3. Orchestrator owns the unsigned/application CI test wiring and public policy updates; the application worker also aligns the signing documentation after the signing interface is stable. The orchestrator integrates and runs lint, format check, all typechecks, tests and build using the lockfile; scans public diff and checks no Shortcut source changes.
4. Independent Sol Medium reviewer inspects implementation and tests against requirements and guard equivalence. Luna XHigh workers repair findings; reviewer verifies repairs until clean.
5. Publish reviewed branch and PR with owner checklist and no-signing statement. Run the existing pinned unsigned CI on the reviewed revision; never dispatch the signing workflow. Do not merge or deploy.

## Owner checklist

Create private bucket and bucket-scoped credentials; configure the four signing-environment secrets; bind SHORTCUT_BUCKET for preview and production; keep credential copies in a password manager. Privately migrate and verify the existing ambiguity record before retiring the old key/record secrets. Verify Safari opening the downloaded signed file produces Add Shortcut on a real iPhone; this remains unverified by local/CI tests.
