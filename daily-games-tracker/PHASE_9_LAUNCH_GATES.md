# Phase 9 launch gates and Phase 5A closeout ledger

**Current roadmap (October 25):** Engineering reviewed in the source; hosted preview identity is retained in private evidence and full readiness remains open. [Current status](PROJECT_STATUS.md) reconciles phases and distinct artifacts. This ledger retains older exact 5A reference and unchanged JSON dispositions. [Phase 10 User page/tab](PHASE_10_USER_PAGE_PLAN.md) is implemented and independently reviewed in the source; physical-device/native rechecks remain required for expanded V1.

Updated October 25, 2026 (`America/Los_Angeles`). This is the human-readable
companion to [`reports/phase9-launch-gates.json`](reports/phase9-launch-gates.json).
The machine verifier is:

```text
node scripts/phase9-verify-launch-gates.mjs --ledger reports/phase9-launch-gates.json
```

The repeatable local recovery rehearsal is:

```text
node scripts/phase9-rehearse-recovery.mjs
```

It creates disposable local Wrangler D1 states, applies migrations, exports a
SQL dump, restores it into a separate state, compares key rows and constraints,
checks the forward migration, and exercises a restored-database administrator
correction/audit. The script removes its temporary state before returning.

The verifier accepts only these dispositions: `pass`, `pending`, `blocked`,
and `waived`. `pending`, `blocked`, and `waived` are intentional evidence
states, not failures of the ledger format.

## Candidate and scope

- Preview origin and deployment identity: retained in private operational evidence; omitted from this public ledger.
- Phase 5A candidate: **Upload to WHT**
- Exact signed candidate SHA-256: `19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd`
- No production deployment, public publication, installation-link change, workflow activation/dispatch, WHT API write, or credential access was performed for this ledger.

## Source references

The ledger is grounded in these exact records:

- `../shortcut/PHASE_5A_HANDOFF.md`
- `PHASE_5A_PLAN.md`
- `PHASE_5A_PLAN.md`
- `EXECUTION_PLAN.md`
- `../Daily_Games_Tracker_Final_Implementation_Plan.md#20-launch-checklist`
- `../Daily_Games_Tracker_Final_Implementation_Plan.md#21-definition-of-done`

## Read-only preview evidence

On October 25, 2026, the reviewed build was deployed to the preview branch.
Private read-only health checks returned HTTP 200, `schemaVersion: 2`, and
`gameDay: 2026-10-25` for the reviewed preview origins. Their hostnames and
deployment identities are intentionally omitted from this public ledger.

The reviewed deployment also passed read-only boundary checks: security headers
and request IDs were present; `/api/not-real` returned `404 NOT_FOUND`;
`POST /api/health` returned `405` with `Allow: GET`; an oversized
`POST /api/import/validate` returned `413 PAYLOAD_TOO_LARGE` before
authentication; and anonymous `/api/admin/players` reached the Cloudflare
Access sign-in boundary. No valid submission or WHT API write was sent. The
private evidence retains the exact origin and request records.

These checks are preview evidence only and do not establish production
deployment, production configuration, or current account-wide usage margin.

## Phase 9 launch checklist

| Gate                                            | Disposition | Evidence boundary                                                                                                                 |
| ----------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Current Krillion and MapTap terms compatibility | `pending`   | Sources reviewed; owner compatibility decision is still required and is not authorization.                                        |
| Cloudflare Pages project and D1 binding         | `pending`   | Preview health is recorded; production project/binding creation is not claimed.                                                   |
| Production secrets and environment separation   | `pending`   | Production is undeployed; no production secret configuration was inspected or changed.                                            |
| Cloudflare Access for admin paths               | `pass`      | Existing preview documentation records Access-protected admin route verification; production is not implied.                      |
| Migrations                                      | `pass`      | Focused local migration/import/admin rehearsal passed 3 files and 62 tests.                                                       |
| Game, scoring, and rank seed configuration      | `pending`   | No new seed operation was run for this ledger.                                                                                    |
| Universal Shortcut publication and install URL  | `pending`   | Candidate identity is retained; publication and install-link decisions remain separate.                                           |
| Two-iOS-version matrix                          | `pending`   | A user-reported device report is retained as private evidence; no second iOS version is claimed.                                  |
| Safari and Home Screen PWA Login with Device    | `pending`   | No new Safari/PWA matrix was run here.                                                                                            |
| Administrator recovery documentation            | `pending`   | The local rehearsal exercises correction/audit recovery, but complete operational documentation and account recovery remain open. |
| Player invitations                              | `pending`   | No new player invitation or external account action was performed.                                                                |
| Seven-player pilot                              | `pending`   | No seven-player pilot result is available.                                                                                        |
| Clipboard output excludes Krillion answers      | `pending`   | Existing native evidence is bounded; the complete current launch matrix was not independently rerun.                              |
| Backup/export and restore                       | `pending`   | The exact local rehearsal passes, but external D1 Time Travel and production restore remain pending.                              |
| Monitoring and free-tier usage                  | `pending`   | Official limits/pricing sources were reviewed; account-specific margin and production monitoring are not established.             |

