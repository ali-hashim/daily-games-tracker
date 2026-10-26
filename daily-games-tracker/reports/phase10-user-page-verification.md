# Phase 10 User page verification

Verified October 25, 2026 (`America/Los_Angeles`) in the intentionally dirty WHT worktree. The reviewed Phase 10 build, including the User-route fix, is deployed to the preview branch at [preview.example.invalid](https://preview.example.invalid), with latest unique deployment URL [preview.example.invalid](https://preview.example.invalid). No production deployment, public publication, Shortcut compilation/distribution, workflow activation, WHT API write, or install-link change was performed.

## Implemented scope

- Canonical `/user` experience with `/login` rendered as a compatible alias.
- Permanent bottom navigation order: Play, Daily, All-Time, User; the User tile is present in signed-out and signed-in states.
- Daily uses an authenticated gate and redirects only a 401 to `/user?return_url=/daily/YYYY-MM-DD`; network/server failures stay visible as errors.
- Signed-in Daily renders the existing protected scoreboard without the former identity/logout card.
- User sign-in reuses Login with Device and provides a WHT-styled private scorecard for active Krillion and MapTap, with total, games played, average, rank, explicit zero-play values, supported Shortcut redownload/unavailable state, logout, loading, and error states.
- Login challenges persist a server-validated same-origin `/user` or dated Daily return path. Cross-origin, malformed, query-bearing, fragment-bearing, unsupported, and invalid-date targets fall back to `/user`; approval returns the absolute server-provided URL.
- User/API/login resources remain no-store and network-only; service-worker cache version advanced to v3. Auth revalidation clears stale personal state on focus, pageshow, visibility, bounded interval, logout, expiry, revocation, and account changes.
- Personal stats never include prompts, answers, round details, device codes, or challenge values.
- Explicit Pages Function shell handlers serve `/user`, `/user/`, `/login`, and `/login/` without the prior Cloudflare 308-to-home behavior; the client classifies all four paths as User.

## Automated evidence

All commands below were run after the final repair/review cycle unless noted.

| Check                                                                                     | Result                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                                                                | PASS — 26 files, 420 tests                                                                                                                         |
| `npm test -- tests/integration/user-route.test.ts`                                          | PASS — 9 route-shell, alias, query-preservation, delegation, and client-classification tests                                                     |
| `npm test -- tests/unit/App.test.tsx tests/unit/cache-policy.test.ts`                     | PASS — 44 tests                                                                                                                                    |
| `npm test -- tests/integration/device-login.test.ts tests/integration/user-stats.test.ts` | PASS — 19 tests, with loopback access for Miniflare                                                                                                |
| `npm run typecheck`                                                                       | PASS — app, functions, service worker, and tests                                                                                                   |
| `npm run build`                                                                           | PASS — Vite transformed 40 modules and emitted app/service-worker bundles                                                                          |
| Scoped `npx eslint` over Phase 10 client/server files                                     | PASS — zero diagnostics                                                                                                                            |
| Scoped `npx prettier --check` over supported Phase 10 files                               | PASS — all supported files matched; SQL and Cloudflare `_headers`/`_redirects` have no configured Prettier parser                                  |
| `npm run test:database`                                                                   | PASS — current D1 schema/migrations, seeds, foreign keys, and uniqueness constraints                                                               |
| `npm run test:smoke`                                                                      | PASS — local Pages/Functions/D1 smoke, schema 3, route boundaries, registration, device/session login, logout, replay protection, and cache policy |
| Cloudflare Pages preview deployment                                                       | PASS — build uploaded to the `preview` branch; shell routes, `/api/health`, `/api/games`, `/api/user/stats` unauthenticated 401, JSON API 404, and `/sw.js` checked read-only |
| Live preview User-route check                                                             | PASS — `/user`, `/user/`, `/login`, and `/login/` returned 200 with no `Location` header; browser click reached `/user` and rendered Login with Device |

The sandbox-only runs of Miniflare/Wrangler initially failed before test execution because loopback/log access was denied; the same commands passed with approved local loopback/filesystem access. No external service was contacted for these checks.

## Review evidence

- Implementation workers: `implementation_worker_1` (GPT-5.6 Luna xhigh) server/auth/stats scope and `implementation_worker_2` (GPT-5.6 Luna xhigh) client/cache scope.
- Independent reviewer: `reviewer` (GPT-6.1 Sol medium).
- Review cycle 1 found four Important and one Minor issue; Luna repairs added mounted behavior tests, auth revalidation, independent logout/error states, typed integration decoding, and flexible dock sizing.
- Targeted review cycle 2 found two Important auth races; Luna repairs added player-scoped cancellation/generation guards and logout/session generation invalidation.
- Targeted review cycle 3 found two scoped React lint errors; Luna repaired the render-prop lint boundary and scheduled the User stats effect safely.
- Final Sol review: PASS; no Critical, Important, or Minor findings.

## Evidence limitations and remaining gates

- Safari/native Shortcut approval and return behavior were not exercised on a physical device; the existing Phase 5A/5B native and signing evidence remains unchanged.
- Physical 320px/360px rendering was not manually exercised; responsive CSS and mounted/UI/source checks passed.
- Preview deployment is verified above, but physical-device/native behavior was not rerun against this deployment. Existing Phase 5A formal closeout, Phase 9 launch gates, production configuration/restore, terms, pilot, monitoring, and distribution decisions remain open and retain their existing dispositions.
