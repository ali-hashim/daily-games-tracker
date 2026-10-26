# Challenge identity and worldwide submission windows

## Problem

Import eligibility currently treats the server's Pacific calendar day as the
game day. That is incorrect for both daily games: MapTap shares identify a
month/day from the player's local challenge, while Krillion results identify a
number whose schedule is anchored to Eastern Time. The server must use the
evidence in the capture, then accept that challenge during its worldwide date
window.

## Decisions

- A canonical `gameDate` is the challenge's civil date, not the submitter's
  device date or the server's presentation date.
- A challenge date opens at `00:00` in UTC+14 and closes exclusively at
  `00:00` in UTC-12 on the following civil date. This is the complete
  worldwide window (50 hours). Eligibility is `opensAt <= now < closesAt`.
- MapTap resolves the month/day in the capture to the unique candidate year
  whose worldwide window is open. The server instant is authoritative; no
  client clock or submitted date is accepted.
- Krillion puzzle numbers advance one calendar day from the supplied evidence
  anchor: #97 = 2026-10-20, therefore #100 = 2026-10-23. Calendar arithmetic,
  not elapsed 24-hour arithmetic, avoids DST drift. A number outside the
  configured supported range fails closed.
- Existing archive-layout rejection remains in place. The current-page
  completed result is the only accepted Krillion evidence.
- The existing `game_days` schema is sufficient. Canonical dates and external
  puzzle keys continue to be persisted there, and existing parser-version
  metadata is not changed as part of this behavior fix.
- Daily read models retain Pacific as the landing-day label, but use the
  worldwide window state to decide future dates, locked/open details, date
  picker limits, and navigation. Open dates remain spoiler-protected until
  the requesting player submits that game's challenge.

## Data flow

```text
capture evidence
  -> parser resolves canonical date + external identity
  -> shared window helper checks server `now`
  -> import validates identity conflicts and saves game_date
  -> daily/all-time read models use window state, not Pacific-only eligibility
```

## Error and compatibility behavior

Malformed captures retain their current parser errors. A valid but stale,
future, or otherwise unavailable challenge returns `WRONG_GAME_DAY` with
worldwide-window wording. A database row that maps the same game/date or
external key to a different identity is an identity conflict, not a stale
challenge. Duplicate imports continue to return the existing saved result for
that canonical challenge date.

## Verification boundaries

Tests cover exact open/close instants, MapTap month/year rollover and leap-day
resolution, Krillion #92/#97/#98/#100 mapping, Pacific-midnight crossings,
worldwide-close crossings, stale/future captures without pre-existing rows,
database identity conflicts, open-date spoiler protection, and all-time totals
through the latest accepted worldwide date.
