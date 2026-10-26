# Phase 4 API and native status

**Status:** The original pilot's functional, installation, and required-update
checks are accepted under the documented pilot exceptions. Full Phase 4
performance and broader launch evidence remain open. Production is undeployed.

## Maintained contract

The universal Shortcut sends `shortcut_version` and the original capture to
`/api/import/validate`, displays the server-authored confirmation, and sends
the same capture to `/api/import/submit` after confirmation. A valid duplicate
returns `already_submitted` with the current score-only scoreboard and the
completion menu without changing the stored result. The server owns game
detection, validation, scoring, uniqueness, and atomic writes.

Required-update responses are server-validated. Invalid or unavailable update
destinations fail closed without a score or activity write. The client does
not contain game logic, score checks, result hashes, or credential values.

## Open evidence

- Full authenticated import CPU remains above the intended Free target in the
  latest small sample; new-save CPU is unmeasured.
- The current compiled Shortcut requires its own native acceptance and
  accepted-baseline reconciliation. Signing workflow activation and public
  install-link decisions remain separate release tasks.
- Native edge-case, race/concurrency, and general reproducibility limitations
  retain their documented waived or pending dispositions.

The public repository contains credential-free source, synthetic tests, and
placeholder configuration only. Real device codes, configured Shortcuts,
player captures/results, request traces, and install links remain private.
