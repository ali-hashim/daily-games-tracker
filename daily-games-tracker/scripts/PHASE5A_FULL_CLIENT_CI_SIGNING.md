# Full-client CI signing automation

The authoritative workflow is
`.github/workflows/shortcut-sign-disabled.yml`. Its filename remains a stable
ledger reference. The protected job runs automatically for relevant pushes to
`main` and offers manual recovery and explicitly authorized re-sign paths via
`workflow_dispatch`. It requires the
`wht-shortcut-signing` environment and has no pull request trigger. GitHub
commit status remains the durable lease; private R2 holds the durable intent,
provider outcome, result metadata, migrated ambiguity record, and one canonical
signed Shortcut object. The runner keeps its build package and in-flight signed
bytes in temporary storage. No signing state or Shortcut bytes are uploaded as
GitHub Actions artifacts, including as a backup. The R2 objects are protected
by private bucket access; this workflow adds no custom application encryption.

The tracked Cherri source and native contract contain the literal
`__WHT_RUNTIME_ORIGIN__` token. Protected CI obtains the runtime origin from the
environment, rejects reserved placeholder hosts, and renders source only in
runner temporary space. Routine unsigned CI uses the sanitized fixture origin
`https://runtime.example.invalid`; that fixture is accepted only for unsigned
checks. No deployment origin, signed Shortcut, XML, HubSign wire body, or
private receipt data is checked in or uploaded as a public Actions artifact.

The protected `wht-shortcut-signing` environment requires these values:

* `WHT_RUNTIME_ORIGIN`: the runtime HTTPS origin, without path, query,
  fragment, userinfo, whitespace, or trailing slash. Protected CI rejects
  `localhost` and reserved `.invalid`, `.example`, and `.test` hosts.
* `WHT_R2_ACCOUNT_ID`, `WHT_R2_BUCKET_NAME`, `WHT_R2_ACCESS_KEY_ID`, and
  `WHT_R2_SECRET_ACCESS_KEY`: credentials for a bucket-scoped S3 API token.
  The Node.js standard-library SigV4 client uses these only for private R2
  requests. R2 requests have bounded retries (at most four total attempts per
  operation); HubSign requests are never retried.
* `WHT_AMBIGUITY_RECORD_SHA256`: the lowercase SHA-256 digest of the exact
  migrated ambiguity record object stored in private R2. It is a protected
  integrity pin, not a fifth R2 credential. A missing record, invalid digest,
  or mismatch fails closed before a transfer.
* `WHT_AMBIGUOUS_RECOVERY_AUTH`: an optional, protected base64 JSON
  authorization used only by the manual recovery path. Ordinary recovery
  authorization binds the current run ID and first attempt to the reviewed
  source commit, logical identity, current target hash, migrated wire digest,
  and derived operation key. A prior-run authorization has a narrower role: it
  can prove a completed prior operation for a legacy record without a target
  hash, under the extra checks below. It does not approve the current run and
  is ignored on automatic pushes. Neither form clears or rewrites the record.

## One-time private state migration

Before the signing workflow can use the migrated-state guard, the owner must
configure the private bucket credentials and the existing
`WHT_AMBIGUOUS_SIGNING_RECORD` and `WHT_SIGNING_OUTPUT_KEY` secrets in the
`wht-shortcut-signing` environment. Keep both legacy secrets available until
the new R2 record and its digest pin have been verified.

Dispatch `.github/workflows/shortcut-r2-migrate.yml` from protected `main` and
set its required `confirm_migration` input to `true`. Its default is `false`.
The job first checks the run SHA against the protected `main` tip and verifies
the production environment policy with the existing approval proof helper.
Only then does it load the legacy decoder from immutable commit
`5aa8b090221a89791486a328fba49b7e2144873f` into runner temporary storage and
provide the legacy secrets and R2 credentials to the migration step. The
helper validates and decrypts the existing envelope with that decoder, then
writes the original plaintext bytes to
`signing/migrated-ambiguity.json` using a bounded, readback-verified R2 write.
An identical existing object is accepted without rewriting it; different
existing bytes fail closed. Private command output is suppressed and errors
remain generic. The migration has no signing, HubSign, lease, status, signed
object, latest manifest, GitHub secret, or Actions artifact operation.

