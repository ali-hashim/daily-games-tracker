# Daily Leaderboard Layout Design

## Intent

Make the daily leaderboard readable as a ranking: players appear as rows ordered by total score, while rounds/levels appear as columns for quick comparison across players.

## Goals

- Render one player per row and one round/level per score column.
- Sort played players by descending daily score, with stable alphabetical/id tie-breaking matching the existing ranking behavior.
- Keep the total score, rank, badge, prompts, answers, locked states, sticky player column, and horizontal scrolling usable.
- Preserve the existing API contract and all-time leaderboard layout.

## Non-goals

- No database, API, scoring, or authentication changes.
- No change to historical-date behavior or current-day detail locking.
- No CSS-only visual transposition that leaves the semantic table inverted.

## Approach

Transpose the existing daily table in `DailyGameTable`: use player records as the body rows, render each player’s round result under the matching round column, and retain the player/score summary as the sticky first column. Reuse the API’s player ordering when it already reflects ranking, and add a focused UI test for the rendered row/column order and score sorting.

## Acceptance criteria

- Daily tables visibly show ranked players down the left and rounds/levels across the top.
- Higher scores appear above lower scores; ties remain deterministic.
- A full test, typecheck, build, and scoped formatting pass succeeds.
