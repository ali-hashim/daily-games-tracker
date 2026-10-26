# Krillion Compact Daily Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unlocked Krillion daily leaderboard usable on a narrow phone by replacing tall prompt headers with in-place info popovers and reducing each result cell to MapTap-style score plus emoji with an in-place answer disclosure.

**Architecture:** Keep the existing semantic player-row/round-column table and daily API. Add a small local `InfoPopover` interaction in `LeaderboardPages.tsx`, owned by `DailyGameTable` so only one question/scoring popover is open at a time. Keep all-time rendering, data models, locks, ranking, and routes unchanged; use daily-specific CSS to compact headers, player summaries, and Krillion cells.

**Tech Stack:** React 19, TypeScript, Vitest, CSS, Vite, Cloudflare Pages preview.

**Spec:** `docs/superpowers/specs/2026-10-23-krillion-compact-daily-table-design.md`

## Global Constraints

- No database, API, authentication, scoring, or route changes.
- No separate question or scoring pages.
- No change to MapTap's data or visual treatment beyond selectors needed to share the compact daily table primitives safely.
- No removal of score data from the API; numeric scores remain available for totals, ranking, and accessibility text.
- Preserve existing all-time leaderboard layout and current-day detail locking.

## Review Focus

- Question and scoring controls must be buttons/popovers, never navigation links; test their button semantics and accessible labels.
- Only one help popover may be open at a time; test the owner state and replacement behavior from the rendered source contract.
- Krillion cells must show the numeric round score and mapped emoji like MapTap, while the complete answer is available from the cell's in-place popover.
- Answer, question, and scoring popovers must have explicit labels (`<player>'s R<round> Answer:`, `R<round> Question:`, and `Scoring:`).
- Locked Krillion games must still render the lock panel without any question, scoring, or protected cell details.

### Task 1: Compact Krillion daily table interactions and cells

**Files:**

- Modify: `src/pages/LeaderboardPages.tsx` (`dailyCell`, `DailyGameTable`, and a local popover/helper)
- Modify: `src/styles.css` (daily compact popovers, round headers, player column, and Krillion cells)
- Test: `tests/unit/leaderboard-pages.test.ts`

**Interfaces:**

- Consumes: existing `DailyGame`, `DailyPlayer`, `DailyRound`, `KRILLION_SCORE_EMOJI`, and `dailyCell` inputs.
- Produces: a local `InfoPopover` interaction with button semantics, a deterministic scoring-key helper if needed by the component, compact Krillion cells, and unchanged daily/all-time response usage.

- [ ] **Step 1: Write the failing UI and helper contracts**

  Add focused tests for the exact ordered Krillion scoring key (`⬛ 0`, `🫧 10`, `🤡 15`, `🐟 30`, `🦑 60`, `🏮 85`, `🌟 100`), round/scoring/result controls using `type="button"` and accessible popover attributes, cells showing the round score plus mapped emoji, result-answer popover identity and labels, and the card-level popover remaining outside the scroll region.

- [ ] **Step 2: Run the focused test and verify the expected failure**

  Run: `npm test -- tests/unit/leaderboard-pages.test.ts`

  Expected: the new result-button, answer-label, and score-plus-emoji assertions fail against the current visible-answer implementation.

- [ ] **Step 3: Implement the minimal compact interaction**

  In `LeaderboardPages.tsx`, add the local result-button interaction to `DailyGameTable`; render compact `R1`–`R<round_count>` buttons whose card-level popovers are labeled with the selected round and full prompt; add a `Scoring` button/popover in the Krillion card heading; and ensure toggling a new control replaces the currently open popover. Render Krillion cells as score number plus mapped emoji, with the full cell as a keyboard-usable button whose popover is labeled with the actual player name and round and contains the full answer. Keep `aria-expanded`, `aria-controls`, Escape handling, and no URL navigation.

- [ ] **Step 4: Implement the daily-only compact styling**

  In `styles.css`, keep the fixed-fit daily table and sticky behavior, reduce player-column/header whitespace, style the info and result controls as compact non-navigating buttons, constrain popovers to the card, and preserve MapTap-like score/emoji cell sizing. Do not modify `.all-time-table` rules.

- [ ] **Step 5: Run focused tests and the full verification set**

  Run: `npm test -- tests/unit/leaderboard-pages.test.ts`, `npm test`, `npm run typecheck`, `npm run build`, and `npx prettier --check src/pages/LeaderboardPages.tsx src/styles.css tests/unit/leaderboard-pages.test.ts`.

  Expected: focused and full Vitest suites pass, typechecks and production build succeed, and Prettier reports all three files formatted.

- [ ] **Step 6: Deploy only after review approval**

  The orchestrator will run `npm run deploy:preview` after the Luna implementation, Sol review/repair cycle, and final verification are clean. Verify the returned Cloudflare preview alias and leave the daily preview route open; visual table verification still requires Device Login.