## Phase 5A formal closeout

| Gate                                                    | Disposition | Evidence boundary                                                                                                                                          |
| ------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accepted source revision and toolchain evidence         | `pass`      | Handoff retains revision, source, compiler, Go toolchain, capture hash, and candidate identity.                                                            |
| Compiler lock, build, inspection, and artifact evidence | `pass`      | Phase 5A records pinned builds, inspections, and bounded artifact comparisons.                                                                             |
| Exact signed candidate identity                         | `pass`      | SHA-256 is `19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd`.                                                                             |
| Bounded user-reported core device flows                 | `pass`      | Handoff records setup, Text/Safari, scoreboard/returned-link, unsupported-input, Cancel, new-save, readback, and repeat flows for this candidate.          |
| Independent saved-result integrity                      | `pending`   | Current consistency and zero-write evidence are bounded; no pretest baseline, historical timestamp proof, exact phone request count, or native race proof. |
| Protected operational signing workflow                  | `pending`   | The Actions-only workflow compiles/inspects through pinned CI, records a GitHub pending lease, sends one exact HubSign POST, and stores only AES-256-GCM encrypted intent/result artifacts with bounded expiry; private inputs and the protected configuration remain unprovisioned, so no operational CI signing run or signed delivery is claimed. The migrated `WHT_AMBIGUOUS_SIGNING_RECORD` permanently blocks the prior logical package even if wire bytes vary; ambiguous responses are permanent stops and expiry never authorizes a resend. |
| Independently identified and hashed rollback reference  | `pending`   | Private backup is `SAVED` by user report; identifier/hash and independent byte verification are absent.                                                    |
| Phase 5B source/toolchain handoff                       | `pending`   | Handoff document is prepared, but incomplete rollback and operational-signing gates keep accepted-baseline closeout pending.                               |

## Formal limitations retained as limitations

These entries are deliberately not passes and must remain present in the JSON
ledger:

| Limitation                                                    | Disposition | Meaning                                                                            |
| ------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| Native edge-case matrix                                       | `waived`    | Explicitly waived by the user; no native test pass is implied.                     |
| Native race/concurrency exercise                              | `waived`    | Explicitly waived by the user; backend tests do not become native race evidence.   |
| General byte/semantic reproducibility                         | `waived`    | Bounded artifact comparisons do not become a general reproducibility claim.        |
| Operational signing activation                                | `pending`   | The protected Actions-only workflow is implemented but no operational CI signing run or signed delivery has been independently recorded; a lost signed response may not be recoverable.                  |
| User-reported-only backup without independent identifier/hash | `pending`   | The private backup remains user-held and unverified; do not inspect or publish it. |

## Local recovery and rehearsal checks

- `pass` — `npm test -- tests/integration/migrations.test.ts tests/integration/import.test.ts tests/integration/admin.test.ts`: 3 files and 62 tests passed with loopback access on October 25, 2026.
- `pass` — `node scripts/phase9-rehearse-recovery.mjs`: nine local checks passed: migration/seed, SQL export, separate-state restore, key-row comparison, constraint comparison/probes, forward migration, forced mid-batch rollback, and restored-database administrator correction/audit.
- `pass` — the forward migration check preserved the populated submission and constraints while dropping only the obsolete result hash.
- `pass` — `node scripts/phase9-rehearse-recovery.mjs` invokes the real `correctSubmission` path against the restored disposable D1 binding for a valid seven-round Krillion submission, verifies a forced mid-batch failure leaves rounds, score, and audit count unchanged, then replaces all seven rounds, updates the score from 300 to 310, and verifies protected prompt/answer sentinels are absent from the generated redacted `submission.correct` before/after audit snapshots.
- `pending` — external D1 Time Travel and production restore remain pending; the local rehearsal is not production backup evidence.

## Current official source review

The following sources were reviewed as operational evidence, while the related
compatibility or account-margin decisions remain pending:

- Cloudflare Workers limits: <https://developers.cloudflare.com/workers/platform/limits/> (reported October 12, 2026: Free 100,000 requests/day, 10 ms CPU/request, 128 MB memory, 100 MB request body).
- Cloudflare D1 limits: <https://developers.cloudflare.com/d1/platform/limits/> (reported October 24, 2026: Free 500 MB DB, 7-day Time Travel, 50 queries/invocation).
- D1 pricing: <https://developers.cloudflare.com/d1/platform/pricing/> (reported 5 million rows/day read and 100,000 rows/day write via pricing).
- MapTap terms: <https://maptap.gg/terms> (reported updated August 16, 2026; no explicit user-initiated result-sharing ban found in the reviewed text).
- Potential Krillion terms: <https://krillion.to/en/terms> (reported updated October 23, 2026; exact official source host still requires confirmation; no scripts/bots, bulk extraction, or overload/security testing are treated as authorization).

The terms review is evidence for an owner decision, not permission to publish,
automate prohibited behavior, or make external requests.
