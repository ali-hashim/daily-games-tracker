# Krillion Compact Daily Table Design

## Intent

Make the unlocked Krillion daily leaderboard readable on a narrow phone while preserving the player-row/round-column comparison that the current daily layout provides.

## Goals

- Keep players as ranked rows and rounds as columns.
- Show compact `R1`–`R7` round headers instead of wrapping full prompts in the table.
- Reveal each round's full question in a small in-place information popover; it must not navigate away.
- Show the same compact score-number-plus-emoji treatment as MapTap in each Krillion result cell.
- Reveal the full Krillion answer from the result cell through an in-place popover; do not navigate away.
- Reveal the Krillion emoji-to-score key from a `Scoring` control in the card heading using the same in-place popover behavior.
- Keep player names, ranks, and daily totals in the first column with reduced unnecessary whitespace.
- Keep the daily table within the viewport with readable, non-vertical answer text; preserve full answers for assistive technology and direct inspection.
- Preserve the existing API, score calculations, daily locking, historical behavior, and all-time layout.

## Non-goals

- No database, API, authentication, scoring, or route changes.
- No separate question or scoring pages.
- No change to MapTap's data or visual treatment beyond selectors needed to share the compact daily table primitives safely.
- No removal of score data from the API; numeric scores remain available for totals, ranking, and accessibility text.

## Approaches considered

1. Compact matrix with in-place question and scoring popovers — selected because it removes the content causing the unusable wrapping while retaining at-a-glance comparison.
2. Compact matrix with expandable player detail rows — more room for details, but makes comparison less immediate and adds row interaction complexity.
3. Summary matrix plus a selected-player detail panel — most readable for long answers, but hides cross-player detail behind another selection step.

## Selected behavior

- Round identifiers are accessible buttons styled as compact links. Tapping or keyboard activation toggles a nearby `role="tooltip"`/popover containing the full prompt. The control does not change the URL.
- `Scoring` is an accessible button in the Krillion card heading. Tapping or keyboard activation toggles a nearby popover containing: `⬛ 0`, `🫧 10`, `🤡 15`, `🐟 30`, `🦑 60`, `🏮 85`, and `🌟 100`.
- Only one help popover is open at a time. Escape and selecting another help control close or replace the current one; focus remains usable on mobile and keyboard navigation.
- A Krillion cell visibly contains the numeric round score and score emoji, matching MapTap. The entire result cell is an accessible button that opens one card-level answer popover without changing the URL.
- Answer popovers use the row's actual player name and selected round, for example `Player's R5 Answer:`; round-question popovers are labeled `R1 Question:` (using the selected round number), and the scoring popover is labeled `Scoring:`.
- The daily table retains its sticky first player column and header, but the compact round headers eliminate the tall prompt block. Existing all-time tables are untouched.

## Acceptance criteria

- On a narrow phone viewport, an unlocked seven-round Krillion table has compact headers and does not require horizontal scrolling.
- Every round prompt remains available through its in-place control, and the scoring key is available from the Krillion card heading without navigation.
- Krillion cells show score number plus emoji, and tapping a cell reveals its complete answer in place; totals and ranking remain unchanged.
- Locked games still render only the lock panel and no protected details.
- Focused UI tests cover the popover controls, compact cell content, accessible full-answer text, and preserved table semantics.
- Full tests, typecheck, build, and scoped formatting pass before preview deployment.
