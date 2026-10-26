# Winstitute of Higher Thinking — Aligned Execution Plan

**Authority:** `../Daily_Games_Tracker_Final_Implementation_Plan.md` \
**Updated:** October 25, 2026

**Current status — October 25, 2026:** Core features through Phase 8 and Phase 9 hardening are implemented in the reviewed source; hosted preview identity is retained in private evidence. Production remains undeployed. Phase 5B closed under bounded acceptance; Phase 5A formal closeout and Phase 9 launch gates remain open. **Phase 10 User page/tab is implemented and independently reviewed in the source; physical-device/native evidence remains open.** See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [Phase 10 evidence](reports/phase10-user-page-verification.md).

**Sequence:** Phases 0–9 retain numbering, Phase 5 is 5A/5B, and Phase 10 is the final additional User phase. Reviewed one-time HubSign sends have standing authorization; protected Actions-only signing remains pending operational activation. New/modified Shortcuts compile and inspect through pinned CI, never locally; ambiguous signing responses stop permanently and artifact expiry never authorizes a resend.

## 1. Alignment rules

The final implementation plan supersedes the earlier master plan, the old execution plan, the Phase 1 README, and any conflicting recommendation in `PHASE_0_AUDIT.md`.

The implementation will therefore use:

- Cloudflare **Pages + Pages Functions + D1**, not a migration to Workers Static Assets.
- The exact player import routes `/api/import/validate` and `/api/import/submit`.
- Cloudflare Access on `/admin*` and `/api/admin/*`, with Pages Functions also validating the Access JWT.
- Random 256-bit device, invitation, session, flow, and challenge tokens stored as SHA-256 digests.
- Successful `/validate` calls updating device activity and extending still-active player web sessions, as specified.
- Audited administrator correction and deletion; V1 does not add a soft-delete model that the final plan did not request.
- The generic `dgt.capture.v1` Safari envelope and unchanged shared-text capture.
- The final plan's schema names, endpoint names, clipboard format and session behavior; Phases 0–9 retain their sequence, with Phase 5 split into 5A and 5B; Phase 10 is the final additional User page phase.

Cloudflare Pages remains supported and has current documentation for Pages Functions, D1 bindings, local development, and the Cloudflare Access Pages plugin. The fact that Cloudflare recommends Workers Static Assets for many new projects does not override this project's explicit final architecture choice.

## 2. Initial baseline and Phase 0 record (historical)

### Available and reusable

- Extracted React 19, TypeScript, Vite, Tailwind, Pages Functions, and D1 starter.
- Mobile shell, safe-area styling, PWA icons, manifest, and route placeholders.
- Read-only `/api/health` and `/api/games` Pages Functions.
- Pacific-day and competition-ranking utilities; all six existing tests pass.
- D1 foundations for games, players, game days/puzzles, submissions, rounds, and audit records.
- Five validated synthetic MapTap fixture captures: totals 790, 844, 845, 868, and 904.
- Two validated synthetic Krillion fixture captures: current Dive #97 totaling 310 and archived Day #92 totaling 325.
- Expected canonical output for every stored fixture, including an explicit Krillion miss and a submitted answer scoring zero.

### Phase 0 resolutions

- Wrangler and Workers Types are compatible and locked; clean installation reports zero vulnerabilities.
- Formatting, linting, CI, typed Vitest tests, and a portable local-D1 schema test are configured.
- All seven golden captures and expected results live in `tests/fixtures` and are validated automatically.
- Active README, UI copy, manifest start URL, and routes describe the Shortcut flow rather than PIN/OCR/manual submission.
- The undeployed PIN-era schema was replaced with the final V1 greenfield schema.
- `shortcut/README.md` records the universal Shortcut action sequence and real-device proof checklist.
- Format, lint, typecheck, 31 unit tests, D1 schema tests, production build, local migration, and local Pages/Functions/D1 API smoke checks pass.
- At this Phase 0 checkpoint, parsers, credential flow, login challenge, submission writes, leaderboards and admin actions were later work. This is historical baseline evidence; use the current status and phase sections below for implementation progress.

## 3. Hard gates and dependencies

### Gate A — Repository baseline ✅

No product feature begins until install, build, typecheck, unit tests, and local D1 migration checks are green from a clean checkout.

