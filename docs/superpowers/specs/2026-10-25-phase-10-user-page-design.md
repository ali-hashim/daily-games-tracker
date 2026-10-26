# Phase 10 User page design

## Intent

Replace the standalone login destination with a permanent `/user` destination that works for signed-out and signed-in players. The page should make Login with Device feel intentional, give authenticated players a useful private scorecard, and let a player return safely to the dated Daily page that led to sign-in.

## Goals

- Canonical `/user` route with `/login` retained as a compatible alias.
- Permanent bottom navigation order: Play, Daily, All-Time, User.
- Logged-out Daily visitors reach `/user` with a safe selected-date return target.
- Signed-in Daily shows only the authenticated scoreboard content; its identity/logout card is removed.
- Signed-in User shows one card for every active game with all-time total, games played, average, and current rank; zero-play values are `0`, `0`, `—`, and `—` respectively.
- User provides the configured supported Shortcut install URL when available and a logout action.
- Login return URLs are server-validated, same-origin, limited to `/user` or a valid dated `/daily/YYYY-MM-DD`, and stored with the short-lived login challenge.
- Personal responses are authenticated, `no-store`, and never include round prompts, answers, device codes, or challenge values.
- Expiry/revocation and logout clear personal UI state; only an authenticated `401` redirects Daily to User. Network and server failures remain errors.

## Non-goals and anti-goals

- No changes to All-Time visibility or Daily per-game detail locks.
- No email/password/PIN/Apple-ID authentication and no new Shortcut branch or install-link change.
- No private device-code recovery or display on User.
- No production deployment, public publication, WHT API write, workflow activation, or Shortcut compilation in this phase.
- No broad auth refactor or service-worker cookie sharing between Safari and the PWA context.

## Constraints

Reuse the existing browser-bound Login with Device challenge, session, logout, revocation, rolling idle expiry, and source-device ownership checks. Safari remains the intended interface; Home Screen PWA cookies remain a separate context. Protected `/user`, `/login`, Daily API, and personal API resources must bypass browser and service-worker caches. The existing supported server-configured iCloud Shortcut URL validation is the source of truth for the redownload link.

## Approaches

1. Extend `DeviceLogin` with an authenticated render slot, add `/api/user/stats`, and persist a validated return path on each login challenge. This is the selected approach because it preserves the reviewed auth flow while keeping the User data contract independently testable.
2. Replace `DeviceLogin` with a shared auth context and migrate every protected page. This is deferred: it is a larger refactor than Phase 10 requires and increases regression risk around the reviewed login flow.
3. Add stats to `/api/auth/me` and use that response for User. This is rejected for Phase 10 because it makes the identity endpoint heavy and obscures the separate no-store personal-data boundary.

## Product decisions

- The User scorecard is an all-time per-game summary, matching the existing public aggregate definitions: total points, submitted games, average rounded to the existing two-decimal server value, and current rank. It excludes round-level details and answers.
- A game with no submissions renders `0` total, `0` games played, `—` average, and `—` rank. A missing configured install URL renders an explanatory unavailable state rather than a fabricated link.
- A signed-out Daily request redirects to `/user?return_url=/daily/YYYY-MM-DD` after `/api/auth/me` returns 401. Invalid or future dates remain governed by the existing Daily route/API behavior.
- After a successful browser completion, the originating browser navigates to the server-validated return path. The Shortcut's approval response returns the corresponding absolute same-origin URL; the Shortcut continues to use that server response for its Safari return action.
- `/login` remains an alias for the User experience so old links and existing native artifacts continue to resolve, while new product links use `/user`.
- The `/login` alias renders the same experience without forcing a redirect, preserving old native/browser links while `/user` is the canonical destination for new links and server return URLs.
- Missing or invalid return targets fall back silently to `/user`; an expired or revoked challenge stays on the User page with the existing restart/error state rather than redirecting elsewhere.
- If an authenticated User session expires or is revoked while the scorecard is open, the page remains at `/user`, clears personal state, and shows the signed-out Login with Device experience.
- “Each game” means the currently active `krillion` and `maptap` rows returned by the existing active-game query, in its existing Krillion-then-MapTap order.

## Builder decisions left to implementation

Use the existing WHT typography, dark cards, accent colors, icons, and mobile safe-area spacing. Keep loading, empty, error, expiry, and disabled-link states explicit and accessible. Add focused unit/integration tests for route classification, safe return validation, 401-only Daily redirect behavior, stats privacy/zero states, challenge return-url persistence, cache boundaries, and logout state clearing. Preserve all unrelated dirty worktree changes.