After a successful migration, use the existing authenticated Wrangler setup to
download only `signing/migrated-ambiguity.json` into private local temporary
storage. Compute the SHA-256 from those exact bytes locally and configure
`WHT_AMBIGUITY_RECORD_SHA256` as a protected environment secret. Keep the old
record and encryption-key secrets until the owner has verified that the
downloaded bytes match the configured digest and the protected signing guard
accepts the private record. Then retire the two old secrets. Do not print the
record, decrypted plaintext, old envelope, or its digest into logs or tracked
files.

The private record plaintext has the bounded shape
`{"schemaVersion":1,"status":"ambiguous","logicalSourceIdentity":"<sha256>","wireSha256":"<sha256>"}`;
an optional `targetOriginSha256` narrows the block. Store that JSON as the
private R2 object itself; the workflow does not wrap it in an encrypted
envelope.
When present, the target hash scopes the logical-source fallback to that
target. Distinct target hashes derive distinct operation keys and status
contexts. Such target-scoped records do not use the legacy prior-run proof
path described below. A matching old wire digest remains permanently blocked.

The logical source identity uses the canonical semantic projection in the
build manifest: maintained source, capture, and native-contract digests; the
Cherri name/version/commit; Go version; runner; and compiler flags. The raw
`provenance/toolchain.lock.json` SHA-256 remains independently checked as
immutable provenance, but JSON formatting, history notes, and other lock-file
metadata cannot create a new logical operation. A migrated ambiguity record is
derived privately from the reviewed historical build and its preserved wire
evidence; callers cannot supply an arbitrary logical identity to clear it.

The production environment must have administrator bypass disabled, a custom
deployment branch policy allowing only `main`, and no `required_reviewers`
protection rule. Protect `main` with pull requests and administrator bypass
disabled; zero human approvals are needed for a PR to merge. Before building,
the job checks the run identity, verifies the run SHA equals the current `main`
tip, and confirms GitHub reports `main` as protected. It also checks the exact
environment and main-only deployment policy through the GitHub API. Missing,
stale, malformed, or inaccessible evidence fails closed. The user's standing
authorization applies to eligible pushes and confirmed manual dispatches;
production signing does not wait for a per-run environment approval. The
migrated record permanently blocks the exact old wire. For a different wire,
a bounded exception can be requested only by a manually dispatched run with
both `confirm_external_signing=true` and `confirm_ambiguous_recovery=true`, and
`GITHUB_RUN_ATTEMPT=1`. The authorization must either exactly bind the current
run and package, or provide successful prior-run proof for a legacy migrated
record without `targetOriginSha256`, as detailed below. The existing pending
status lease is still authoritative: once written, it blocks every rerun and
the workflow has no retry path. The workflow does not contact a separate
receipt service or accept a configurable signing endpoint. The owner must also
configure the `SHORTCUT_BUCKET` binding for both Pages preview and production
with private environment-specific Wrangler configuration. The tracked
`wrangler.jsonc` contains a bucket placeholder and is not deployable as-is;
because the Wrangler file is the Pages configuration source of truth, setting
the dashboard alone does not override that placeholder. Keep private
environment-specific config copies out of Git, use the correct preview or
production config for each operation, and keep credential copies in a password
manager. On a real iPhone, verify both the Safari download and Add Shortcut
prompt and the in-app update flow. The API returns the required relative
`/api/shortcut/download` URL, while the unchanged native Shortcut source does
not add a base origin; native resolution remains unverified. If that phone
check fails, resolving it requires a follow-up decision about the relative URL
contract or a Shortcut source change. Neither path has been verified here.