### Gate B — Schema migration safety ✅

The user confirmed that the old schema was never deployed. `0001_initial.sql` is now the clean final V1 schema, with no PIN-era columns.

### Gate C — Parser proof ✅

Completed October 21, 2026; see `PHASE_3_CLOSEOUT.md`. Isolated Cloudflare parser CPU is measured separately from admin routing/auth overhead. The 5,000-node sample reaches 10 ms at integer trace resolution; actual device-authenticated Phase 4 request CPU remains a later check.

Do not begin submission writes, leaderboards, or polished admin UI until:

- the real Shortcut produces `dgt.capture.v1` on an iPhone;
- Krillion #97 and all MapTap fixtures parse correctly;
- archive, incomplete, wrong-share, ambiguous, and mismatched inputs fail with the required codes;
- capture size and Worker CPU usage are measured.

### Gate D — Submission vertical slice

Do not begin leaderboard UI until one real player/device can validate, confirm, submit once, and receive the same already-saved notice and copy a fresh server scoreboard for every valid repeat without changing the stored result. Validation repeats must skip confirmation and submit; both endpoints use the same Close / Open WHT completion flow.

### Gate E — Launch

No broad rollout until Cloudflare Access, backup/restore, session revocation, spoiler checks, clipboard privacy, and the seven-player pilot pass.

## 4. Phase-by-phase execution

### Phase 0 — Repository and fixture baseline

1. Align compatible exact versions of Wrangler and Workers Types, install cleanly, and commit `package-lock.json`.
2. Add formatter/linter scripts and CI for install, lint, build, function typecheck, unit tests, and migration tests.
3. Replace the non-portable Python schema test with a D1-local test workflow.
4. Move all raw/expected fixtures into `tests/fixtures/{krillion,maptap}`.
5. Add `shared/` types and game configuration, including scores, weights, parser versions, ranking badges, and Shortcut support versions.
6. Add `shortcut/README.md` describing every Shortcut action, branch, request, and response.
7. Change the visible player journey from `/submit` to `/` **Play / Submit Help**; update the manifest start URL and redirects.
8. Remove obsolete PIN/OCR/screenshot/manual-entry language from active UI and README.

**Exit:** clean install and all baseline checks pass; fixtures reproduce Krillion 310/325 and all five MapTap totals; no obsolete flow is presented as active.

### Phase 1 — Pages, Functions, and final D1 schema

**Complete in historical private evidence.** The earlier preview verification covered schema version 1 and both games. Hosted origin and deployment identity are intentionally omitted from this public plan. The baseline and environment configuration are committed as `e88c923` and `5bc9f03`; production remains undeployed.

1. Keep the Pages Functions directory routing and same-origin architecture.
2. Configure current Pages-compatible Wrangler settings, D1 binding `DB`, local `preview_database_id`, and separate preview/production configuration.
3. Implement the final schema from section 10 of the specification, using foreign keys, checks, and required indexes.
4. Use application-generated UUIDs so multi-row writes can be prepared before a D1 batch.
5. Add request-ID middleware, uniform JSON error envelopes, payload limits, and redacted logging helpers.
6. Retain sanitized `/api/health` and `/api/games`; ensure protected or identity-bearing responses use `Cache-Control: no-store`.
7. Configure the service worker for app-shell assets only; `/api/*`, registration, and admin routes are network-only.

**Exit:** an empty local database migrates completely; schema constraints are integration-tested; Pages local development serves the SPA, Functions, and D1 together; preview deployment works once Cloudflare access is available.

### Phase 2 — Players, Access bootstrap, invitations, and devices

**Access/onboarding externally verified in historical private evidence.** Access JWT verification, the admin onboarding UI, player creation/deactivation, 24-hour invitations, transactional redemption, device status/revocation, browser-session bootstrap, `/api/auth/me`, and logout are implemented. All 50 automated tests pass. The hosted origin and deployment identity are retained privately. Automated tests include signed/forged JWTs, concurrent redemption, rollback, origins, expiry, replay, token-hash storage, and revocation.

Historical Phase 2 checkpoint: preview Access configuration, administrator sign-in, and player creation were verified in private evidence. Anonymous probes confirmed public/player routes and protected administrator destinations; `PHASE_2_ACCESS_SETUP.md` records the public contract and evidence boundary. The raw-JSON/no-upload pilot at that checkpoint was superseded by the accepted Phase 4 pilot described above. Website login subsequently closed under bounded Phase 5B acceptance; see current status. Production remains undeployed.

