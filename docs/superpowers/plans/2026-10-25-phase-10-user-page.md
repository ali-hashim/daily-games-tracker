# Phase 10 User page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the canonical `/user` experience, compatible `/login` alias, authenticated personal scorecard, permanent User dock tile, and safe Daily sign-in return flow.

**Architecture:** Keep `DeviceLogin` as the browser-bound Login with Device boundary and add a small authenticated render slot for User and an explicit 401-only Daily gate. Add a separate authenticated `/api/user/stats` response built from the existing all-time aggregate model, and persist a server-validated return path on each short-lived login challenge. Keep protected paths network-only and preserve All-Time public/Daily detail-lock contracts.

**Tech Stack:** React 19, TypeScript, Cloudflare Pages Functions, D1/SQLite migrations, Vitest, Vite, service worker cache policy.

**Spec:** `docs/superpowers/specs/2026-10-25-phase-10-user-page-design.md`

## Global Constraints

- Canonical `/user` route with `/login` retained as a compatible alias rendered by the same experience.
- Permanent bottom navigation order is Play, Daily, All-Time, User.
- Only an authenticated `401` redirects Daily to `/user`; network/server failures remain errors.
- User stats are all-time per-game total points, submitted games, average, and current rank; zero-play values are `0`, `0`, `—`, and `—`.
- User and login responses/resources are authenticated or network-only, `no-store`, and never expose round prompts, answers, device codes, or challenge values.
- Return targets are server-validated, same-origin, limited to `/user` or a valid dated `/daily/YYYY-MM-DD`, and default to `/user` when missing or invalid.
- Active games are the existing `krillion` and `maptap` rows in existing Krillion-then-MapTap order.
- Safari remains the intended interface; the PWA remains a separate cookie context.
- Preserve unrelated dirty/untracked worktree changes; do not publish, deploy, activate workflows, change install links, or compile a Shortcut locally.

## Review Focus

- A protected Daily request receives a network error or 500: it must not redirect; test in the Daily auth gate.
- A malicious absolute/cross-origin or malformed return URL reaches login start: it must fall back to `/user`; test the server validator and browser helper.
- A signed-in player has no submissions for one or both games: stats must still return both active game cards with zero-play values; test the stats endpoint and User rendering.
- A personal stats request includes protected round fields or a stale service-worker response: it must not; test response privacy and cache policy.
- Logout, session expiry, or device revocation while User is mounted: personal state must clear and remain at `/user`; test the auth render path and API error handling.

### Task 1: Auth return contract and personal stats API

**Files:**
- Create: `daily-games-tracker/migrations/0003_login_return_url.sql`
- Create: `daily-games-tracker/functions/api/user/stats.ts`
- Modify: `daily-games-tracker/functions/_lib/device-login.ts`
- Modify: `daily-games-tracker/functions/_lib/leaderboards.ts` only if a focused personal-summary helper is needed
- Test: `daily-games-tracker/tests/integration/device-login.test.ts`
- Test: `daily-games-tracker/tests/integration/user-stats.test.ts`

**Interfaces:**
- Produces `POST /api/auth/device/start` accepting optional `{ return_url?: string }`, with missing/invalid values normalized to `/user`; approval returns an absolute same-origin `return_url` of `/user` or `/daily/YYYY-MM-DD`.
- Produces `GET /api/user/stats` returning `{ status: "ok", player, games: [{ key, display_name, icon, total, games_played, average, rank }], install_url }`, with the active games in canonical order and `install_url` either the privately configured validated hosted Shortcut URL or `null`.
- Existing Login with Device session cookie, expiry, revocation, same-origin checks, and native approval semantics remain unchanged.

- [ ] **Step 1: Write failing integration tests** for stored/default/invalid return paths, approval response, authenticated stats, zero-play games, privacy, 401, and supported/unsupported install URL behavior.
- [ ] **Step 2: Run the focused tests and confirm they fail for the missing migration/API/contract.**
- [ ] **Step 3: Add the D1 return-path column, server-side same-origin/date validation, challenge persistence/approval response, and authenticated stats handler using existing aggregate definitions.**
- [ ] **Step 4: Run the focused integration tests and the existing device/leaderboard integration tests; confirm they pass.**
- [ ] **Step 5: Commit the scoped server changes with message `feat: add phase 10 user stats contract`.**

