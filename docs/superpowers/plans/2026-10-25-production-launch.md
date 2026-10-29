# WHT production launch execution plan — repository transition first

> **For agentic workers:** Follow the current user-selected hierarchy: implementation and repairs use GPT-6 Luna xhigh; independent read-only review uses GPT-6.1 Sol medium. Do not spawn children unless the user explicitly requests delegation. Checkboxes below preserve the earlier plan and are not current status.

**Status:** Historical execution plan, first written October 25, 2026. The October 25 planning snapshot below is superseded by the current release record. Keep older checklists as history; the current status section is authoritative. This also supersedes older assumptions about production being undeployed, PR #17 as a release prerequisite, the signing guard/zero-commit sentinel, backups or formal retention, CPU/plan checks, and monitoring or alert setup. Use [project status](../../../daily-games-tracker/PROJECT_STATUS.md) for active work.

**Goal:** Take the user-approved Phase 10 preview through a one-time transition to a single authoritative GitHub-backed application repository, then a traceable production release, complete new-player setup, successful real use and verified development cleanup. Preserve preview and its database for future work.

**Architecture:** Retain Cloudflare Pages + Pages Functions + D1 and invitation-only registration. Keep production and preview isolated within the existing project unless inventory establishes a necessary change. Migrate reviewed application/Shortcut source once into the existing GitHub-backed checkout, then make that checkout the sole maintained codebase. Keep secrets and private operational evidence outside the tracked tree; use ordinary branches, commits, CI and preview-to-production promotion after cutover. Deploy identified commits with environment-specific runtime settings and a production-targeted, CI-built Shortcut.

**Tech stack:** React/TypeScript/Vite, Pages Functions, D1, Wrangler, pinned Cherri GitHub Actions, HubSign, Apple Shortcuts, Safari.

**Spec and evidence:** [Final product specification](../../../Daily_Games_Tracker_Final_Implementation_Plan.md), [current status](../../../daily-games-tracker/PROJECT_STATUS.md), [Phase 10](../../../daily-games-tracker/PHASE_10_USER_PAGE_PLAN.md), [launch gates](../../../daily-games-tracker/PHASE_9_LAUNCH_GATES.md), and [publication policy](../../../skills/sanitized-push/SKILL.md).

## Current production release

Updated October 29, 2026.

Production is running the application and UI from source `ae36c52800b41f2bbb411c1d5e83e09c37be1f31`. Production D1 is initialized at schema 3 with minimum/latest Shortcut version `1/1`. A static-only deployment from the wrong directory briefly served HTML from the health route and a “Local UI preview” page. It was repaired by deploying the reviewed application with its Functions from the app directory; the live health route returned schema-3 JSON and anonymous authentication returned JSON `401`. The later `c393df8` heading correction and `ae36c52` share-metadata change are part of the current release. No database writes were made in the repair deployments.

The production registration page has six visible steps. Shared PlayerHelp has three topics covering setup/Favorites, game-sharing/submission, and **Fix “Could not run JavaScript”** for the full “Could not run Run JavaScript on Web Page” error; seven responsive images are live. The User-page redownload control stays hidden pending future device codes while the backend download route remains. Share metadata uses the WHT green-check icon; the HTML rewriter uses the request origin and does not include invitation tokens. Live metadata and image hash were verified.

Task 7 signed the version-1 Shortcut candidate from source `29c4acea` through protected CI and confirmed the private R2 result. Website-only commits after that did not alter or re-sign it. Honor the user's final instruction: do not rerun Task 7/8 suites, phone acceptance, signing rehearsals, or the waived phone-side hash comparison.

Task 9 deployment is complete and awaits these human checks: authorized administrator sign-in and empty player-list access; an Access-admitted non-admin denial/403 check; and an authenticated player download check for the `Upload to WHT.shortcut` attachment. If no controlled player identity exists, a clearly labeled temporary test player/invitation and controlled-device registration are needed for the player-session check; revoke test credentials afterward where supported. The private Task 9 record contains the detailed procedure. Do not include codes, cookies, JWTs, invitation links, or private deployment evidence in this plan.

Task 10 remains open: the complete fresh-user production journey and real-device/session/update behavior have not been completed. Tasks 11–15 remain separate follow-up work: pilots, stabilization, archive review, cleanup, and final handoff. Manual iPhone Safari acceptance of the latest UI also remains open.

The user removed Cloudflare plan/CPU checks, monitoring and alert setup, the PR #17 merge prerequisite, and formal retention requirements from the production plan. These are not launch or post-release requirements. The second D1 backup, backup schedule, and alerts were canceled; the owner accepts that no separate production database copy is maintained.

## 1. Start condition, authority and completion

**Historical starting authorization:** The user authorized starting **Task 1 — the repository transition — as a separate task**. It may inventory, preserve, migrate, review, commit and push the reviewed migration scope; it does not require or imply Phase 10 preview approval. Preserve active Phase 10 edits and serialize the final source handoff before switching working paths or marking the old workspace archival. Do not cut over underneath active writers. At that point Tasks 2–15 were gated on Phase 10 implementation, independent review, deployment and explicit user approval in preview; the user has since explicitly closed Task 2 as recorded below, without resolving the remaining release prerequisites. Record that exact approval, private preview evidence, source tree and migrations in Task 2; neither today's dirty workspace nor historical preview evidence is automatically the accepted production release.

Approval of a plan is not an assertion that its tasks have run. Apply existing explicit authorization without repeatedly asking for it. Before external execution, ensure authorization covers the concrete one-time migration/normal branch update, production destination/data policy, install-link publication, private invitation delivery, billing changes and exact destructive cleanup set. Prepare reviewable manifests/diffs first; combine unresolved decisions into a single release decision record rather than scattered repeated prompts. Writing this plan does not execute any of those actions.

Standing HubSign approval already covers the exact reviewed credential-free payload that the protected GitHub Actions workflow may send, including user-directed retries of a previously ambiguous outcome when exact package/source/digest/state checks pass. Do not request repeat approval. Automated workflow activation is a different action; the installed publication skill specifically requires the disabled signing guard and zero-commit sentinel to remain unless explicitly authorized otherwise. A successful send does not prove operational automated signing.

Completion means: the released application and Shortcut are traceable to GitHub; production is configured and recoverable; invitation setup works with the right production Shortcut; the two-person and seven-player pilots pass; intended users are using production successfully; cleanup and retained preview are verified; remaining limitations have explicit dispositions.

## 2. Global constraints