The final plan requires admin-created players here, although the full dashboard is Phase 8. Implement the security boundary now and the complete UI later.

1. Configure Cloudflare Access for `/admin*` and `/api/admin/*`.
2. Add Pages middleware using the Cloudflare Access plugin/JWT validation and expose only a verified admin identity to handlers.
3. Build minimal protected player creation and Add Device invitation actions.
4. Generate 32 random bytes for invitation and device tokens; trim pasted device-code whitespace at the client boundary; hash with SHA-256 before indexed lookup/storage.
5. Implement one-use, 24-hour invitation redemption, one-time credential display, registration page security headers, and initial web session creation.
6. Implement credential lookup, active-player/device checks, activity timestamps, and immediate revocation.
7. Build the universal Shortcut skeleton with Import Question and version constant. Keep its iCloud link pilot-only until parser/submission gates pass.

**Exit:** invitation reuse/expiry fails; plaintext tokens never persist or log; a registered code identifies exactly one active player; revocation blocks every player-authenticated route.

### Phase 3 — Capture and parser proof

**Native envelope contracts and the recorded synthetic diagnostic checks passed within the Phase 3 scope.** Generic Safari capture, strict envelope checks, pure parsers, error handling, and local Node/workerd benchmarks are implemented. Native whitespace trimming and replacement-device authentication were exercised; exact device captures, player results, and byte measurements remain private evidence and are not reproduced here. The authenticated fixed-fixture preview diagnostic passed its recorded checks; its detailed report remains private. A historical preview revision added a one-copy refreshed Safari capture/measurement helper, with no uploads or database operations; see `PHASE_3_PREVIEW_PROOF.md`. Those then-open Gate C items were subsequently closed in PHASE_3_CLOSEOUT.md; import CPU remains separate Phase 4 monitoring. The extra newline scratch test is optional. No Phase 4 endpoints or submission writes were added. Production remains undeployed; current reviewed source is preserved in this candidate.

1. Implement the generic Safari JavaScript capture envelope with bounded visible text/nodes and explicit exclusion of hidden elements, scripts, styles, storage, cookies, and form secrets.
2. Implement the shared-text envelope with line-ending normalization only.
3. Define `NormalizedGameResult` and stable parser error types.
4. Implement MapTap detection/parsing first, preserving emoji verbatim and validating `[1,1,2,3,3]` weighting.
5. Implement Krillion detection/parsing with section and round boundaries. Support current-result layout; recognize archive markers and return `WRONG_GAME_DAY` for player imports.
6. Preserve `answer = null` for an em-dash miss while retaining quoted or unusual answer text that scored zero.
7. Add wrong-share, unfinished, missing/extra round, oversized, malformed Unicode, ambiguous-game, and score-mismatch fixtures.
8. Run capture and parsing on real current iPhones. Benchmark serialized size, Shortcut latency, and Worker CPU.

**Exit:** all known fixtures pass; required error codes are stable; no parser writes D1; a real Krillion capture contains all seven round blocks without exposing browser secrets.

### Phase 4 — Validate, confirm, and submit

**Backend, functional acceptance, clean installation and required-update checks complete, with the user's accepted Shortcut pilot exceptions.** The reviewed preview evidence covered both import routes, the original two-field capture contract (no confirmation token), database uniqueness with uniform already-saved notices, server scoreboard completion payloads, atomic D1 writes, race-safe duplicate handling and live-session refresh. Preview schema 2 has no `result_hash` column. The user leaves CPU as an open monitoring item (13/14 ms on saved-result validations versus the Free 10 ms/request limit); new-save CPU remains unmeasured. Production remains undeployed. See `PHASE_4_STATUS.md` and `PHASE_4_CPU_INVESTIGATION.md`.

