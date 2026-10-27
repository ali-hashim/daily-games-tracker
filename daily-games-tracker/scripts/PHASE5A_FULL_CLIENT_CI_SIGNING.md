# Full-client CI signing automation

The authoritative workflow is
`.github/workflows/shortcut-sign-disabled.yml`. Its filename remains a stable
ledger reference. The protected job runs automatically for relevant pushes to
`main` and offers a manual `workflow_dispatch` recovery path. It requires the
`wht-shortcut-signing` environment, has no pull request trigger, and uploads
only encrypted private intent, provider-outcome, and result envelopes. Unsigned packages and signed
Shortcut bytes stay in runner temporary storage unless they are inside those
authenticated encrypted envelopes.

The tracked Cherri source and native contract contain the literal
`__WHT_RUNTIME_ORIGIN__` token. Protected CI obtains the runtime origin from the
environment, rejects reserved placeholder hosts, and renders source only in
runner temporary space. Routine unsigned CI uses the sanitized fixture origin
`https://runtime.example.invalid`; that fixture is accepted only for unsigned
checks. No deployment origin, signed Shortcut, XML, HubSign wire body, or
private receipt data is checked in or uploaded as a public Actions artifact.

The protected environment requires these private values:

* `WHT_RUNTIME_ORIGIN`: the runtime HTTPS origin, without path, query,
  fragment, userinfo, whitespace, or trailing slash. Protected CI rejects
  `localhost` and reserved `.invalid`, `.example`, and `.test` hosts.
* `WHT_SIGNING_OUTPUT_KEY`: canonical base64 for exactly 32 random bytes. It
  encrypts intent and result envelopes with Node's authenticated AES-256-GCM.
* `WHT_AMBIGUOUS_SIGNING_RECORD`: a base64-encoded AES-256-GCM envelope,
  encrypted with the output key, containing the private migrated ambiguity
  record. It includes the prior logical source identity and wire digest, and
  may include its target hash. The record is required before any transfer.
* `WHT_AMBIGUOUS_RECOVERY_AUTH`: an optional, protected base64 JSON
  authorization for the single manually approved recovery run. Its fields
  bind the run ID and first attempt to the reviewed source commit, semantic
  logical identity, protected target hash, migrated wire digest, and derived
  operation key. It is ignored on automatic pushes and is never a reason to
  clear or rewrite the migrated record.

The private record plaintext has the bounded shape
`{"schemaVersion":1,"status":"ambiguous","logicalSourceIdentity":"<sha256>","wireSha256":"<sha256>"}`;
an optional `targetOriginSha256` narrows the block. Generate the envelope with
the `encodeMigratedAmbiguityRecord` helper in
`phase5a_actions_signing.mjs` while the output key remains in process memory;
do not print the value into CI logs or tracked files.

The logical source identity uses the canonical semantic projection in the
build manifest: maintained source, capture, and native-contract digests; the
Cherri name/version/commit; Go version; runner; compiler flags; and the pinned
checkout, setup-go, and upload-artifact action triplets. The raw
`provenance/toolchain.lock.json` SHA-256 remains independently checked as
immutable provenance, but JSON formatting, history notes, and other lock-file
metadata cannot create a new logical operation. A migrated ambiguity record is
derived privately from the reviewed historical build and its preserved wire
evidence; callers cannot supply an arbitrary logical identity to clear it.

The environment also needs an administrator-configured individual required
reviewer, administrator bypass disabled, and a custom deployment branch policy
allowing only `main`. The job checks these settings through the GitHub API
before building and fails closed on absent, malformed, or inaccessible evidence.
The reviewer must approve the first attempt with the exact comment
`reviewed <full-commit-sha>`, using the run's reviewed commit. Push and manual
runs both require this approval; the job also verifies checkout identity before
building. A relevant push starts automatically after that
protected approval. The migrated
record blocks the old logical package by default. A bounded exception can be
requested only by a manually dispatched run with both
`confirm_external_signing=true` and `confirm_ambiguous_recovery=true`, the
required reviewer approval, `GITHUB_RUN_ATTEMPT=1`, and a recovery secret whose
authenticated fields match the exact run and package. The existing pending
status lease is still authoritative: once written, it blocks every rerun and
the workflow has no retry path. The workflow does not contact a separate
receipt service or accept a configurable signing endpoint.

### Approving a signing run

For each intended signing run, review the exact `main` commit and its signing
inputs. Compare the run's displayed SHA with the reviewed SHA, then approve
its protected environment job with `reviewed <full-commit-sha>`. This can be
done in GitHub without a development machine or a separately maintained commit
secret. Approval does not bypass the package validation, ledger checks, or the
separate authorization required for an ambiguous recovery.

