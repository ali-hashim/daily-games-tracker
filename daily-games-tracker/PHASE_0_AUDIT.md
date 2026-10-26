# Phase 0 audit and public baseline

Phase 0 established the product boundary and the data contracts that later
phases implement. This public record keeps the design decisions and security
invariants; private captures, player results, and operator evidence remain
outside the repository.

## Product boundary

- The tracker accepts a bounded Safari DOM capture for Krillion and bounded
  Share Sheet text for MapTap.
- Server functions identify the game, parse and validate the result, and write
  normalized rounds atomically to D1.
- Registration is invitation-only. Device credentials are random, revocable,
  per-install bearer credentials stored only as hashes.
- Players have no PIN, password, email account, or Apple ID account in the
  product model. Administrator access is a separate protected boundary.
- Raw screenshots and successful raw captures are not persisted after parsing.

## Schema and parser decisions

The schema owns game days, puzzles, players, submissions, rounds, device
credentials, browser sessions, invitations, login challenges, and audit rows.
The player/game/day uniqueness constraint is the duplicate guard. Result
content hashes are not an authorization or duplicate mechanism.

Parsers consume a capture and a clock only. Krillion requires a bounded
completed-result section and seven ordered rounds. MapTap requires five
ordered score and emoji pairs with the configured weighting. An em dash with a
zero score is represented as a missing answer; other answer text is retained
for normalized results. Capture limits, Unicode validation, hidden-content
exclusion, and stable error codes fail closed.

## Public evidence boundary

The candidate repository contains synthetic fixtures and automated tests. Real
device captures, player names, raw game results, request traces, database
exports, and private operational reports are intentionally omitted. Their
existence or disposition is recorded only in the private migration evidence.

The historical audit is a design and contract reference. Use
[PROJECT_STATUS.md](PROJECT_STATUS.md) and the phase ledgers for the current
implementation state.