1. Implement `POST /api/import/validate`: device authentication, Shortcut support check, detection, parse, date validation, duplicate precheck, server-authored confirmation, device activity update, and active-session extension. It writes no submission.
2. Implement `POST /api/import/submit`: repeat the full validation and save atomically.
3. Use the unique player/game-day slot without hashing or comparing result content. Schema migration 0002 removes the old result_hash column. No confirmation hash is returned or accepted; security credential/session hashing stays.
4. Use the database uniqueness constraint as the race-safe duplicate guard. If a competing write wins, return the same already_submitted response with fresh scoreboard as every other valid repeat; never overwrite or compare contents.
5. Insert/find `game_days`, submission, and all rounds in one batch using application-generated IDs. Require the selected `game_days` row to match the parsed external puzzle key.
6. Complete native confirmation, cancel, retry-once and update-required behavior. On new-save success or already_submitted from either endpoint, copy the server scoreboard_text and show completion_message in a Close / Open WHT menu; Open WHT opens the server wht_url. If text is null, preserve the clipboard and show the server’s unavailable message.

**Exit:** validate/cancel create no submission; a real confirmed result writes once; every valid repeat returns `already_submitted` with “You already have a result saved for this game today.” plus a fresh scoreboard for copying; duplicate validation skips confirmation and submit; round-write failure rolls back the entire result.

### Phase 5A — Shortcut source, builds and migration

**Built, inspected, signed and core device flows accepted by user report; formal operational signing/independent rollback/bounded integrity/handoff remain open.** Edge-case/race/general reproducibility are waived, not passed. See PROJECT_STATUS.md. Numbered steps retain phase scope, not the current outstanding queue.

1. Preserve evidence/reference backup; consolidate the reviewed source tree and make workflow/lock settings agree.
2. Import/run the existing signed alert, then prove native inputs/Safari binding/capture, JSON types, Import Question header and all routing/clipboard cases with approved credential-free probes.
3. Implement the complete upload source with exact capture embedding, numeric version 1, nested capture and one guarded shared completion section; keep the manual pilot unchanged.
4. Finish complete-client unsigned checks/manifests and the protected Actions-only signing workflow covered by universal standing HubSign authorization: pinned compile/inspect, GitHub pending lease, one exact HubSign POST, and AES-256-GCM encrypted intent/result artifacts with bounded expiry. Explicitly disposition reproducibility and the lost-response limitation.
5. Privately accept both game flows, failure/update/cancel/clipboard behavior and saved-result integrity. Prepare clean release/rollback and hand the accepted source/artifacts to 5B. Sharing/install-URL/version/production decisions remain separate.

**Exit:** a traceable compiler-built upload candidate passes generated-artifact checks and actual signing/install/native acceptance; exact evidence and rollback are retained. A compiled probe or signed-container header is insufficient.

### Phase 5B — Website sessions and Login with Device

**Closed under bounded acceptance October 23.** Sessions/native login integration and preview/core iPhone flows have recorded evidence; edge cases were waived. Later Safari return-menu build/signing is separate; native acceptance of the exact newer file is not established. See PROJECT_STATUS.md. Numbered steps retain the contract.

1. Carry forward session/bootstrap/renewal/logout/revocation and active-only Shortcut refresh; retain 7-day idle and original 400-day absolute cap.
2. Add first-prefix `DGT_LOGIN_V1:` dispatch in the accepted 5A source, using the same credential binding and preserving its accepted upload behavior. Every login branch stops before capture/upload/clipboard actions.
3. Preserve two-minute browser binding, atomic one-use approval/completion, live authorization checks, same-origin browser writes and Device-authenticated approval; rerun appropriate integration checks for the exact paired revisions.
4. After separately authorized preview/signing steps, prove Safari and installed PWA contexts independently, original dated-page return, refresh/logout, expiry/replay/wrong-browser/revocation/privacy and lost-response/manual-return recovery.

**Exit:** registration and Login with Device establish the initiating browser's session; replay/expiry/wrong browser fail; revocation is immediate; cookie contents are inaccessible to JavaScript; refresh cannot resurrect expired/revoked sessions or extend the original absolute cap. Existing pilot/CPU decisions remain unchanged. Phase 6 onward keeps its numbering.

### Phase 6 — Daily and all-time leaderboards

**Current status:** Implemented and preview-deployed.

1. Build dedicated read models for protected daily details and public all-time scores.
2. Never fetch Krillion answers for public all-time or score-only outputs.
3. Implement competition ranks, alphabetical tie display, active-player rules, zero-versus-null, cumulative totals, games played, averages, and previous-day movement.
4. Enforce current-day locks in the daily API before serialization.
5. Build horizontally scrollable, sticky, accessible tables for both games.
6. Use `/daily/YYYY-MM-DD` as the canonical browser route while the API keeps `?date=YYYY-MM-DD`; redirect legacy `/daily?date=` links if needed.