### Production signing authorization

The user has granted standing authorization for eligible production pushes
and exact manual dispatches. No per-run approval comment or GitHub environment
review is required. For manual dispatch, select `main` and set
`confirm_external_signing=true`. Production still checks that the run SHA is
the current `main` tip and that `main` is protected. Package validation, the
status lease, and the separate two-input authorization for ambiguous recovery
remain required.

The separate manual `shortcut-approval-rehearsal.yml` workflow is a read-only
experiment. It never builds or signs a Shortcut, contacts HubSign, or uses the
signing environment. To rehearse it after review and publication, an
administrator must configure a separate `wht-signing-approval-rehearsal`
environment with an explicit User required reviewer, administrator bypass
disabled, and main-only deployment policy. Dispatch it on the reviewed main
commit; the configured reviewer must approve with the exact comment
`reviewed <full-commit-sha>`. The job rejects reruns, missing or mismatched
approval, a different reviewer or environment, and enabled administrator
bypass. It requests only Actions and contents read permissions. This
rehearsal's manual review does not gate production signing.

To verify the production environment settings and Actions-token API access
without signing, use `shortcut-production-approval-proof.yml` after the
workflow and verifier have been reviewed and published. Configure the
production environment with administrator bypass disabled, no required
reviewer, and a custom branch policy containing only `main`; protect `main` as
described above. Dispatch the proof from the current `main` tip. The job checks
the exact run SHA and branch, the current protected `main` tip, the production
environment, and its branch policy; it does not read signing secrets, build
packages, write a status, contact HubSign, or invoke the signing workflow.
Inspect the job result before drawing conclusions. A passing proof checks the
standing authorization boundary; it does not itself perform or authorize a
signing transfer.

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
unsigned package, checks the protected R2 ambiguity record and existing state,
then posts a GitHub commit status with the operation context in `pending`
state on that anchor before writing the private intent at
`signing/intents/<operation-key>.json`. The intent binds the operation to the
workflow run ID and attempt so another run cannot reuse it. A later run on an
unrelated commit queries the same anchor and stops when it sees that context.
An existing status for the current target's operation key or an existing
private intent always blocks preparation; pending and terminal statuses are
never reset. The known wire digest from the prior ambiguous operation also
remains permanently blocked, even with a matching current-run recovery
authorization and even if the source commit, manifest, or provenance files
change.

For a legacy migrated record that has no `targetOriginSha256`, a prior-run
authorization can serve as evidence that the old ambiguous operation already
completed successfully. This exception still requires a manual dispatch with
both `confirm_external_signing=true` and `confirm_ambiguous_recovery=true`,
and `GITHUB_RUN_ATTEMPT=1`. The authorization must name a different, prior run; its
logical source identity must match both the migrated record and current
package; its migrated wire digest must match the record; and its operation key
must recompute from that identity and its own prior target hash. The prior
target hash must differ from the current target, and the status ledger must
show `success` for that prior operation key. The current operation key must
have no status, and the current package's wire digest must differ from the
migrated wire digest. Missing, pending, failed, or mismatched prior evidence
blocks preparation. This proof does not bypass the production authorization
checks, the current-target status check, or the permanent old-wire block.

The status read uses the combined-status endpoint with `per_page=100` and
walks every page. It requires the returned anchor SHA, total count, page shape,
status states, and terminal page count to agree; a failed, malformed,
truncated, or inconsistent page stops before any pending write. The pending
write response must echo both the exact context and `pending` state before the
intent is created.

