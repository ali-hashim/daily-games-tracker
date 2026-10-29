# Current project status

Updated October 29, 2026. This page is the concise active status. The [production launch record](../docs/superpowers/plans/2026-10-25-production-launch.md#current-production-release) carries the release history; the [Phase 9 ledger](PHASE_9_LAUNCH_GATES.md) preserves the earlier pre-production gate snapshot.

## Production release

Production currently serves the Pages Functions and UI from source commit `ae36c52800b41f2bbb411c1d5e83e09c37be1f31`. The production D1 database is initialized at schema 3 with minimum/latest Shortcut version `1/1`. The post-repair health route returned JSON with schema 3, anonymous authentication returned JSON `401`, and the production Play, All-Time, User, and help views were click-checked. No database writes were made during the deployment repairs.

The initial static-only upload came from the wrong working directory and temporarily served HTML from the API health route and a “Local UI preview” page. It was corrected by deploying the reviewed application with Functions from the app directory. The later share-preview change is part of the current release.

The website shows six visible registration cards, three shared help topics, and seven responsive help images. The topics cover setup and Favorites, the Krillion/MapTap share paths and result submission, and **Fix “Could not run JavaScript”** for the full “Could not run Run JavaScript on Web Page” error. The User-page redownload control remains hidden pending future device codes; its authenticated backend route is intact. Open Graph/Twitter metadata uses the WHT green-check icon, and the HTML rewriter uses the request origin without an invitation token; live metadata and image hash were verified.

The signed Shortcut remains version 1, signed from source `29c4acea` in the protected CI run recorded in Task 7. Later website commits did not change or re-sign that Shortcut. The user’s final test instruction remains in force: no repeated Task 7/8 suites, phone acceptance, signing rehearsals, or waived phone-side hash comparison.

## Task disposition

Task 1 established the canonical repository. The user closed Tasks 2–4 with their recorded limitations preserved. Tasks 5 and 8 are complete and accepted. Task 6 setup/help implementation is deployed; Task 7 signing is complete. Task 9 production setup and deployment are complete, with the following human checks still open:

- Sign in through Cloudflare Access as the authorized administrator; confirm the admin page loads and the player list is empty.
- Use an Access-admitted non-admin identity to confirm the admin page/API is blocked or returns `403` without player data.
- In an authorized player session, verify the production download route returns the expected `Upload to WHT.shortcut` attachment. If no controlled player identity exists, create a clearly labeled temporary test player/invitation, register a controlled device, and revoke the test credential afterward where supported. Do not paste codes, cookies, JWTs, or invitation links into chat or public records.

Task 10 remains open: the full fresh-user production journey and real-device/session/update behavior have not been completed. Tasks 11–15 remain separate follow-up work: the pilots, stabilization, archive review, cleanup, and final handoff. Manual iPhone Safari acceptance of the latest UI also remains open.

## Accepted scope and records

The user canceled the second D1 backup, backup schedule, and alert setup and accepts that no separate production database copy is maintained. The user also removed Cloudflare plan/CPU checks and monitoring/alert setup from the production release gates. These are not active launch or post-release requirements. Preserve the separate limitations recorded in the closed-task reports; do not reopen accepted Task 5/8 checks or infer that Task 10 is complete.

Keep hosted origins, deployment IDs, Pages/account/D1 identifiers, Access audiences, administrator identities, player data, install links, and private operational evidence in private configuration or ignored records. Public source commit and CI provenance may be recorded without deployment details.

For a new computer, start with the [portable handoff](../DEVELOPMENT_HANDOFF.md). The [work audit](reports/development-work-audit.md) catalogs older local changes and their preserved or superseded disposition. Cloudflare/GitHub hold the live resources and signing state; historical local evidence is not a development dependency.
