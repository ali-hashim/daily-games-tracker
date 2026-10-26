# Daily Leaderboard Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render daily leaderboard tables with ranked players as rows and rounds/levels as columns.

**Architecture:** Keep the existing daily API response and all-time table unchanged. Update the daily table component to use the API’s player records as body rows, render round numbers as column headers, and retain the existing detail cell renderer and sticky scroll behavior.

**Tech Stack:** React 19, TypeScript, Vitest, CSS, Vite.

**Spec:** `docs/superpowers/specs/2026-10-23-daily-leaderboard-layout-design.md`

## Global Constraints

- No database, API, scoring, or authentication changes.
- No change to historical-date behavior or current-day detail locking.
- Use semantic table markup; do not visually transpose the existing table with CSS.
- Preserve the existing all-time leaderboard layout.

## Review Focus

- Players with `null` scores remain below scored players and display “Not played.”
- Zero scores remain valid scores and are ranked/displayed rather than treated as missing.
- Equal scores keep deterministic rank/name ordering.
- Locked games continue to show the lock panel and never render protected detail cells.
- Long prompts, answers, and player names remain readable within the new orientation.

### Task 1: Transpose and rank the daily leaderboard table

**Files:**

- Modify: `src/pages/LeaderboardPages.tsx` (`DailyGameTable` and daily table helpers)
- Modify: `src/styles.css` (daily table header/player-column sizing and sticky first-column styling)
- Test: `tests/unit/leaderboard-pages.test.ts`

**Interfaces:**

- Consumes: existing `DailyGame`/`DailyPlayer` response models and `dailyCell(game, player, roundNumber)` renderer.
- Produces: semantic daily tables whose first column is the player summary and remaining columns are `R1` through `R<round_count>`.

- [ ] **Step 1: Write the failing UI contract tests**

Add a testable helper for daily player ordering if the existing component structure does not expose one, then assert scored players sort by descending `daily_score`, zero remains scored, null scores sort last, and ties use stable display-name/id ordering. Add a source/layout contract asserting the daily table header is player-first and rounds are column headers.

- [ ] **Step 2: Run the focused tests and verify the expected failure**

Run: `npm test -- tests/unit/leaderboard-pages.test.ts`

Expected: the new ordering/layout assertions fail against the current round-row/player-column implementation.

- [ ] **Step 3: Implement the minimal transposed table**

In `DailyGameTable`, derive the displayed player order from the existing player records, render a sticky first `<th scope="row">` containing rank/badge/name/total, render one `<th scope="col">` per round, and render each player’s round score with the existing `dailyCell` helper. Keep locked games on the existing lock branch. Adjust only daily-specific CSS so the player column is readable and the round headers remain sticky.

- [ ] **Step 4: Run focused tests and the full suite**

Run: `npm test -- tests/unit/leaderboard-pages.test.ts` and `npm test`

Expected: all focused and full tests pass, including existing daily/all-time API and layout coverage.

- [ ] **Step 5: Run typecheck, build, and scoped formatting**

Run: `npm run typecheck`, `npm run build`, and `npx prettier --check src/pages/LeaderboardPages.tsx src/styles.css tests/unit/leaderboard-pages.test.ts`.

Expected: all commands pass with no new diagnostics.