**Exit:** direct API calls cannot retrieve locked rows; rankings match test matrices; all-time remains public and includes live current-day totals.

### Phase 7 — Clipboard sharing

**Current status:** Implemented and verified; full launch native privacy matrix remains pending.

The score-only server renderer and automatic post-upload payload have been pulled forward into Phase 4 by user request. The canonical layout is the user-approved 📊 WHT Leaderboard example in authoritative plan section 12 and shortcut/CLIPBOARD_FORMAT_EXAMPLE.txt: emoji game headers, puzzle/date subtitles, compact rank brackets, bare round lines, and a divider between the two game sections. The copied text ends after the final MapTap round line; do not duplicate the renderer.

1. Build the authenticated server renderer from score-only queries.
2. Take one consistent read at button press and emit the exact section 12 format.
3. Include only players with a saved submission for each emitted game/day section; omit empty game sections, preserve inline all-time values and previous-day movement, and do not append a trailing URL section.
4. Add snapshot/golden tests asserting that no prompt, Krillion answer, MapTap emoji, or site rank badge leaks into disallowed positions.

**Exit:** copied text matches the canonical format and privacy assertions for ties, zero scores, submitted players, newcomers, and late submissions.

**Phase 7 implementation evidence (2026-10-24):** The authenticated `GET /api/leaderboards/copy?date=YYYY-MM-DD` route now validates one calendar date, requires and refreshes a session, requires at least one selected-day submission for the signed-in player (including historical dates), performs no submission/round writes, and delegates canonical score-only formatting to `submissionScoreboard`. Daily responses expose `copy_eligible`; the dated daily page gates an accessible `Copy Leaderboard` button on that flag, calls the selected-date endpoint, uses `copyText`, resets date-keyed state on effect cleanup, invalidates pending copy attempts before and after clipboard invocation, suppresses stale async results, and surfaces failed copies honestly. Focused Phase 7/leaderboard/scoreboard tests pass 67/67; `npm run typecheck` and `npm run build` pass; full `npm test` passes 19 files and 330 tests. Scoped ESLint passes with 0 errors and 6 Fast Refresh warnings for exported page helpers. Repository-wide lint remains blocked only by unrelated unused imports in `scripts/phase5a-compile-runtime-fixtures.mjs` and `shortcut/cherri-migration/build/receiver-fixture.mjs`; Miniflare tests require allowed loopback access.

### Phase 8 — Full administrator dashboard

**Current status:** Implemented, reviewed and preview-deployed; operational account recovery remains open.

1. Expand the protected bootstrap into player, invitation, device, session, submission, and audit screens.
2. Require reasons for score edits and deletes.
3. Revalidate corrected rounds/totals and update normalized result data, timestamps, and audit entry atomically.
4. For deletion, capture the full redacted before-state in an append-only audit row in the same transactional unit as the delete.
5. Add manual historical backfill with explicit Pacific date and `source_kind = admin`.

**Exit:** Access and handler verification both reject non-admins; every material mutation is audited; correction/deletion immediately changes derived boards without direct database editing.

### Phase 9 — Hardening and launch

**Current status:** Engineering reviewed clean in the source; hosted preview identity is retained in private evidence. Full launch readiness remains open: see PHASE_9_LAUNCH_GATES.md and PROJECT_STATUS.md.

1. Add CSP, origin/CSRF protection, rate limits, payload caps, XSS tests, structured redacted logs, and monitoring.
2. Rehearse D1 backup/export, Time Travel/restore, forward migration, and administrator recovery.
3. Test current and oldest available iOS versions, Safari and PWA login, network interruption, revocation, and Shortcut updates.
4. Run a two-person pilot, then the required seven-player pilot.
5. Review current third-party game terms and current Cloudflare limits immediately before production rollout.

**Exit:** every Definition of Done item and launch checklist item in the final plan is evidenced by a test, deployment check, or recorded manual QA result.

### Phase 10 — User page/tab (final additional phase)

