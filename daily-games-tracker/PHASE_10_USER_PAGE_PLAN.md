# Phase 10 — User page/tab

**Status:** Implemented, independently reviewed, and preview-deployed October 25, 2026. Final additional numbered phase after Phase 9. Existing Phase 5A/9 gates remain open. [Current progress](PROJECT_STATUS.md). Exact evidence: [Phase 10 verification report](reports/phase10-user-page-verification.md).

## User requirements

1. Replace the standalone login page with /user.
2. Add **User** as the fourth permanent bottom dock tile: **Play → Daily → All-Time → User**, visible logged in and logged out.
3. Redirect logged-out Daily visitors to the User sign-in page.
4. Remove the signed-in identity/logout button or box above the daily scoreboards when logged in.
5. Make sign-in from User aesthetically pleasing, clear and consistent with WHT.
6. After sign-in show the player's stats for **each game**, Shortcut redownload link, and logout on User.

## Boundaries and open decisions

Reuse existing Login with Device challenges, sessions and security. Coordinate app links/routes, server return_url and Shortcut/browser return. The legacy `/login` path renders the same User experience without a forced redirect, while new links and server defaults use `/user`. Preserve safe same-origin selected Daily date through sign-in; direct User visits show stats when signed in.

Keep All-Time public and Daily server-authenticated with existing per-game detail locks. Redirect authentication failures, not network/server errors. Make /user private/network-only in response/service-worker policies. Clear/refetch personal state on logout, expiry, revocation or account changes.

Exact metrics/time range, stats API, layout/icon/copy and loading/error/empty/accessibility states remain design decisions. Total, games played, average and rank are possible starting points, **not approved metric requirements**; define zero-play/zero-score/missing-rank behavior. Do not fetch protected answers merely to show stats.

Redownload uses the supported server-configured install URL; do not expose/recover private device codes. Replacement devices retain invitation flow. Safari is intended interface, PWA a separate cookie context. Needed Shortcut changes compile via pinned CI and inspected artifacts under the standing signing policy.

## Acceptance evidence

- [x] Settle design/metrics decisions before product implementation; design recorded in `docs/superpowers/specs/2026-10-25-phase-10-user-page-design.md`.
- [x] Add `/user`, compatible legacy routes, fourth dock tile, updated links/runtime return URLs.
- [x] Redirect logged-out Daily visitors preserving date; remove Daily signed-in/logout box without removing auth/detail locks.
- [x] Deliver polished sign-in and signed-in per-game stats/redownload/logout with honest empty/loading/error states.
- [x] Verify direct User/legacy routes/active tile, safe dated return, expiry/revocation/logout, account-switch isolation, no redirect loops/open redirects, and no stale personal data through mounted regression tests and final review.
- [x] Verify metric/zero/no-result correctness, public All-Time, Daily locks and clipboard behavior through the full suite and focused privacy tests.
- [x] Verify mobile dock/safe-area CSS, accessibility states, and separate Safari/PWA cache/session boundaries in local tests/source review; physical device rendering remains open.
- [x] Run relevant checks and Luna xhigh implementation / Sol medium independent review-repair cycles; record evidence in `reports/phase10-user-page-verification.md`.
- [x] Verify reviewed preview deployment when authorized; refresh affected Phase 9 evidence and tracking. Preview alias: `https://preview.winstitute-of-higher-thinking.pages.dev`; latest unique deployment: `https://3e7e7979.winstitute-of-higher-thinking.pages.dev`.

The Phase 10 engineering scope is implemented, preview-verified, and evidenced above. Production and physical-device/native acceptance remain separately open and are not implied by this documentation update.