### Task 2: User page, Daily gate, navigation, and private UI shell

**Files:**
- Create: `daily-games-tracker/src/pages/UserPage.tsx`
- Create: `daily-games-tracker/src/lib/login-return.ts`
- Modify: `daily-games-tracker/src/App.tsx`
- Modify: `daily-games-tracker/src/pages/DeviceLogin.tsx`
- Modify: `daily-games-tracker/src/styles.css`
- Modify: `daily-games-tracker/public/_redirects`
- Modify: `daily-games-tracker/public/_headers`
- Modify: `daily-games-tracker/shared/cache-policy.ts`
- Modify: `daily-games-tracker/service-worker/worker.ts` only if the shared policy change requires a version bump
- Test: `daily-games-tracker/tests/unit/App.test.tsx` or the existing route/UI test file selected by the worker
- Test: `daily-games-tracker/tests/unit/device-login.test.tsx` or the existing UI test file selected by the worker
- Test: `daily-games-tracker/tests/unit/cache-policy.test.ts`

**Interfaces:**
- Consumes Task 1 stats response and the existing `apiRequest`, `ApiRequestError`, and DeviceLogin challenge endpoints.
- `getPage` classifies `/user` and `/login` as the User page; Daily remains `/daily` and `/daily/YYYY-MM-DD`.
- `DeviceLogin` exposes an authenticated render slot with `{ player, busy, logout }` and supports an explicit Daily `redirectWhenSignedOut` mode without redirecting non-401 failures.

- [ ] **Step 1: Write failing UI/cache tests** for route classification, four-item dock order/active state, safe return path generation, 401-only Daily redirect, signed-in Daily without the auth card, User zero/loading/error states, logout clearing, and `/user`/`/login` network-only behavior.
- [ ] **Step 2: Run the focused UI/cache tests and confirm the new behavior fails.**
- [ ] **Step 3: Implement the canonical User page and alias, DeviceLogin render/error states, Daily gate, four-tile navigation, return-path helper, polished responsive scorecard/sign-in styles, and route/cache headers.**
- [ ] **Step 4: Run the focused UI/cache tests, app typecheck, and production build; confirm they pass.**
- [ ] **Step 5: Commit the scoped client changes with message `feat: add phase 10 user page`.**

### Task 3: Integration verification and phase evidence

**Files:**
- Modify: `daily-games-tracker/PHASE_10_USER_PAGE_PLAN.md`
- Modify: `daily-games-tracker/PROJECT_STATUS.md`
- Modify: `daily-games-tracker/EXECUTION_PLAN.md`
- Modify: `Daily_Games_Tracker_Final_Implementation_Plan.md`
- Create: `daily-games-tracker/reports/phase10-user-page-verification.md`

**Interfaces:**
- Consumes the reviewed implementation from Tasks 1–2 and their test evidence.
- Produces exact local verification evidence; it does not promote any open Phase 5A/Phase 9 gate, publish, deploy, or change Shortcut identity/install URL.

- [ ] **Step 1: Run the complete relevant app test suite, all TypeScript projects, production build, scoped lint, and scoped format checks.**
- [ ] **Step 2: Run the database/schema and applicable smoke checks without external writes; record exit codes and counts.**
- [ ] **Step 3: Inspect the final diff and manually map every Phase 10 requirement to code/tests/evidence, including Safari/PWA and deployment limitations.**
- [ ] **Step 4: Update Phase 10/status/plan documents and write the verification report with exact dated evidence and remaining launch gates.**
- [ ] **Step 5: Request the mandated independent Sol medium review of the actual implementation and tests; route any Important/Critical findings to a Luna xhigh repair worker, then obtain targeted Sol re-review until clean.**

## Self-review checklist

- [ ] Every Phase 10 requirement maps to a task and a test/evidence item.
- [ ] Task interfaces agree on the exact `/api/user/stats` response and DeviceLogin render contract.
- [ ] No task owns overlapping product files; shared documentation is serialized to Task 3.
- [ ] The plan preserves unrelated dirty worktree changes and avoids publication/deployment actions.
- [ ] Review focus covers network errors, open redirects, zero-play stats, stale/private caching, and auth loss.
