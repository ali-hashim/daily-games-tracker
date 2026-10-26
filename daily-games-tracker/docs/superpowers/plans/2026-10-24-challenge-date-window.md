# Challenge identity and worldwide submission window plan

## Goal

Make MapTap and Krillion imports accept only the challenge evidenced by the
capture, during that challenge's worldwide UTC window, while keeping daily
leaderboards and score-only responses consistent with the same policy.

## Implementation tasks

1. Add shared calendar/window helpers and Krillion's number-to-date anchor.
   Keep date arithmetic strict and test open/close boundaries, DST, leap days,
   rollover, numeric bounds, and the 50-hour window.
2. Update both parsers to resolve canonical challenge identity from evidence.
   MapTap chooses the open year for its month/day; Krillion derives the date
   from the completed Dive number. Preserve score, round, archive, and capture
   validation. Add parser regression tests first, observe the expected
   failures, then implement.
3. Update import validation/submission to use the injected server instant,
   reject stale/future identities before persistence, distinguish database
   identity conflicts, and keep retries/atomicity/concurrency behavior.
4. Update daily and all-time read models/routes/UI so accepted dates ahead of
   Pacific are navigable, open dates remain protected, historical dates unlock
   after close, and live totals include the latest worldwide date without
   exposing answers through score-only output.
5. Run focused tests, full tests, typecheck, lint/build, and a preview smoke
   check. Record exact files and unresolved concerns in the SDD ledger.

## Owned implementation surface

The Luna worker owns the shared date helpers, parser/import code, leaderboard
read models/routes, associated tests, and narrowly related UI types/text. It
must preserve unrelated working-tree changes. No schema migration is expected
unless the implementation demonstrates that the existing canonical
`game_date`/`external_puzzle_key` constraints cannot support the policy.

## Required acceptance cases

- MapTap 2026-10-23 is accepted from 2026-10-22T10:00:00Z through
  2026-10-24T11:59:59.999Z and rejected at either exclusive boundary.
- Krillion #97 resolves to 2026-10-20, #98 to 2026-10-21, and #100 to
  2026-10-23 regardless of the server's Pacific date.
- A validate at one instant and submit after the worldwide close does not save.
- A validate at one Pacific day and submit on the next Pacific day still saves
  while the worldwide window is open.
- Existing duplicates, conflicts, race handling, locked answer protection,
  score-only output, and public/private leaderboard rules remain intact.