**Implemented and independently reviewed in the source.** [Requirements and evidence](PHASE_10_USER_PAGE_PLAN.md): canonical `/user` with `/login` alias; permanent fourth dock tile after All-Time; 401-only logged-out Daily redirect with safe dated return; no signed-in Daily identity/logout card; polished Login with Device; signed-in per-game stats, supported Shortcut redownload and logout. Metrics/layout decisions are recorded in the Phase 10 design. Physical-device/native evidence and existing Phase 5A/Phase 9 launch gates remain open. Hosted preview origin and deployment identity are retained in private evidence and intentionally omitted from this public plan.

## 5. First implementation batch — completed

The first code batch should contain only:

1. Package/toolchain repair and lockfile.
2. CI, lint, format, build, function typecheck, and portable local D1 checks.
3. Fixture relocation and fixture-validation tests.
4. Shared typed models/configuration.
5. **Upload to WHT** Shortcut build specification.
6. Removal of obsolete player-facing PIN/OCR/manual-submit copy and route defaults.
7. Final-schema migration decision after confirming whether a real D1 database exists.

Do not mix parser, authentication, leaderboard, or admin-dashboard implementation into this batch. Its purpose is a trustworthy green baseline for every later phase.

## 6. External/user-owned checkpoints

These cannot be completed solely from repository code:

- Confirm whether any real D1 database was created from the old migration.
- Provide/login to the Cloudflare account for preview/production creation and bindings.
- Configure the Cloudflare Access application and administrator identity/audience.
- Build and publish the iCloud Shortcut link from an iPhone or Mac.
- Run the real-device capture, Safari/PWA login, and multi-iOS tests.
- Supply deliberately wrong-share/incomplete captures when practical.
- Approve the final public display names, acknowledging that all-time names/scores are intentionally public.

Repository work should proceed locally until it reaches one of these explicit checkpoints rather than blocking earlier phases prematurely.

## 7. Progress evidence

Each phase closes with:

- automated test output;
- a short demo/QA record;
- migration/configuration notes;
- updated implementation checklist;
- no known critical security or data-integrity defect deferred into a later UI phase.

## User-accepted Phase 4 pilot exceptions

On October 21, 2026, the user explicitly accepted the shared native pilot's documented tradeoffs: Safari capture may replace the clipboard before later Cancel/error handling; the submit race/retry path has a bounded duplicate policy; and native scoreboard Copy actions have no null/empty guard. These are accepted pilot tradeoffs for the small group, not required fixes or native acceptance blockers. The stricter build guidance remains the deferred target for a future revision. Backend responses, saved-result uniqueness and the score-only scoreboard format are unchanged. Native clipboard preservation on Cancel/error/unavailable-scoreboard and submit-race clipboard copying are not claimed as proved. The configured Shortcut identity and private device evidence remain outside the public repository.

Clean-template checkpoint: private verification recorded installation/setup and an already-saved result pass for the reviewed template. The template identity and configured preview value remain private release evidence. Minimum/latest versions remain 1 until a coordinated required-update test. Required-update native proof and CPU performance remain open; the accepted native pilot exceptions are documented in PHASE_4_STATUS.md.

Native closeout update: clean installation and the real required-update message/link/stop now pass by user report. The coordinated temporary preview requirement was restored and verified at minimum/latest 1; the clean template stays version 1. All agreed functional checks pass with the user-accepted pilot exceptions. CPU performance remains open; see PHASE_4_STATUS.md (../PHASE_4_STATUS.md from shortcut/) and reports/phase4-native-acceptance.json.

Final CPU disposition: an authenticated saved-result sample remained above the plan’s 10 ms target, so Phase 4 performance remains open and new-save CPU is not yet measured. Exact trace values, game attribution, and the supporting private report remain outside the public documentation. Functional/install/update checks pass with accepted pilot exceptions. See PHASE_4_STATUS.md.

Current CPU investigation: `PHASE_4_CPU_INVESTIGATION.md` records the deployed read consolidation and routing candidate. Two successful saved-result validations on 1b5572a3 measured 13/14 ms CPU. The user chose to leave this over the Free target as an open monitoring item; it does not block Phase 5A or Phase 5B. New-submit CPU remains unmeasured. All other Phase 4 functional, installation, update, and security acceptance gates are complete with the user's accepted pilot exceptions.
