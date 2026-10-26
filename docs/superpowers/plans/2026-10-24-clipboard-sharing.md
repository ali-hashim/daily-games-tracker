# Phase 7 Clipboard Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated website Copy Leaderboard flow that reuses the canonical server scoreboard renderer and exposes a privacy-safe clipboard snapshot for an eligible player and selected day.

**Architecture:** Keep scoreboard formatting server-owned in `functions/_lib/scoreboard.ts`. Add a read-only authenticated `/api/leaderboards/copy?date=YYYY-MM-DD` endpoint that verifies the player has submitted at least one game on that day, renders live standings at button-press time, and returns the exact text. Extend the daily read model with copy eligibility and add an accessible button that calls the endpoint and uses the existing browser clipboard helper.

**Tech Stack:** Cloudflare Pages Functions, D1, TypeScript, React, Vitest, Miniflare.

**Spec:** `Daily_Games_Tracker_Final_Implementation_Plan.md` sections 12 and 19; Phase 7 in `daily-games-tracker/EXECUTION_PLAN.md`.

## Global Constraints

- Reuse the canonical score-only renderer; do not duplicate clipboard formatting in the endpoint or browser.
- The copy endpoint must be authenticated and eligible only after the signed-in player has submitted at least one game for the selected day.
- The renderer includes only active players with a saved submission for the selected game/day, omits game sections with no submissions, preserves inline all-time rank/total/movement, and uses the exact approved punctuation/separators with no trailing URL section.
- Krillion round output is emoji-only and must not expose prompts, answers, numeric round scores, or site rank badges.
- MapTap round output is numeric-only and must not expose emojis or site rank badges.
- Current standings are read at button press with movement compared to the previous calendar day; zero scores remain distinct from not played.
- Preserve unrelated uncommitted Phase 4–6 work and do not modify the accepted Phase 4 Shortcut pilot.

## Review Focus

- A player with no submission for the selected date cannot copy, while a player with either game submitted can copy the server-generated snapshot; only game sections with saved submissions are emitted.
- Historical dates remain eligible based on actual submission, not the current-day table lock flag.
- The endpoint performs no mutation and returns the canonical renderer output without querying answer/prompt fields.
- Browser copy failure is surfaced honestly and does not claim success; the button remains usable for retry.
- The UI handles date changes and repeated copy requests without displaying stale text or stale success state.

---

### Task 1: Add authenticated copy eligibility and endpoint

**Files:**
- Create: `daily-games-tracker/functions/api/leaderboards/copy.ts`
- Modify: `daily-games-tracker/functions/_lib/leaderboards.ts`
- Modify: `daily-games-tracker/shared/leaderboard.ts`
- Test: `daily-games-tracker/tests/integration/leaderboards.test.ts`
- Test: `daily-games-tracker/tests/integration/scoreboard.test.ts` or a focused copy integration test

**Interfaces:**
- Consumes: `authenticateSession`, `refreshSession`, `parseDailyDate`, `submissionScoreboard`.
- Produces: `GET /api/leaderboards/copy?date=YYYY-MM-DD` returning `{ status: "ok", date, scoreboard_text }` plus the standard request id.

- [x] **Step 1: Write failing integration tests** for unauthenticated access, no-submission rejection, one-game eligibility, historical eligibility, method/date validation, read-only behavior, and answer/prompt-free SQL/response output.
- [x] **Step 2: Run the focused tests and verify they fail for the missing endpoint/contract.**
- [x] **Step 3: Implement the eligibility query/model and authenticated copy endpoint.** Use the existing renderer without adding a second formatter; the separate `wht_url` response field remains only for the Shortcut’s Open WHT action.
- [x] **Step 4: Run focused integration tests, then the relevant existing scoreboard/leaderboard tests.**

### Task 2: Add the daily-page Copy Leaderboard control

**Files:**
- Modify: `daily-games-tracker/src/pages/LeaderboardPages.tsx`
- Modify: `daily-games-tracker/src/lib/api.ts` only if the existing helper needs a narrowly scoped clipboard result/error contract
- Modify: `daily-games-tracker/src/styles.css`
- Test: `daily-games-tracker/tests/unit/leaderboard-pages.test.ts`

**Interfaces:**
- Consumes: `DailyResponse` copy eligibility and `GET /api/leaderboards/copy`.
- Produces: An accessible `Copy Leaderboard` button shown only when eligible, with explicit loading/success/failure status.

- [x] **Step 1: Write failing source-contract and behavioral copy-controller tests** for visibility gating, endpoint/date usage, native clipboard use, honest failure messaging, and stale date transitions.
- [x] **Step 2: Run the focused unit tests and verify the new assertions fail.**
- [x] **Step 3: Implement the button and state reset on date changes.** Keep all text formatting on the server and use the existing `copyText` helper.
- [x] **Step 4: Run focused tests, typecheck, lint, and the full test command with the required runtime allowance.**

### Task 3: Review and preview verification

- [x] Inspect the complete implementation diff against this plan and the authoritative Phase 7 requirements with the assigned read-only reviewer.
- [x] If the reviewer reports Critical/Important issues, route repairs to a Luna/XHigh implementation worker and obtain targeted reviewer verification, stopping after the two-cycle limit.
- [x] Run the relevant automated tests, build, and local preview smoke/inspection checks; record any environment-only limitations separately.
- [x] Update `daily-games-tracker/EXECUTION_PLAN.md` with Phase 7 evidence only after the implementation and verification are actually complete.

### Phase 7 evidence (2026-10-24)

- Authenticated `GET /api/leaderboards/copy?date=YYYY-MM-DD` validates one date, refreshes the session, requires a selected-day submission for either active game, performs no submission/round writes, and delegates exact copy text to `submissionScoreboard`.
- Daily responses expose `copy_eligible`; the dated daily page renders an accessible `Copy Leaderboard` control only when eligible, uses `copyText`, resets date-keyed copy state, suppresses stale async results, and reports clipboard/API failure without claiming success.
- TDD evidence: the new integration import initially failed because the endpoint was absent; the initial UI assertions failed 4/42; the repair behavioral controller tests then failed 4/46 because the helper was absent; focused unit and integration tests passed after implementation.
- Verification: `npm run typecheck` passed; focused Phase 7/leaderboard/scoreboard tests passed 67/67; full `npm test` passed 19 files and 330 tests; `npm run build` passed; scoped ESLint passed with 0 errors and 6 Fast Refresh warnings for exported page helpers.
- Review: the initial independent review found two Important async-state/test-quality issues and two Minor test-hardening issues; one Luna/XHigh repair cycle addressed them, and targeted Sol/Medium verification found no remaining Critical or Important issues. One additional idle-state assertion remains a non-blocking test-gap note.
- Environment/baseline limitation: repository-wide `npm run lint` remains exit 1 only because unrelated Phase 5A files contain unused imports (`scripts/phase5a-compile-runtime-fixtures.mjs` and `shortcut/cherri-migration/build/receiver-fixture.mjs`). Miniflare integration tests require allowed loopback access in this shared environment.