- Keep the privately configured preview website and preview D1 binding as the permanent development/test environment.
- Never delete the privately configured Pages project as cleanup: production and preview may share it.
- During the one-time migration, never push the legacy private workspace/history. Transfer reviewed source into the existing ali-hashim/daily-games-tracker checkout; after verified cutover it becomes the sole maintained application repository. Do not maintain a private source fork, export/mirror pipeline or two editable application copies.
- Do not broad-stage the legacy private workspace, force-push, mirror refs, rewrite history or publish credentials, configured Shortcuts, private invitations, real player data, database dumps or private evidence. After cutover, normal reviewed staging/commits in the canonical repo are expected.
- New/modified Shortcuts compile only via pinned .github/workflows/cherri-alert-experiment.yml on the reviewed public revision. Inspect its artifacts before signing/distribution; do not install or use a local compiler.
- Preserve fail-closed hashes/contracts and one-request-per-attempt direct HubSign behavior in the protected Actions workflow; record the GitHub pending lease and private R2 signing state and digest-verified signed objects. User-directed retries of previously ambiguous outcomes are authorized without repeat approval only when the exact reviewed package/source/digest/state checks pass.
- Registration remains admin-invitation-only: no open signup, email/password accounts or new PIN model.
- Preserve server validation, atomic imports, uniqueness, answer locks, audited admin changes and existing session/revocation contracts.
- Previously waived native edge-case/race/general reproducibility items remain waived, not passes. New production-origin/setup proof is distinct from reopening every waived case.
- Production and preview need separate bindings, origins, invite/device/session state, install targets and release evidence. Do not make preview use production data to simplify testing.
- Preserve active Phase 10 work. Task 1 may begin non-destructive preparation now, but the final snapshot/copy/cutover must serialize with existing writers. Include all agreed handoff changes; do not silently omit or overwrite them. The transition task introduces no unrelated product behavior or deployment.
- No resource removal until identity, ownership, dependencies, retained backup and post-removal verification are established.

## 2.1 Single-repository end state

Sanitization is a **one-time migration step**, not a permanent publication architecture. After Task 1, ali-hashim/daily-games-tracker and its recorded local checkout are the single source of truth for application and Shortcut source, tests, migrations, tooling and maintained documentation.

Normal tracked content includes safe environment configuration, example files and synthetic fixtures. Secrets belong in platform settings/ignored local files; real player captures, database backups and private operational evidence belong outside the tracked application tree. Keep ordinary code review and secret scanning, without requiring a second source tree or repeated manual file exports. Public resource identifiers/hostnames are not automatically secrets.

The legacy private workspace/history is retained only as a verified historical archive. Preview remains the permanent test website/database, using the same codebase with preview settings; it is not a second code repository. Production uses the tested commit with production settings. Final handoff must demonstrate this workflow from a fresh clone.

## 3. Review focus

Each item has an owning task and acceptance check:

1. Preview credentials or hardcoded endpoints accidentally reused in production — Tasks 5, 7, 9 and 10 prove environment isolation.
2. An invite is consumed but the user cannot install/configure the supported Shortcut — Tasks 6, 8 and 10 prove the complete fresh-device journey and lost-page recovery.
3. The one-time migration omits runtime files, exposes private material or leaves two editable codebases — Tasks 1 and 4 test the migrated tree and a fresh clone, then verify the canonical working path and archive the old source workspace.
4. Website rollback leaves an incompatible database or Shortcut, especially on first launch — Tasks 5, 7 and 12 define schema compatibility, first-deployment fallback and paired release recovery.
5. Cleanup destroys preview, release evidence or a shared service — Tasks 3, 13 and 14 use an exact resource disposition manifest and verify retained dependencies afterward.

## 4. Sequence and ownership

| Stage                                       | Tasks | Dependency                                                            |
| ------------------------------------------- | ----- | --------------------------------------------------------------------- |
| One-time repository transition              | 1     | Authorized now; preserve live work and serialize final cutover        |
| Approved production baseline and inventory  | 2–3   | Phase 10 implemented, reviewed and approved in preview                |
| Release preparation                         | 4–6   | Canonical repo and approved baseline; disjoint ownership where useful |
| Production Shortcut and install link        | 7–8   | Reviewed canonical source, configuration and chosen production origin |
| Controlled production and real-device proof | 9–10  | Tasks 1–8 complete and concrete production approval                   |
| Pilots and full rollout                     | 11–12 | Production acceptance passes                                          |
| Cleanup and steady-state handoff            | 13–15 | Stabilized production and verified retained evidence                  |

The orchestrator owns release sequencing. Assign one worker each disjoint scope if useful (application/setup vs release infrastructure/docs); serialize lockfiles, root configuration, the one-time source migration, install/version policy and deployment steps. Use substantive independent review, Luna repairs and targeted Sol re-review until clean, without a cycle cap. Human operator handles phone installation, account-owner decisions and private player communications unless explicit delivery authorization exists.

## 5. Files and records to produce

| Artifact                                                       | Responsibility                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| This plan                                                      | Complete post-Phase-10 sequence and completion gates                                                                            |
| daily-games-tracker/PRODUCTION_RUNBOOK.md                      | Final exact deployment, recovery and future promotion commands                                                                  |
| daily-games-tracker/PLAYER_SETUP.md                            | User-facing invitation/install/play/login/troubleshooting instructions; expose accessible equivalent help in the actual website |
| daily-games-tracker/DEVELOPMENT_WORKFLOW.md                    | Permanent preview workflow, environment distinction and production promotion process                                            |
| Canonical daily-games-tracker/wrangler.jsonc and example files | One maintained safe configuration; secrets/runtime values supplied through platform settings or ignored local files             |
| .github/workflows/application-checks.yml (new if absent)       | Application tests/typechecks/build/schema checks; no implicit production deployment                                             |
| Existing pinned Cherri workflow/source/toolchain/inspectors    | Production and preview Shortcut build identities                                                                                |
| tmp/production-launch/<release-id>/ (private, ignored)         | Exact source/config/target identities and command/check outcomes needed to verify executed production steps                     |

Names above are intended deliverables, not files claimed to exist. Keep private records out of commits. Record the exact source/config/target identities and actual check outcomes needed to verify each production action. Do not put token/code values or player captures in logs.

## Task 1 — Make the one-time transition to the canonical GitHub repository

**Owner:** Orchestrator/migration worker; independent review. **Policy:** Read skills/sanitized-push/SKILL.md for the initial migration. The user's requested end state is a normal single-repo workflow; update that policy at cutover as described below.

