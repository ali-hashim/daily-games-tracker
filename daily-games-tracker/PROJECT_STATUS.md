# Current project status

Updated November 5, 2026. This page is the concise active status. The [production launch record](../docs/superpowers/plans/2026-10-25-production-launch.md#current-production-release) carries the release history; the [Phase 9 ledger](PHASE_9_LAUNCH_GATES.md) preserves the earlier pre-production gate snapshot.

## Production release

Production currently serves the Pages Functions and UI from source commit `ae36c52800b41f2bbb411c1d5e83e09c37be1f31`. The production D1 database is initialized at schema 3 with minimum/latest Shortcut version `1/1`. The post-repair health route returned JSON with schema 3, anonymous authentication returned JSON `401`, and the production Play, All-Time, User, and help views were click-checked. No database writes were made during the deployment repairs.

The initial static-only upload came from the wrong working directory and temporarily served HTML from the API health route and a “Local UI preview” page. It was corrected by deploying the reviewed application with Functions from the app directory. The later share-preview change is part of the current release.

The website shows six visible registration cards, three shared help topics, and seven responsive help images. The topics cover setup and Favorites, the Krillion/MapTap share paths and result submission, and **Fix “Could not run JavaScript”** for the full “Could not run Run JavaScript on Web Page” error. The User-page redownload control remains hidden pending future device codes; its authenticated backend route is intact. Open Graph/Twitter metadata uses the WHT green-check icon, and the HTML rewriter uses the request origin without an invitation token; live metadata and image hash were verified.

The signed Shortcut remains version 1, signed from source `29c4acea` in the protected CI run recorded in Task 7. Later website commits did not change or re-sign that Shortcut. The user’s final test instruction remains in force: no repeated Task 7/8 suites, phone acceptance, signing rehearsals, or waived phone-side hash comparison.

## Task disposition

Task 1 established the canonical repository. The user closed Tasks 2–4 with their recorded limitations preserved. Tasks 5 and 8 are complete and accepted. Task 6 setup/help implementation is deployed; Task 7 signing is complete. Task 9 production setup and deployment are complete.

**Owner acceptance, November 5, 2026.** Seven players have used the production website and Shortcut for about a week with no inherent issues. The owner accepts the following as closed based on that week of production use. These are owner acceptances, not separate scripted test passes, and they are not native acceptance evidence:

- Task 9 administrator success, authenticated Shortcut download, and manual iPhone Safari acceptance of the latest UI.
- Task 10 fresh-user journey. All seven players run iOS 26 or later; one moved up from iOS 18.5, where the Shortcut did not accept the Safari webpage input. iOS 26 or later is the tested range and older versions are unsupported.
- Task 11 pilots: the seven-player production use stands as the pilot.
- Task 12 observation window: the first week of production use is the window.

Accepted limitations: no separate production database copy (see below); the update-required path has not been exercised because only version 1 exists; invitation expiry or replay, lost setup page, revoked credential, replacement device and interrupted-share failure paths were not deliberately exercised.

Known defects and follow-up: the Krillion expanded-answers/advisory rejection is fixed server-side on the `feature/player-help-leaderboards-krillion-fix` branch (no new Shortcut needed; deploy pending). The Daily page now has a Single Day / Multiple Days switch (`/daily/multi`, public), and `/all-time` is a stats board (cumulative points, averages per day and per game played, current and longest streak, days played, best day) backed by `/api/leaderboards/stats`; both are unreleased until this branch is merged and deployed. Setup and help now state that iOS 26 or later is required.

**Non-administrator denial, November 5, 2026.** The owner tried the Cloudflare Access sign-in on the admin page with two non-administrator emails. Access sent no sign-in code and neither reached the admin page; the administrator email received a code and signed in. This verifies the outer Access boundary. The application's own 403 for an Access-admitted non-administrator was not exercised live because Access does not admit those identities; it is covered by the automated admin and Access tests.

**Terms decision, November 5, 2026.** The owner decided that using Krillion and MapTap results in WHT is compatible with their terms. This is the owner's decision, recorded as stated, not legal or independent verification.

Still open: confirmation that no controlled test identities or results remain in production data; the rollback and pause-invitations procedure (Task 12); Tasks 13–15 (archive review, cleanup, final handoff).

## Accepted scope and records

The user canceled the second D1 backup, backup schedule, and alert setup and accepts that no separate production database copy is maintained. The user also removed Cloudflare plan/CPU checks and monitoring/alert setup from the production release gates. These are not active launch or post-release requirements. Preserve the separate limitations recorded in the closed-task reports; do not reopen accepted Task 5/8 checks or infer that Task 10 is complete.

Keep hosted origins, deployment IDs, Pages/account/D1 identifiers, Access audiences, administrator identities, player data, install links, and private operational evidence in private configuration or ignored records. Public source commit and CI provenance may be recorded without deployment details.

For a new computer, start with the [portable handoff](../DEVELOPMENT_HANDOFF.md). The [work audit](reports/development-work-audit.md) catalogs older local changes and their preserved or superseded disposition. Cloudflare/GitHub hold the live resources and signing state; historical local evidence is not a development dependency.
