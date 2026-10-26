# Daily scoreboard score-only gating

## Goal

Let authenticated players see the daily leaderboard's shareable scoreboard
while keeping questions and answers protected until they submit that game's
result for the selected challenge date.

## Recommended product behavior

- Show player rows, ranks, totals, scores, and emojis to authenticated players
  even when they have not submitted the selected game.
- Gate question and answer popovers per player/game/date submission status.
- Do not send protected prompts or answers in a score-only API response. UI-only
  hiding is insufficient because browser users can inspect network responses and
  DOM state.
- Preserve the current behavior for expired historical dates: once the
  worldwide submission window closes, details become available to everyone.
  This avoids permanently hiding details from players who missed an old date.
- Treat the static Krillion scoring legend as non-secret. It may remain public,
  although the Scoring control can remain submission-gated for interaction
  consistency.
- Apply the same privacy rule to MapTap's inline question text; MapTap does not
  currently use the same question-popover structure as Krillion.

## API and privacy contract

The authenticated daily endpoint remains the same. A locked game response
still includes score-only player and round data, but excludes `prompt` and
`answer` properties and does not select protected detail columns from D1.
After the player submits that game/date, the endpoint returns the existing full
detail model and the current popovers work unchanged.

The server remains the source of truth for unlock status. No client-provided
unlock flag, timestamp, or submission claim is accepted. Existing `no-store`
API caching and network-only service-worker behavior remain required.

## Scope and complexity

This is a medium change, estimated at roughly 1–2 engineering days including
implementation, tests, review, and preview deployment. No schema migration,
backfill, credential change, or Shortcut signing change is expected.

Primary risk is accidental answer leakage through a locked API response or
client-side state. Secondary risk is inconsistent behavior between Krillion and
MapTap.