**Standalone scope:** Execute only Task 1, then stop with the canonical checkout/commit/CI evidence and any explicit remaining handoff blocker. The user selected GPT-6.1 Sol medium as this task's orchestrator; implementation/repairs remain GPT-5.6 Luna xhigh and independent read-only review remains GPT-6.1 Sol medium. No production/preview deployment, production data operation, Shortcut signing/activation/distribution, invitation delivery or resource deletion is part of this task.

- [ ] Before migration, make and verify a recoverable private snapshot of the current source, untracked changes and necessary ignored evidence. Inventory active writers/worktrees and preserve their work.
- [ ] Capture the transition's own source/privacy/build baseline; do not depend on future production-preparation Tasks 4–6. Fix only issues required to migrate/publish/build the existing application, document pre-existing unrelated failures, and leave future feature/release hygiene work in those tasks.
- [ ] Perform read-only inventory and candidate preparation while Phase 10 is active. Before the final copy/commit/cutover, establish a stable agreed handoff: re-read changes, include the final agreed source set and verify no writer is still changing that source. If that boundary cannot yet be established, complete independent preparation and report the precise handoff dependency; do not race, discard work or declare cutover complete.

- [ ] Locate/reuse or clone ali-hashim/daily-games-tracker and verify exact remote, visibility, baseline and layout. Record its resolved local working path. Preserve existing public history/files/license; do not import the legacy private .git directory or refs.
- [ ] For this initial migration only, inventory and select the complete application/Functions/shared/parsers/migrations/service worker/assets, package/lock/tooling, synthetic tests, build inputs, Shortcut source/toolchain/inspectors and maintained docs. Copy reviewed source into the GitHub-backed checkout without discarding existing public work.
- [ ] Move secrets and all remote deployment configuration into Cloudflare settings and appropriate ignored local development files, with inert examples committed. Keep private captures, player data, diagnostics, database dumps, configured Shortcuts and operator evidence outside the tracked application tree; make synthetic fixtures self-contained. Do not publish hosted origins, deployment URLs or IDs, Pages project names, account or D1 identifiers, Access audiences or administrator identities, or install links in tracked docs, reports, manifests, source or pull-request text.
- [ ] Use the platform's documented configuration mechanism; .env.example is documentation, not a guarantee that Cloudflare will load production variables. Commit safe configuration and examples, with explicit runtime settings for preview/production. Do not create duplicate private/public application implementations.
- [ ] Review the complete initial diff/tree, sensitive content and request destinations; scans supplement manual review. Record the one-time mapping from approved legacy source to canonical paths/hashes and intentional substitutions. Verify all required tests/builds against the migrated tree.
- [ ] Make focused commits using reviewed paths in the canonical checkout. Inspect the staged diff/tree and preserve signing guards/sentinel absent explicit activation authorization. Inspect workflow/integration triggers before push; a normal source push must not silently deploy production or sign.
- [ ] Push a normal branch without force; use reviewed PR/merge where configured and attach created PRs to the task. Record the final merged commit and GitHub CI results. Repair failures in this repository through ordinary commits and review.
- [ ] Prove a fresh clone can install dependencies, run tests/builds and develop against documented local/preview settings without copying source or private fixtures from the old workspace. Identify only expected external runtime credentials/configuration; preserve private backup/evidence separately.
- [ ] Switch the developer/editor/Codex project working path, scripts, documentation and operational commands to the canonical checkout. Record its repository root/application path and verify relative workflow/script paths. Existing chats and old local paths must not remain an accidental second source of edits.
- [ ] At this cutover, update skills/sanitized-push/SKILL.md and any active repository/agent/publication instructions that still demand a separate export for every push. Make the historical export rule apply only to the initial migration/legacy archive. Future commits use normal diff review, ignored secrets, examples and proportional scanning/checks. Preserve unrelated signing, no-secret and deployment authorization controls.
- [ ] Mark the legacy WHT source workspace read-only/reference-only after transferring every approved change and verifying the private snapshot. Archive it only after checking active chats/worktrees/unmerged changes. Keep one durable historical copy where needed, but never two maintained application trees.
- [ ] Future release fixes, Shortcut changes, help edits and cleanup commits happen directly in the canonical repo. Use normal branches/PRs/CI with no allowlisted recopy, manual export or source-sanitization build pipeline.

**Exit:** One maintained application repository is authoritative locally and on GitHub. Fresh-clone proof passes, private data/config are separated, old workspace is clearly archival, tooling/instructions point at the canonical path, and routine commits need no parallel export process.

## Task 2 — Accept Phase 10 and capture the release baseline

**Owner:** Orchestrator. **Status:** Closed by the user on October 26, 2026, after receiving the unique preview link and the settings-comparison limitations. This closes Task 2 as a user decision; the unchecked items below remain unresolved prerequisites and do not imply device approval or an accepted production release. See the [Task 2 baseline record](../../../daily-games-tracker/reports/production-task2-baseline.md).

**Inputs:** Completed Task 1 canonical repository and Phase 10 preview review/check outputs. **Output:** Identified candidate and prerequisites list.

- [ ] Record the user approval, exact unique preview deployment, app source tree/hash, schema/migrations, Shortcut source/artifact and known limitations.
- [x] Read the final Phase 10 report and inspect actual routes/stats/login behavior; update baseline assumptions if its implementation changed migrations or wire contracts. See [Task 2 baseline record](../../../daily-games-tracker/reports/production-task2-baseline.md); the later login has been reconciled in candidate `99e0b3aa` and deployed to a unique preview; acceptance and the settings-hash investigation remain open.
- [x] Capture canonical repository status, branch, committed source identity and any later approved changes without resetting/stashing/deleting unrelated work. Verify the Task 1 legacy snapshot remains recoverable; preserve any additional evidence generated after cutover. See the Task 2 baseline record for the bounded verification and limitations.
- [ ] Record the accepted canonical source commit/tree. Diagnose any blocked index/commit operation legitimately; do not treat an old baseline or an uncommitted workspace as the production release.
- [x] Carry forward each open Phase 5A/9 gate into the existing Task 2 baseline record with its owner, test or explicit approved disposition; preserve waivers. Include current official game-terms review and public display-name/score consent before real rollout. The gates themselves remain open.
- [ ] Choose the smallest reviewed release scope; no experimental route or admin diagnostic is automatically production scope. The Task 2 baseline record proposes a boundary, but the exact candidate and Shortcut remain subject to reconciliation and approval.

**Exit disposition:** The user closed Task 2 with the candidate and remaining prerequisites recorded. The unchecked items retain their stated evidence gaps; closure does not assert separate preview/device acceptance or a production-ready baseline.

## Task 3 — Inventory resources and make release decisions concrete

**Owner:** Orchestrator/operator. **Output:** Private release decision record and resource manifest.