The send step makes exactly one direct POST to the fixed HubSign endpoint. It
uses the frozen wire bytes, rejects redirects, and requires the expected
binary response and `AEA1` container. It keeps the signed bytes and result
in runner temporary storage and writes its result metadata to
`signing/results/<operation-key>.json`. The metadata includes the signed-byte
digest and canonical object key; the signed bytes themselves stay in the local
runner file until publication. The publish step reads that file and metadata,
then writes exactly one canonical signed object at
`shortcuts/<source-commit>/<signed-sha256>.shortcut`; it reads back and verifies
the object digest. Only after that confirmation does it write the root
`latest.json` manifest, also verifying the write by reading it back. The
manifest has exactly `{ "commit", "sha256", "key" }`, where `key` is the
canonical object key. No second `.shortcut` staging object is retained in R2.
The existing mark-complete step reads and verifies the result metadata,
canonical object, and latest manifest, then marks the same status `success`; it
performs no upload. Recovery verifies private R2 state and hashes locally; it
never contacts HubSign.

If HubSign returns a non-accepted response, returns malformed signed bytes, or
the transport fails after the request is started, the send step writes
`signing/outcomes/<operation-key>.json` in private R2 before failing. It records
bounded diagnostic metadata without printing provider response bytes. Any
outcome, result metadata, or signed object already present blocks another send;
the pending status remains ambiguous and no retry is enabled.

If the runner loses the response after the provider request, the pending
status remains ambiguous. R2 is the durable state store, not a backup Actions
artifact. The automatic path and legacy ambiguity-recovery path cannot clear
an existing status or repeat a provider request for that logical operation or
its old wire. This preserves at-most-one provider attempt for those paths.

### Explicit manual re-sign

A separately reviewed manual re-sign can authorize one new provider request
for a logical package with an existing success, failure, error, or ambiguous
attempt, including the same wire digest. It does not remove or rewrite prior
statuses or the migrated ambiguity record. Every dispatch rebuilds and checks
the exact current package, binds the new private intent to the actor, run,
source commit, reason, package digests and logical operation, then takes a
request-specific send lease before its single HubSign POST. The new request ID
is single-use; a rerun or reuse is rejected. If another request is needed,
review it again and use a new ID.

On protected `main`, dispatch
`.github/workflows/shortcut-sign-disabled.yml` with all of these inputs:

* `confirm_external_signing=true` and `confirm_manual_resign=true`.
* `manual_resign_request_id`: a fresh lowercase UUIDv4 used for this one
  authorization only. Never reuse it or rerun its workflow.
* `manual_resign_source_commit`: the full reviewed commit SHA; it must equal
  the protected workflow run's checked-out commit.
* `manual_resign_reason`: choose one of `delivery-verification-failed`,
  `prior-signature-unavailable`, `previous-outcome-ambiguous`, or
  `post-delivery-integrity-check-failed`.
* `confirm_earlier_request_may_have_completed=true`, acknowledging that an
  earlier request might already have completed.

The workflow also requires prior evidence for that exact logical package and
its ordinary production, source, digest, concurrency and R2 checks. Manual
re-sign is not an automatic retry: it is a new, actor- and run-bound
authorization for a reviewed package. The automatic push path and legacy
recovery guard remain unchanged.

## Offline checks

Run from a fresh repository clone with Python 3 and Node.js:

```text
node daily-games-tracker/scripts/phase5a-verify-signing-workflow.mjs
node --test daily-games-tracker/scripts/tests/phase5a-actions-signing.test.mjs daily-games-tracker/scripts/tests/phase5a-r2-store.test.mjs daily-games-tracker/scripts/tests/phase5a-signing-workflow.test.mjs daily-games-tracker/scripts/tests/phase5a-approval-rehearsal.test.mjs daily-games-tracker/scripts/tests/phase5a-production-approval-proof.test.mjs daily-games-tracker/scripts/tests/phase5a-r2-migration.test.mjs
python3 -m unittest daily-games-tracker/scripts/tests/test_phase5a_upload.py
```

The pinned Cherri compiler is authoritative in CI. These checks do not perform
signing, install or activate a Shortcut, deploy Pages, create or update R2
resources or secrets, or contact HubSign. No local Cherri compiler is used.
