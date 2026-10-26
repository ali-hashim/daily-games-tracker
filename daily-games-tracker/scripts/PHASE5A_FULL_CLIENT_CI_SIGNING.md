# Full-client CI signing automation

The authoritative workflow is
`.github/workflows/shortcut-sign-disabled.yml`. Its filename remains a stable
ledger reference. The protected job runs automatically for relevant pushes to
`main` and offers a manual `workflow_dispatch` recovery path. It requires the
`wht-shortcut-signing` environment, has no pull request trigger, and uploads no
public artifacts. CI builds and inspects the package before sending one private
worker request; it never stores a signed Shortcut on the runner.

The tracked Cherri source and native contract contain the literal
`__WHT_RUNTIME_ORIGIN__` token. Protected CI obtains the runtime origin from the
environment, rejects reserved placeholder hosts, and renders source only in
runner temporary space. Routine unsigned CI uses the sanitized fixture origin
`https://runtime.example.invalid`; that fixture is accepted only for unsigned
checks. No deployment origin, signed Shortcut, XML, HubSign wire body, or
private receipt data is checked in or uploaded as a public Actions artifact.

The protected environment requires exactly these secrets:

* `WHT_RUNTIME_ORIGIN`: the runtime HTTPS origin, without path, query,
  fragment, userinfo, whitespace, or trailing slash. Protected CI rejects
  `localhost` and reserved `.invalid`, `.example`, and `.test` hosts.
* `WHT_REVIEWED_APPLICATION_COMMIT`: the exact reviewed commit for manual
  recovery. Automatic pushes use the protected `main` push SHA; both paths
  verify checkout identity before building.
* `WHT_SIGNING_RECEIPT_URL`: a private HTTPS endpoint implementing the durable
  worker contract below.
* `WHT_SIGNING_RECEIPT_TOKEN`: a bearer token for that endpoint.

The environment also needs an administrator-configured required reviewer. A
relevant push starts automatically after that protected approval. Manual
recovery additionally requires `confirm_external_signing=true` and the
reviewed-commit secret to equal the run SHA. This repository cannot provision
those secrets, reviewers, or the private worker service, so the workflow stays
fail-closed until an administrator completes that configuration.

## Durable private worker contract

The deployable implementation and private deployment template are kept in
`daily-games-tracker/scripts/private-signing-worker/`; its README contains the
administrator-only setup steps and the synthetic persistence checks.

CI validates the frozen package and sends one JSON `POST` with
`status: "sign"`. The request includes the source commit, the SHA-256 of the
runtime-origin target, computed manifest and wire SHA-256 values, the exact
`Upload To WHT` name, and the base64 HubSign wire. The request is private and
never appears in public logs or artifacts.

The worker derives the stable logical operation key by hashing the exact UTF-8
bytes `wht-shortcut-signing-v2\n<sourceCommit>\n<targetOriginSha256>`:

```text
operationKey = SHA256(UTF8("wht-shortcut-signing-v2\n" + sourceCommit + "\n" + targetOriginSha256))
```

It atomically records that key with the manifest and wire metadata, rejects a duplicate key with changed metadata, performs exactly one
HubSign transfer, and durably persists the signed Shortcut before returning:

```json
{"status":"completed","idempotencyKey":"<same-key>","durableReceiptId":"<private-id>","signedShortcutSha256":"<sha256>"}
```

CI receives receipt metadata, then downloads the signed bytes through the
authenticated private recovery endpoint to runner temporary storage. A lost
response is recovered by rerunning the same key; the worker returns the
persisted receipt and bytes without signing again. The workflow never uploads
that private file as a public artifact.
`409`/`423`, malformed responses, missing or non-exact echoed keys, and
ambiguous transport failures stop the run without retrying or exposing signed
bytes. A generic documentation endpoint such as
`https://private.example.invalid/receipt` is illustrative only and is not a
configured service.

## Offline checks

Run from a fresh repository clone with Python 3 and Node.js:

```text
node daily-games-tracker/scripts/phase5a-verify-signing-workflow.mjs
node --test daily-games-tracker/scripts/tests/phase5a-verifier.test.mjs daily-games-tracker/scripts/tests/phase5a-signing-workflow.test.mjs
python3 -m unittest daily-games-tracker/scripts/tests/test_phase5a_private_receipt.py daily-games-tracker/scripts/tests/test_phase5a_upload.py
```

The pinned Cherri compiler is authoritative in CI. No local compiler, signing,
install, activation, deployment, or HubSign request is part of these checks.
