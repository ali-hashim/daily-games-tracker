# Phase 3 capture and parser proof

**Status:** The parser and capture contract is implemented and locally
verified. Production remains undeployed. Detailed native captures, result
contents, and platform traces are private evidence and are not reproduced in
this public tree.

## Implemented behavior

- `shortcut/capture-safari.js` returns a bounded generic visible-DOM envelope
  and excludes scripts, styles, SVG path data, hidden content, storage,
  cookies, and form secrets.
- `shared/capture.ts` validates the envelope, control characters, Unicode,
  node counts, text bounds, and serialized byte limits.
- Krillion parsing is limited to the completed-results region and seven ordered
  rounds. MapTap parsing preserves original emoji and validates five weighted
  scores.
- Parser modules do not import authentication, D1, or network bindings and do
  not log or persist captures.
- Wrong game, wrong day, unfinished, malformed, oversized, missing-round,
  extra-round, ambiguous, and score-mismatch cases use stable errors.

## Evidence boundary

Synthetic fixtures and regression tests are maintained in the repository.
User-supplied device captures and their normalized results were used only for
private verification; they are excluded from the public candidate. Local
benchmarks guide implementation but do not establish production CPU
headroom. Phase 4 owns the full authenticated import path and its separate
performance disposition.