The separate manual `shortcut-approval-rehearsal.yml` workflow is a read-only
experiment. It never builds or signs a Shortcut, contacts HubSign, or uses the
signing environment. To rehearse it after review and publication, an
administrator must configure a separate `wht-signing-approval-rehearsal`
environment with an explicit User required reviewer, administrator bypass
disabled, and main-only deployment policy. Dispatch it on the reviewed main
commit; the configured reviewer must approve with the exact comment
`reviewed <full-commit-sha>`. The job rejects reruns, missing or mismatched
approval, a different reviewer or environment, and enabled administrator
bypass. It requests only Actions and contents read permissions. The production
job separately checks the exact-commit approval and its main-only branch policy.

To prove the production environment's actual protection and Actions-token API
access without signing, use `shortcut-production-approval-proof.yml` after the
workflow and verifier have been reviewed and published. First configure the
production environment with administrator bypass disabled, an individual
required reviewer, and a custom branch policy containing only `main`. Dispatch
the proof on the reviewed `main` commit. The configured reviewer approves its
first attempt with `reviewed <full-commit-sha>` for that exact run. The job
uses the production verifier and read-only token permissions; it does not read
signing secrets, build packages, write a status, contact HubSign, or invoke the
signing workflow. Inspect the job result before drawing conclusions. A passing
proof does not itself authorize a signing run.

## Actions-only state machine

`phase5a_actions_signing.mjs` derives the stable logical operation key by
hashing the exact UTF-8 bytes
`wht-shortcut-signing-v3\n<logicalSourceIdentity>\n<targetOriginSha256>`.
The logical source identity is derived from the package's source, toolchain,
compiler, and native-contract hashes, so unrelated repository commits do not
create a new lease. The target hash is computed from the protected
runtime-origin value; the origin itself is never placed in the operation key's
public status context.

```text
operationKey = SHA256(UTF8("wht-shortcut-signing-v3\n" + logicalSourceIdentity + "\n" + targetOriginSha256))
```

The protected checkout fetches full history and uses its single repository
root commit as the status anchor. The prepare step validates the frozen
unsigned package and posts a GitHub commit status with the operation context in
`pending` state on that anchor before writing the encrypted intent. A later run
on an unrelated commit queries the same anchor and stops when it sees that
context. The known wire
digest from the prior ambiguous operation remains permanently blocked even if
the source commit, manifest, or provenance files change.

The status read uses the combined-status endpoint with `per_page=100` and
walks every page. It requires the returned anchor SHA, total count, page shape,
status states, and terminal page count to agree; a failed, malformed,
truncated, or inconsistent page stops before any pending write. The pending
write response must echo both the exact context and `pending` state before the
intent is created.

The send step makes exactly one direct POST to the fixed HubSign endpoint. It
uses the frozen wire bytes, rejects redirects, requires the expected binary
response and `AEA1` container, and encrypts the signed bytes together with
their hashes before the result artifact is uploaded. The complete step marks
the same status `success`. Recovery verifies the authenticated envelope and
signed-byte hash locally; it never contacts HubSign.

If HubSign returns a non-accepted response, returns malformed signed bytes, or
the transport fails after the request is started, the send step writes an
authenticated encrypted provider-outcome envelope before failing. The envelope
contains the operation hashes, response status/content type when available,
body length and digest, and the bounded response body only inside the encrypted
envelope; it never prints the body or uploads plaintext. A protected cleanup
step uploads that ciphertext for diagnosis, while the pending status remains
ambiguous and no retry is enabled.

If the runner loses the response after the provider request, the pending
status remains ambiguous forever. Artifact retention or a later commit cannot
clear that status or authorize a second request. The workflow therefore gives
at-most-one provider attempt and honest post-send crash behavior; a human must
resolve any provider-side ambiguity outside this workflow before a future
logical operation can be authorized.

## Offline checks

Run from a fresh repository clone with Python 3 and Node.js:

```text
node daily-games-tracker/scripts/phase5a-verify-signing-workflow.mjs
node --test daily-games-tracker/scripts/tests/phase5a-actions-signing.test.mjs daily-games-tracker/scripts/tests/phase5a-signing-workflow.test.mjs daily-games-tracker/scripts/tests/phase5a-approval-rehearsal.test.mjs daily-games-tracker/scripts/tests/phase5a-production-approval-proof.test.mjs
python3 -m unittest daily-games-tracker/scripts/tests/test_phase5a_upload.py
```

The pinned Cherri compiler is authoritative in CI. No local compiler, signing,
install, activation, deployment, or HubSign request is part of these checks.