- [ ] Inventory Cloudflare Pages projects/branches/deployments/domains/D1 databases, Workers, Access applications/policies, tunnels, buckets/KV/queues/workflows and deploy hooks/tokens, only where they exist.
- [ ] Inventory GitHub repos/checkouts/branches/actions/artifacts/environments/secrets and integrations; identify any automatic deployment/signing side effects before pushing.
- [ ] Inventory local worktrees, Docker/Podman containers/images/volumes/networks, dev servers, receiver harnesses, tunnels, temporary checkouts/exports/archives, .wrangler states and duplicate docs. Do not assume containers or extra websites exist. Record "none found" with the inspected scope where appropriate.
- [ ] For each resource record exact account/project/ID or resolved local path, purpose, dependencies, owner, data sensitivity, retain/archive/delete classification and evidence/backup location. List names and secret references, never secret values.
- [ ] Confirm the privately configured preview origin, preview D1 binding, separate credentials/install template and necessary Access configuration. Preserve the shared Pages project, account/DNS resources and tooling it needs without copying their identifiers into public files.
- [ ] Record production origin: use the existing Pages production hostname unless the user selects a custom domain. Verify actual ownership/DNS/TLS and canonical redirects for the chosen hostname; do not buy a domain without authorization.
- [ ] Record production data policy: proposed default is fresh production players/devices/sessions with configuration seeds only. If the user wants historical results, replace the default with an explicit audited migration/mapping/reconciliation plan. Never wholesale-copy preview credentials, test players or synthetic results.
- [ ] Record the desired first-player roster, intended display names, terms decision, launch window, backup destination/retention, support contact and authorization scope.
- [ ] Verify the private R2 delivery mechanism and authenticated same-origin download route, stable version policy and permitted public source scope.

**Exit:** All task parameters have concrete values before execution. Any unselected decision blocks only its dependent action, not independent preparation.

## Task 4 — Make the release tree clean, testable and publishable

**Owner:** Luna worker; Sol reviewer. **Files:** Application source/tests/config/package scripts, .gitignore, diagnostics and proposed application-checks workflow.

- [ ] Fix the known global lint/format errors within the release scope. If historical/generated files should be excluded, define justified narrow exclusions; do not hide application failures. Run checks against a clean dependency install.
- [ ] Inventory debug/proof surfaces: public/parser-proof.js, public/capture-safari-proof.txt, functions/admin/parser-proof.ts, functions/api/admin/parser-proof.ts and related helpers. Remove from production bundle or retain only with a documented protection/operational need. Keep fixtures/tests needed for regression proof.
- [ ] Verify production never logs raw captures, answer text, device codes, invite URLs or session cookies. Review no-store/cache/service-worker and route/error boundaries including Phase 10 /user and legacy /login.
- [ ] Confirm payload/origin/CSRF/XSS/admin verification and the limited per-isolate rate guard. Record whether that guard is accepted for this small launch or implement additional protection as a reviewed change; do not claim it is a global durable quota.
- [ ] Add meaningful regression tests before any behavior fix. Verify the changed failure first, make the minimal fix and rerun relevant checks. Documentation/config-only changes use proportional checks rather than artificial tests.
- [ ] Add a reviewed application CI workflow covering the committed application tree, lockfile installation, lint, typechecks, tests, build and local schema checks. Ensure it does not publish credentials or automatically deploy production on push.
- [ ] Keep lockfile/tool versions and compiler provenance pinned as appropriate; classify dependency/security findings and resolve material launch blockers.

**Exit:** Source passes the required checks with documented scope, production diagnostics are intentional, and CI tests the real application rather than only Shortcut probes.

## Task 5 — Prepare production configuration, data and recovery

**Owner:** Release-infrastructure worker/operator; independently reviewed.

