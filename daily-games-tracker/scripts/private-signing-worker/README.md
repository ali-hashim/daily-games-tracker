# Private Shortcut signing worker

This directory contains the deployable private receipt service used by the
protected CI signing workflow. The Worker routes each stable source-and-target
operation to the `SigningOperation` Durable Object. The Durable Object stores
the immutable claim, signed bytes, and receipt metadata in SQLite before it
returns success.

The operation key is the SHA-256 digest of the exact UTF-8 bytes
`wht-shortcut-signing-v2\n<sourceCommit>\n<targetOriginSha256>`. A duplicate
claim with different manifest or wire metadata returns `409`. A provider
timeout or transport failure permanently records `ambiguous`; recovery never
retries HubSign. Completed operations return the stored receipt metadata and
allow authenticated `GET /recover?idempotencyKey=<key>` requests to retrieve the
stored signed bytes. The recovery response is `application/octet-stream`, has
`cache-control: no-store`, echoes the key and signed-byte hash, and verifies
the stored bytes before returning them. Ambiguous operations never return
bytes.

## Private deployment

An administrator must deploy this Worker to a private account and keep its
service URL out of the repository, logs, and public artifacts. From a fresh
clone, the deployment shape is:

```text
npx wrangler deploy --config daily-games-tracker/scripts/private-signing-worker/wrangler.jsonc
npx wrangler secret put WHT_SIGNING_RECEIPT_TOKEN --config daily-games-tracker/scripts/private-signing-worker/wrangler.jsonc
```

The deployment must retain the fixed HubSign provider URL in
`wrangler.jsonc`, configure the secret token, and keep the Worker endpoint
private. Store the private Worker's `/sign` URL as
`WHT_SIGNING_RECEIPT_URL`; the client derives `/recover` on the same private
origin. The CI environment then stores that endpoint and token as
`WHT_SIGNING_RECEIPT_URL` and `WHT_SIGNING_RECEIPT_TOKEN`. The other protected
CI values are `WHT_RUNTIME_ORIGIN` and
`WHT_REVIEWED_APPLICATION_COMMIT`. The GitHub environment also needs a
required reviewer before the automatic main-push job can run.

The test-only HTTP escape hatch is supplied by the test harness and is absent
from the deployment template. Production code rejects alternate providers,
credentials, query strings, fragments, and non-HTTPS HubSign endpoints.

## Checks

Run the source contract and persistence checks from the app directory:

```text
node --test scripts/private-signing-worker/tests/worker.test.mjs
npx tsc --noEmit --target ES2022 --lib ES2022,WebWorker --types @cloudflare/workers-types --module ESNext --moduleResolution Bundler --strict --skipLibCheck scripts/private-signing-worker/src/index.ts
```

The integration tests run the actual Miniflare `workerd` runtime with the
SQLite Durable Object API and separate runtime instances to verify concurrent
duplicate claims, signed-receipt and signed-byte recovery after restart,
permanent ambiguous state after a timeout, bearer authentication, and wire
validation before any provider call. They use only synthetic bytes and never
contact HubSign.
