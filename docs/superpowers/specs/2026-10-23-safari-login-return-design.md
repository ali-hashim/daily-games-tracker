# Safari Login Return Design

## Intent

Make Safari the canonical WHT web interface for the login flow. The two normal website entry points—`Open WHT` after upload and the URL copied with the leaderboard—already open Safari, so a device-login approval should offer a deliberate `Return to WHT` action that opens the server-provided `return_url` in Safari.

## Goals

- Preserve the existing login challenge, approval request, device-code binding, and fail-closed error handling.
- After an approved login, offer `Return to WHT` and `Close`.
- Open only the server-returned `return_url`; do not hard-code a PWA or shortcut-specific destination.
- Keep the upload/capture, clipboard, and completion-menu behavior unchanged.
- Pin the new native control flow with source-contract tests and rebuild/inspect the candidate.

## Non-goals

- Do not redesign authentication or session cookies.
- Do not change the API response contract, upload protocol, schema, or version policy.
- Do not change the public install URL, production deployment, or the original shared pilot.
- Do not claim that Safari and a Home Screen PWA share session state.

## Approaches

1. Continue requiring manual return to the original browser. Rejected because both primary website entry points target Safari and the user explicitly wants a return branch.
2. Automatically open a fixed WHT URL after approval. Rejected because it discards the server-owned return target and could bypass the initiating browser's intended route.
3. Recommended: add a two-item approval-success menu, `Return to WHT` and `Close`, where `Return to WHT` opens the approved response's `return_url` through the existing Safari-opening action. This restores the requested branch while preserving explicit user control and the existing fail-closed stop behavior.

## Constraints and acceptance

The source inspector must require exactly one runtime `return_url` read and one `Return to WHT` branch that uses it, with an explicit stop after opening. It must reject missing or hard-coded return targets, login fall-through into capture/upload/clipboard, and mutations to the accepted upload tail. The implementation must add a regression test that fails against the current manual-return source before the source change and passes after it.