- [ ] Set the private production DB binding, APP_ENV, APP_ORIGIN if required, administrator identity, Access issuer/audience and SHORTCUT_BUCKET binding for the authenticated download route in the selected environment configuration. Verify precedence of Wrangler vs dashboard settings; do not assume preview vars inherit, and do not copy any resulting identifier or URL into tracked files.
- [ ] Confirm production Access protects /admin* and /api/admin/* on all relevant hostnames. Also verify application JWT validation; anonymous/non-admin access fails without exposing player administration.
- [ ] Apply all actual release migrations to a disposable database first. Current inventory includes 0001_initial.sql, 0002_remove_result_hash.sql and 0003_login_return_url.sql; re-enumerate after Phase 10 instead of hardcoding a schema version.
- [ ] Prepare configuration seeds/version requirements without test users/results. Verify schema, constraints, game weights/ranks, puzzle/date rules and Shortcut minimum/latest policy.
- [ ] Before any production migration/import, inspect its existing state. Export and hash it if populated; record a Time Travel bookmark and rollback compatibility. Never overwrite unknown production contents.
- [ ] Rehearse SQL export/import and D1 Time Travel on a disposable remote database, not the retained preview database. Check counts/constraints/representative rows after restoration. Record exact resource IDs and returned undo bookmark; schedule downtime because restore can interrupt requests.
- [ ] Define website, DB and Shortcut recovery separately: code rollback does not reverse schema/data or installed Shortcuts. Define migration forward-fix vs restore criteria.
- [ ] Plan the first production deployment fallback explicitly: Pages preview deployments are not production rollback targets. With no earlier production release, verify a tested redeployable candidate and identify the controlled unavailable/maintenance response and its implementation.
- [ ] Complete admin/account recovery instructions and verify access to the backup location independently of the live service. Record a practical backup schedule and retention.

**Exit:** Production configuration is reviewable, data initialization is deterministic, and remote recovery is demonstrated without damaging preview.

## Task 6 — Finish the real user setup journey and help content

**Owner:** Application/setup worker; Sol reviewer. **Files:** RegistrationPage.tsx, UserPage.tsx, relevant API/onboarding helpers, home/help UI, PLAYER_SETUP.md and tests.

- [ ] Keep the existing flow: admin creates/chooses player → issues one-use 24-hour Add Device invitation → user opens production /register/<token> → registers device → one-time private code and supported install link appear → code is entered through the Shortcut Import Question.
- [ ] Add accessible setup help where users need it, not only a repository Markdown file. Include installation requirements, keeping the code page open, copying the code, installing the clean template and returning to WHT.
- [ ] Show the correct install link on registration and signed-in User, plus update_required responses. Handle an absent bucket binding honestly; do not invite players until a supported production template is ready.
- [ ] Document ordinary use: Krillion uses completed Safari page Share → Upload to WHT; MapTap uses its in-game Share your score → Upload to WHT. Explain confirmation, Cancel, saved repeats, copied scoreboard and Open WHT.
- [ ] Document login via User and the installed Shortcut, Safari as intended interface, PWA's separate session, logout and per-game Daily detail locks.
- [ ] Include a concise data/privacy note: what scores/round data are stored, which names/scores are public, what Daily details are protected, how to request administrator correction/deletion, and where to get help. Do not promise retention/deletion behavior the implementation does not support.
- [ ] Cover expired/reused invitation, lost setup page/code, setup skipped, replacement/second/lost device, revoked credential, wrong share input, offline/interrupted request, already-saved response and update required.
- [ ] Explain that redownload does not recover a private code. Reissue a device invitation when needed; revoke a known lost/leaked credential. Never duplicate the player identity as a workaround.
- [ ] Provide a concise private welcome-message template and operator invite checklist; do not embed a real invitation or send it without authorization.
- [ ] Test missing link, invite expiry/replay, duplicate redemption, successful bootstrap session, copy failure feedback and valid link across registration/User/update responses.

**Exit:** A new participant can complete setup from the website/help and an invitation without the developer narrating undocumented steps.

## Task 7 — Build, inspect and sign the production Shortcut

**Owner:** Shortcut worker/operator; Sol reviewer. **Inputs:** Final production origin, reviewed canonical source commit and exact version policy.

- [ ] Replace preview destinations in all production login/validate/submit actions and inspect emitted URLs. Preserve a separately identifiable preview build/template for development, without breaking existing preview users.
- [ ] Update source contracts/inspectors/tests for environment origin and accepted Phase 10 return behavior. Keep capture bytes, numeric version, nested JSON, credentials and guarded completion behavior correct.
- [ ] Make production Shortcut source changes directly in the canonical repository on a normal branch; review/commit/push under the post-cutover policy from Task 1. Run pinned GitHub compilation on that revision and inspect its downloaded artifacts/hashes. Do not repeat a private-to-public source export or distribute local generated leftovers.
- [ ] Freeze the credential-free signing package from exact inspected CI artifacts. Independently verify source/toolchain/artifact/package hashes and confirm no device code or private user data is embedded.
- [ ] Under existing standing HubSign authorization, have the protected Actions workflow compile/inspect the exact reviewed package and make one guarded request per attempt with fail-closed expected digests. Record the GitHub pending lease and private R2 signing state and digest-verified signed objects without overstating Apple/native verification. If a response is ambiguous, a user-directed retry remains authorized without repeat approval only after the exact reviewed package/source/digest/state checks pass.
- [ ] Preserve/independently hash the clean rollback/reference artifact. If a private configured backup is needed, operator verifies it privately without publishing its credential-bearing contents.
- [ ] Resolve operational-signing gate: explicitly authorize, provision and test the protected Actions-only signing workflow, or obtain an explicit accepted operational disposition for the reviewed one-shot process. Standing transfer approval alone does not activate workflows; no runtime signing worker or endpoint is required.
- [ ] Reconcile final source, CI, unsigned/signed package, version and native checklist; older 5A or 5B passes do not automatically prove this production artifact.

**Exit:** An exact reviewed production-targeted signed candidate and independent rollback record exist with truthful evidence boundaries.

## Task 8 — Create and verify the clean install link

**Owner:** Human iPhone operator plus orchestrator; no configured template sharing.

- [ ] Configure private R2 delivery and the SHORTCUT_BUCKET binding. Registration, signed-in User and update-required responses must return the same authenticated download route when storage is configured. Keep signed contents and storage configuration outside public artifacts, releases and source.
- [ ] Inspect the downloadable template behind the exact link: artifact identity/semantics, production endpoints, numeric version, setup question/empty credential default and expected actions. Account for any Apple export/container transformation by inspecting contents rather than asserting bytes unchanged.
- [ ] Prove that opening the authenticated signed-file download in Safari offers Add Shortcut on a real iPhone, then prove a fresh installation. This native behavior remains unverified until an operator records evidence. Name/icon alone are not artifact identity.
- [ ] Verify registration, User redownload and update policy use /api/shortcut/download only when the private bucket is configured; record minimum/latest version together. Confirm logged-out, revoked and deactivated access is rejected. Keep actual private environment values separate.
- [ ] Keep preview's link and version policy separately correct. Test an outdated disposable installation reaches the correct update link and stops before import; restore any temporary test policy immediately.

**Exit:** The user-facing install link delivers the tested clean production Shortcut and every setup/update entry point agrees.

## Task 9 — Deploy controlled production and verify isolation

**Owner:** Authorized deploy operator. **Prerequisites:** Tasks 1–8, concrete production approval and recovery record.

From daily-games-tracker in the canonical repository at the identified release commit, record tools/config selection, then use the existing scripts only after verifying their targets:

```text
npm ci
npm run lint
npm run format
npm run typecheck
npm test
npm run test:database
npm run test:smoke
npm run build
```

Run the relevant Python/Node Shortcut contract and Phase 9 script suites, including production-origin assertions, against the final files. Select a working interpreter explicitly; the workstation's default Python launcher was unavailable during documentation work. Inspect actual scripts/test inventory rather than assuming a historical test count.

- [ ] Build/test the canonical committed source with environment-specific settings supplied through Cloudflare configuration, local ignored development files or the documented deploy configuration. Record the source commit and non-secret configuration identity; do not transform or sanitize application code at deployment time. No separate private source overlay is allowed.
- [ ] Rehearse the final release application in retained preview with preview bindings/template and rerun setup/login/privacy checks. If release-preparation fixes materially changed the Phase 10-approved behavior, obtain preview acceptance of those changes before production. Record the final tested commit and environment-only differences; production URLs/credentials are proved separately in Tasks 9–10.
- [ ] Confirm this deploy mechanism includes Pages Functions and intended schema/config. Choose one controlled Direct Upload process initially; GitHub publication alone must not silently deploy.
- [ ] Apply production migrations/configuration seeds against the confirmed production binding, with backup/bookmark and target checks. Existing scripts: npm run db:production:migrate; inspect before running.
- [ ] Deploy using the reviewed production script against the privately configured Pages project and branch. Record deployment identity only in private operational evidence alongside source identity.
- [ ] Verify TLS/canonical host, root/User/Daily/All-Time, static assets, service-worker updates, legacy login routes, health/actual schema and games configuration.
- [ ] Verify anonymous and non-admin admin boundaries on the canonical host and any privately configured alternate origins; no bypass through unique deployments or provider aliases.
- [ ] Verify headers/no-store/request IDs, 404/405, oversized payload, origin/CSRF rejection, unauthenticated stats/Daily and public score-only All-Time.
- [ ] Prove preview still uses its privately configured preview D1 binding and intended origin/link; production uses its separate private binding. Use harmless authorized synthetic markers or private configuration/database identity evidence, never cross-environment real writes.
- [ ] Verify preview-issued device/session/invitation state cannot authenticate to production; do not copy secrets to make it work.
- [ ] Complete the terms-compatibility disposition.

**Exit:** Controlled production is secure and correct before broad invitations. Any failure stops onboarding and invokes Task 12 recovery.

### Task 9 UI addendum — deployed; iPhone acceptance pending

**Reviewed UI baseline:** `008d3dc6374eb3eb37446aa49431e4bc5cbfb6e8`. **Original UI release source:** `f9993f387f29025d4f256f4a288adaeca653a6f1`. **Screenshot/cache correction source:** `11a428ab75ca071bd37b04ac509afac6c577c513`.

- [x] **TDD — UI assertions first:** Added rendered-UI checks for the six-step registration flow, exactly two accessible help topics, the two Play sharing paths, and the absent User redownload card. The updated assertions failed before implementation and passed after the changes.
- [x] **Registration:** The completion page visibly guides users through six separate, spaced cards labeled Step 1 through Step 6, each with an action heading. Step 1 owns the read-only code, copy control, and feedback/manual-copy fallback; Step 2 owns the download link labeled “Download Upload to WHT”; Step 3 identifies Safari Downloads beside the address bar; Step 4 explains adding the Shortcut and entering the copied code at its Import Question; Step 5 owns Safari Share → Edit Actions → Favorites instructions and their images; Step 6 links to Play. Invitation, one-time code, and session behavior is preserved. An `<ol>` or six DOM instructions without this visible grouping does not satisfy the UI acceptance.
- [x] **Play:** Shows the Krillion results-page Share path and MapTap in-game Share your score path, followed by choosing Upload to WHT. Missing-action guidance says exactly “See the setup and sharing help below.” Obsolete login, unavailable-download, invitation-only, OCR, and PIN guidance is absent.
- [x] **Shared help:** Keeps exactly “Set up Upload to WHT” and “Share a completed game.” Each accessible topic owns its body copy, lists, and images in one content box. Setup directs not-yet-invited users to the administrator; sharing explains submission and clipboard behavior. The Krillion and MapTap screenshots remain byte-identical to the supplied originals, retaining their original framing, context, and red highlights; responsive sizing preserves each full aspect ratio. Favorites guidance includes the Safari Share and Edit Actions images, each rendered at its natural aspect ratio. The service-worker cache version is v4 so existing clients discard v3's cached crops. Favorites guidance follows the game-specific instructions.
- [x] **User:** Removes the redownload card from rendered output while retaining its implementation in a code comment for a future explicitly approved feature. Stats, login/logout, and the backend route remain unchanged.
- [x] **Verification:** The original UI implementation passed `npm test -- tests/unit/App.test.tsx tests/integration/onboarding.test.ts` (43/43) before this correction. For this correction, both image files were verified byte-identical to the supplied originals at 1179×421 and 1179×816, the cache-version change received independent static review, and `npm run build` plus `git diff --check` passed. Preview and production browser checks confirmed both full images render proportionally and D1 health reports schema v3. No test suites were rerun for this correction.
- [x] **Promotion:** Preview was verified before production. Both environments show the corrected screenshots and connected D1 health (schema v3). The same 147-file staged package was used for both deployments; its manifest SHA-256 is `6E0EAD2C0D95F1595451C4CC17EF0C138FBDD4E8A48439D7C414A80614C9606D`. The user explicitly authorized production deployment. No settings or bindings were changed, and no migrations, seeds, or database writes were performed.
- [x] **Scope:** Task 7/8 suites, signing rehearsals, Shortcut CI, Task 10, and pilot activity were not run as directed.
- [x] **Visible-flow correction verification:** Focused rendered assertions check the explicit step numbers/headings, code and copy ownership in Step 1, the download control in Step 2, the Play route, and the two Favorites images. `npm test -- tests/unit/App.test.tsx` passed (33/33), `npm test -- tests/unit` passed (286/286), and `npm run build` passed. A 390×844 local browser preview with synthetic code showed six distinct cards, a full-width bordered code field, loaded Favorites images at their original aspect ratios, and Step 6 plus recovery information scrollable above the fixed dock. No real invitation or database writes were made. The onboarding integration suite was attempted but Miniflare failed before test cases with a sandbox loopback `EACCES`; no integration-suite pass is claimed.
- [x] **Visible-flow correction promotion:** Promoted the exact reviewed revision `8e2aa62` through preview to stable production. Preview and production root, hashed JavaScript/CSS, both Favorites images, and service worker matched the private staged manifest byte-for-byte; the stable service-worker response had the expected `no-cache` header. A previously warmed stable client refreshed normally to the new hashed assets and rendered the updated help and images; the existing health view reported D1 schema v3. No database writes, migrations, real invite redemptions, or Shortcut changes were made.
- [ ] **iPhone Safari acceptance:** Manual phone-width acceptance of the six-step flow, current Safari Downloads/Share-sheet wording, and both images has not been performed. Keep this human acceptance item open; do not claim native or user acceptance.

**Exit:** The visible-flow correction is deployed. This addendum remains open only for the manual iPhone Safari acceptance above; it does not close Task 9 or Task 10.

### Task 9 scripting-permission help addition — requested 2026-10-29

- [x] Add a third shared expandable topic to PlayerHelp for the exact “Could not run Run JavaScript on Web Page” error, with the ordered Settings search, Advanced, Allow Running Scripts, and retry steps. Preserve all six registration cards.
- [x] Replace the setup topic body with the missing-action Favorites walkthrough and the missing-Shortcut administrator note; move its Safari Share/Edit Actions screenshots there. Keep the actual Krillion/MapTap sharing paths, game-share images, and submit/copy explanation in the completed-game topic.
- [x] Copy the three supplied full-context screenshots into maintained help assets; keep each image and its caption inside this topic, use descriptive alt text, and preserve responsive proportions.
- [x] Add focused UI assertions for three topics, the error/procedure, image containment and shared Play/setup/User placement. Fresh verification passed: `npm test -- tests/unit/App.test.tsx` (33/33), `npm run typecheck:tests`, and `npm run build`. Independent review was clean; the 390×844 production view loaded all seven help images without horizontal overflow.
- [x] **Historical static-asset check:** The earlier Preview/Production upload of reviewed revision `af237adbc6126cc78b3a2b3f75ca379a2fdf4862` matched the page, hashed bundles, service worker, and seven help images to the staged manifest; `sw.js` was served with `no-cache`, and a warmed client rendered the three topics. That upload ran from the wrong directory without application Functions, so it did not verify the API or constitute a healthy full release; production health served HTML and the UI identified itself as a local preview. The same reviewed source was then redeployed from the app directory with Functions, restoring JSON health/auth responses. The later `c393df8` heading fix and current `ae36c52` share-metadata release are recorded above. No D1 writes, invitation redemptions, or Shortcut changes were made in these repairs.

**Exit:** The third topic is live on the stable site and verified. This addition does not close Task 9 or Task 10, and does not claim manual iPhone Safari acceptance.

## Task 10 — Prove a fresh user's complete production journey

**Owner:** Two authorized phone testers/operator. **Evidence:** Redacted acceptance matrix tied to exact deployment/install link.

- [ ] Admin signs in through production Access, creates/selects a test player and generates a fresh production invitation. Verify the invitation hostname/expiry without logging its token.
- [ ] On a clean browser/device context, redeem once, copy the one-time code, install via the website's supported link and answer setup. Confirm bootstrap session and User stats/redownload/logout.
- [ ] Submit authorized real results for both games: native confirmation, Cancel/no write, new save, per-round/total correctness and repeat/no overwrite; compare bounded before/after DB evidence without publishing player answers.
- [ ] Verify both Share methods, scoreboard copying/privacy and returned production URLs. Use approved results/operators; automated agents do not silently submit real scores.
- [ ] Verify logout and Login with Device from /user, safe selected-Daily-date return, legacy /login, browser/PWA separation and Daily detail locks.
- [ ] Exercise invite expiry/replay, wrong input, revoked test credential/session, interrupted transport/re-share, unavailable clipboard feedback and supported update link, scoped to existing waivers and the new production setup risk.
- [ ] Record current and oldest-available iOS test coverage. If an unavailable device/version prevents a required check, record an explicit accepted launch disposition rather than a fabricated pass.
- [ ] Recover a deliberately lost test setup page/code via replacement invitation/revocation; verify no duplicate player and no raw-code recovery endpoint.
- [ ] Record who tested, OS/browser context, UTC/Pacific date, candidate identity, expected/actual behavior and any limitation. Remove/inactivate approved synthetic test accounts/results with normal audited tools before real standings start; retain legitimate pilot data per Task 3 policy.

**Exit:** Fresh users can install, authenticate, submit both games, see allowed data and recover from common setup failures without developer-only knowledge.

## Task 11 — Two-person pilot, seven-player pilot and rollout

**Owner:** User/operator; orchestrator tracks evidence.

- [ ] Run the two-person pilot against the exact supported production pair. Include another person independently following the help, not only the developer repeating a familiar flow.
- [ ] Fix substantive issues, review, publish/rebuild/re-sign as applicable, redeploy and rerun affected proof before expanding.
- [ ] Run the required seven-player pilot with production invitations issued close enough to setup to remain valid. Users choose approved display names knowing public All-Time exposes names/scores.
- [ ] Deliver private invitations and the welcome/help message through the authorized channel; otherwise prepare them for the human operator to send. Do not collect codes/screenshots containing secrets in chat.
- [ ] Track invitation delivered/redeemed, clean Shortcut installed/version, initial login, both game flows, scoreboard/privacy and support issues without retaining raw invitation/device tokens.
- [ ] Resolve all material defects or document user-approved limitations. Waived technical cases remain labeled waived.
- [ ] Invite the remaining intended group only after the seven-player gate passes. Confirm users are using the production address/template rather than preview or obsolete development links.

**Exit:** Intended users are actively using production, with a completed seven-player acceptance record and an understood support path.

## Task 12 — Stabilize and exercise rollback readiness

**Owner:** Operator. **Planning default:** Observe at least two complete Pacific game days, including a day boundary, before destructive development cleanup; user may choose a different recorded window.

- [ ] Use the observation window to record whether intended players can complete imports/new saves/repeats and any actual support issues.
- [ ] Verify scheduled exports/backup retention and access to the first retained backup; test restore evidence on a disposable remote target remains valid.
- [ ] Record the tested first-release redeploy fallback, schema compatibility, signed Shortcut fallback and how to pause invitations/writes safely if integrity is uncertain.
- [ ] For an incident, stop expansion, preserve evidence/backup, choose code redeploy/forward migration/restore based on compatibility, then verify auth/import/boards before reopening. A DB restore may lose intervening legitimate writes; communicate/reconcile that explicitly.
- [ ] Rollback does not delete production players or replace production with preview. Never restore a database blindly solely because a UI deploy failed.
- [ ] Account for any final patch with a new commit/build/deployment identity and targeted acceptance.

**Exit:** The recorded observation window is complete, production has no unresolved material defects, and recovery procedures are understood.

## Task 13 — Consolidate documentation and archive development evidence

**Owner:** Documentation/cleanup worker after release stabilization; read-only independent review.

- [ ] Maintain a small active set: README, current status, execution roadmap, final product requirements, production runbook, player help, development workflow and current release/launch record.
- [ ] Reconcile Phase 5A/9/10 status with actual evidence; close gates individually or record approved limitations. Preserve older candidate hashes instead of rewriting history to imply newer native passes.
- [ ] Inventory all root/daily-games-tracker/docs, reports, diagnostic/probe plans, manual Shortcut guides and duplicate Markdown. Classify each as active reference, required build/test input, private historical evidence or disposable duplicate.
- [ ] Archive superseded plans/reports with a dated index and successor link in a durable private location or clearly historical repository area if safe. Do not simply delete records while active links, tests, CI verifiers or the launch ledger reference them.
- [ ] Update README/current plan and all relative links/anchors. If moving paths consumed by scripts, update/review/test those scripts in the same change. Keep fixture/provenance/license documents needed by the maintained toolchain.
- [ ] Remove development-only help and misleading pilot instructions from the public user experience; keep useful rollback/setup details in the operator runbook.
- [ ] Commit/push documentation cleanup normally from the canonical repository through ordinary diff review and checks. Private historical Markdown stays outside the tracked tree; no recurring export to a second repository.
- [ ] Verify no public guide points production users at preview, an obsolete install link or developer-only instructions.

**Exit:** A new user and future maintainer have clear active instructions without losing audit, rollback or build provenance.

## Task 14 — Remove confirmed disposable resources and verify retained preview

**Owner:** Authorized cleanup operator. **Input:** Task 3 inventory, updated with final dependencies and approved exact removal set.

| Resource class                                                             | Required disposition                                                                                     |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Production site/DB/domain/Access/backups                                   | Keep                                                                                                     |
| Existing privately configured preview origin and D1 binding                | Keep as permanent dev/test                                                                               |
| Shared Pages project, account/DNS/Access policies used by either           | Keep; inspect shared dependencies before any change                                                      |
| Canonical GitHub-backed checkout, CI workflows, toolchain locks            | Keep                                                                                                     |
| Old unique deployment URLs                                                 | Retain rollback/evidence targets first; remove only confirmed unneeded history within supported controls |
| Disposable remote recovery DBs, receiver/proof Workers, tunnels/test sites | Delete only identified instances after backup/evidence/dependency checks                                 |
| Docker/Podman resources or local dev servers                               | Stop/remove only task-owned unused instances; never global prune                                         |
| tmp exports/CI downloads/diagnostics/probe artifacts/local .wrangler DBs   | Remove only confirmed disposable files using exact paths                                                 |
| node_modules/dist/caches                                                   | Regenerable; clean only if useful, retaining lockfiles and reproducibility                               |
| Superseded Markdown                                                        | Archive/consolidate using Task 13, not blanket deletion                                                  |
| Old device credentials/invites/deploy hooks/test API tokens                | Revoke only identified obsolete ones; preserve active production/preview access                          |
| Worktrees/branches/chats                                                   | Preserve unmerged/unpublished changes; use managed worktree archive tooling where applicable             |

- [ ] Re-inventory before removal; creation-time inventory may now be stale. Each row must name exact resource ID/path, purpose, backup/hash if needed, dependencies, action and verification.
- [ ] Resolve local absolute paths and verify they stay inside the intended cleanup directory before recursive delete/move. On Windows use one shell end-to-end with literal paths; do not compose cross-shell wildcard deletion.
- [ ] Before deleting a disposable remote database, confirm its exact ID and verify it is neither the production database nor the retained preview database.
- [ ] Remove in small dependent batches: stop task-owned services/tunnels, then detached resources, then temporary files. Do not run global container/system prune or delete unrelated services/accounts/repositories.
- [ ] Verify production health/auth/import capability, live install link and backup target after each cloud batch. Verify preview health, /user/auth/admin boundaries, intended DB and a disposable future-change test still work.
- [ ] Record actual deletions/retentions/failures and before/after IDs; no ambiguous "cleaned everything" claim. If an unknown dependency remains, retain it with a reason.
- [ ] Protect credentials used by current devices: do not rotate/revoke all codes as general tidying. Remove old shortcuts from personal devices only with operator participation after the supported replacement works.

**Exit:** Disposable development resources are gone or explicitly retained with reasons; preview website/database remain usable and production is unaffected. The canonical repo is the only editable application tree; any retained legacy workspace is archival.

## Task 15 — Final handoff and future release workflow

**Owner:** Orchestrator/operator.

- [ ] Record exact production source commit/tree, config identity, target deployment identity, applied migration set, source-check results and production verification outcomes.
- [ ] Reconcile every task and launch gate with concrete evidence; no pending blocker can be hidden by a passing format/ledger check.
- [ ] Confirm intended users are onboarded and have successfully used both games; document any nonparticipants/support follow-ups without pretending all players tested.
- [ ] Confirm Task 14 cleanup is complete with retained preview/DB listed explicitly. Remove or archive obsolete export-only scripts/checkouts after verifying no CI/build dependency needs them; keep the one-time migration record privately.
- [ ] Establish future workflow in the single canonical repository: create branch → edit/test → commit/push → CI/review → preview deploy against preview DB → user acceptance → merge/release the verified commit → production migrations/promotion. Account for a merge commit with final checks if its tree differs. No separate sanitization/export stage; production is not the test environment.
- [ ] Retain separate development Shortcut credentials/template; production users keep the supported production Shortcut. Test update/version policy in preview first.
- [ ] Update active status and runbook, publish only sanitized final notes, and mark launch complete only after all required gates and user-approved dispositions are recorded.

## 6. Execution checks and evidence rules

Run commands only after resolving working directory, target account/project and release identity. Existing application checks run from daily-games-tracker. Reinspect package scripts and workflow locations after Phase 10. Python/Node script suites and private configuration handling must use the final release paths.

```text
node scripts/phase9-verify-launch-gates.mjs --ledger reports/phase9-launch-gates.json
node scripts/phase9-rehearse-recovery.mjs
node --test scripts/tests/phase9-launch-gates.test.mjs scripts/tests/phase9-recovery.test.mjs scripts/tests/phase5a-verifier.test.mjs scripts/tests/phase5a-signing-workflow.test.mjs
```

The current ledger deliberately preserves old 5A identity and pending/waived states; keep that historical ledger unchanged. Record the current production source/config/target, applied migrations and verification outcomes as ordinary execution evidence. Historical green checks are not fresh final-release verification.

Production execution evidence records the exact source, effective configuration, target, deployed version, applied migrations and verification outcomes needed to confirm the action. Keep private values out of public records.

## 7. Final launch completion checklist

- [ ] Phase 10 approved in preview; exact accepted baseline preserved.
- [ ] One-time migration complete: a single authoritative GitHub-backed application repo, fresh-clone build/test proof, legacy source workspace read-only/archived, private material external/ignored, and updated publication/development instructions. Final commit/CI/build/release traceable.
- [ ] Production origin, configuration, Access, migrations/configuration seeds and data policy verified; preview isolated and retained.
- [ ] Exact production Shortcut CI-built/inspected/signed; clean link and version policy proved across setup/User/update.
- [ ] Invitation-only signup/help/replacement-device journey works end to end.
- [ ] Real production phone/browser/OS matrix and two-person/seven-player pilots evidenced within approved limitations.
- [ ] Phase 5A formal gates and existing waivers accurately dispositioned; remaining Phase 9/10 blockers resolved.
- [ ] Terms compatibility disposition recorded.
- [ ] Remote backup/restore, administrator recovery and paired release rollback ready.
- [ ] Intended users are using production successfully; stabilization observation complete.
- [ ] Development resources/docs cleaned or explicitly retained; preview website and DB still usable.
- [ ] Operator/player/future-development documentation complete.

## 8. Platform references checked during planning

These establish available mechanisms, not the current account configuration; recheck at execution:

- [Pages production/preview configuration](https://developers.cloudflare.com/pages/functions/wrangler-configuration/): environment binding/variable overrides require explicit attention.
- [Pages rollback](https://developers.cloudflare.com/pages/configuration/rollbacks/): rollback targets are prior production deployments, not previews.
- [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/): restore is not a clone and can interrupt in-flight operations.
