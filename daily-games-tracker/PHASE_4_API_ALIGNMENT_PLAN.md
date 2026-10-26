# Phase 4 API alignment plan — keep the Shortcut thin

Current planning cross-reference (October 22): original-pilot functional, clean-install and required-update acceptance is complete as recorded in [PHASE_4_STATUS.md](PHASE_4_STATUS.md). Older pending statements below are historical checkpoints. [Phase 5A](PHASE_5A_PLAN.md) rechecks compatibility for a new compiled client, not unfinished Phase 4 backend features; [Phase 5B](PHASE_5B_PLAN.md) owns the locally implemented website/API login and pending native integration. CPU remains nonblocking monitoring.

Prepared October 21, 2026. **Updated user decision:** confirmation-hash exchange is removed in the implementation and native guide. Validate/submit use only shortcut_version and capture. All game-result hashing/content comparison is also removed; a database uniqueness check returns the same already_submitted completion response with a fresh scoreboard for every valid repeat. Update-link validation/fallback is implemented in the reviewed source; clean-template publication/configuration and native required-update proof remain open. Conditional API work below remains a plan; see PHASE_4_STATUS.md for deployment/verification status. Supersedes the earlier handoff's client-side defensive requirements.

## Contract to preserve

New result: Share input → POST validate → server confirmation → native Submit/Cancel → POST submit → copy server scoreboard → Close / Open WHT. Already saved: Share input → POST validate returns already_submitted → copy fresh server scoreboard → Close / Open WHT, without confirmation or a submit request. Submit can also return already_submitted after a competing save or retry and uses the same completion flow. The Shortcut routes by `status`; the server owns game logic, credential/version policy and user-facing recovery text. There is no confirmation token or extra value to forward. The user accepts that submit is not bound to a prior validation response.

Authority: `../Daily_Games_Tracker_Final_Implementation_Plan.md`, sections 5, 8, 9 and Phase 4. Build guide: `WHT_SHORTCUT_CREATION_HANDOFF.md`.

## Audit against current code

| Capability                                  | Current implementation                                                                                       | Decision                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Device/player auth                          | `authenticateDevice` in both import operations                                                               | Already server-side; no client auth preflight                                                 |
| Shortcut version                            | D1 app_meta minimum/latest check before parse                                                                | Already server-side; send Number 1 only                                                       |
| Game detection/parse/date/rounds/score math | `parseCapture` and pure game parsers                                                                         | Already server-side; no client checks                                                         |
| Capture structure, bounds and Unicode       | `assertCapture` before parse, plus bounded body read                                                         | Already server-side; capture script keeps original privacy/collection caps                    |
| Duplicate/date-to-puzzle checks             | Import pipeline plus D1 constraints                                                                          | Already server-side; native already_submitted status routes to completion without game checks |
| Confirmation text                           | API `confirmation_text`                                                                                      | Display verbatim in Choose from Menu                                                          |
| Confirmation binding                        | Removed by user decision; submit independently validates its received capture                                | Native menu resends the saved original capture; no server-side confirmation proof             |
| Atomic writes and all repeat attempts       | One D1 batch and unique player/game-day slot                                                                 | Keep unchanged                                                                                |
| Success/error copy and rank                 | API confirmation_text / error_message / completion_message and scoreboard payload                            | Display verbatim; no phone error-code dispatch                                                |
| Cancel                                      | Native Stop This Shortcut                                                                                    | No endpoint or database draft needed                                                          |
| Required-update URL                         | Server-checked iCloud link or null; preview now references the inspected, installation-tested final template | Server fallback implemented; clean-template/config readiness remains in A                     |
| Native non-2xx JSON handling                | API returns JSON with HTTP 4xx/5xx; phone behavior not yet verified                                          | Conditional compatibility gate; work item B                                                   |
| One retry                                   | API is idempotent; native automatic exception recovery unproved                                              | One re-share; confirm only a new result, otherwise copy the current scoreboard                |
| Login with Device                           | Phase 5B website/API implemented locally; compiled native integration and preview/iPhone proof pending       | Keep the original pilot prefix stopping; add login to the accepted 5A source in 5B          |

**Implemented user-approved contract change:** remove the confirmation fingerprint from responses, requests and submit comparisons. Remove result_hash generation/storage and canonical-result hashing entirely via schema migration 0002. Every valid repeat returns HTTP 200 with status already_submitted, message “You already have a result saved for this game today.”, fresh scoreboard_text, completion_message and wht_url. Use database uniqueness alone; never overwrite the saved result. Credential/session security hashing remains. Client URL parsing, score checks, error-code routing and duplicate summaries remain absent.

## A. Make required-update responses usable by a thin client

### Evidence

The earlier handler returned raw install_url regardless of link readiness. The reviewed source now validates the private hosted Shortcut URL supplied by the selected environment and returns a server-authored SHORTCUT_UPDATE_UNAVAILABLE error when an update is required but the link is unusable. Both endpoints have no-write regression coverage. The current source references the inspected and installation-tested import template in private release evidence. A thin native Open URLs action cannot repair a missing/malformed link or know whether an old template implements the required version.

### Implemented server changes and remaining release work

Items 1, 2 and 5 are implemented and locally verified on both endpoints (226 total tests, 36 import cases). Items 3 and 4 remain coordinated release work.

1. Validate the configured install URL on the server when generating an update response: HTTPS, exact supported iCloud hostname, `/shortcuts/` path and valid intended Shortcut identifier. Do not move this policy into native URL-component actions.
2. Return `status: update_required` only with a usable link. If it is missing/invalid, return the usual `status: error` with server-authored instructions to contact the administrator and Nothing was submitted. No score/activity write occurs.
3. After the clean import-enabled native template is built and accepted, inspect it, test a private installation, then replace the preview install URL. A syntactically valid URL does not prove the template is the correct version.
4. Coordinate any minimum-version increase. Do not raise it while its required replacement template is unavailable. Keep production undeployed.
5. Tests: missing/malformed/non-HTTPS/wrong-host URL; valid required update; invalid link on a supported version must not block normal imports; no writes on rejected/required updates; no credential in returned text/link. Tests use disposable local configuration.

### Acceptance

The thin Shortcut can display `error_message`, open returned `install_url` when status is update_required, then stop. No URL regex, host check or local recovery policy is required.

## B. Verify JSON error/update delivery on the actual iPhone

### Evidence and limit

API errors use 401/422/426/503 as appropriate; already_submitted is a normal HTTP 200 completion response with JSON bodies. The user confirms both native wrong-share parser errors display server directions and stop correctly. This proves those 422 bodies are readable; other status-specific cases, particularly required-update 426, still need native proof. This is an unverified compatibility question, not proof the API is broken.

### Plan

1. On the native validate-only build, test a successful response and a harmless wrong-share/parser error. Verify the actual returned Dictionary and displayed server message. Use synthetic/local environments or coordinated authorized devices for additional auth/update/unavailable cases; do not revoke working devices or change shared version policy casually.
2. If native non-2xx JSON bodies work, retain current HTTP semantics. No API change.
3. If native status handling prevents the agreed server-authored error/update flow, implement an explicit, versioned/opt-in Shortcut response adapter at the server boundary. A request header is preferable to adding game logic or more required body fields. The adapter can return application-level error/update envelopes with a native-readable HTTP response while retaining normal HTTP semantics for ordinary API clients.
4. Keep auth/validation enforcement identical. A transport-compatible HTTP 200 must not mean authorization or successful validation; body `status` remains authoritative, exactly as in the guide. Do not apply the adapter to admin routes or weaken Access/CORS/cookie/origin rules.
5. Cover all import response sources, including body-size/JSON errors rejected before the handler. Review middleware early exits so some errors are not accidentally left in another response shape.
6. Test all statuses, request IDs, no-store/security headers, body caps, no-write failures, unknown response fail-closed behavior and unchanged non-Shortcut responses. Deploy preview only after appropriate local checks and repeat native proof.

### Acceptance

The same simple native branches work: valid → confirmation menu; error → server text/stop; required update → server text/open link/stop; submitted or already_submitted → copy exact scoreboard_text, then completion_message in Close / Open WHT. Already_submitted from validate skips confirmation and submit. Null scoreboard text preserves the clipboard and uses the unavailable completion message. Do not add a browser review step, client parsing or a separate app to compensate.

## C. Keep messages and retry responsibility server-led

The IMPORT_UNAVAILABLE submit message must say the outcome is unconfirmed and one retry will return an already-saved notice if a record exists. Never claim nothing was saved after an ambiguous commit/response loss. No repeat may be reported as a new successful save.

The original requirement allows one network retry. A one-time user re-share is the documented transport fallback. A valid new result requires confirmation; an already_submitted result goes directly to fresh scoreboard copying and the completion menu; automatic retry is not claimed as delivered. There is no need to add error-code routing or retry loops to the Shortcut. If unattended retry is later explicitly required, first prove native transport support or return a server-authored retry flag for reachable JSON failures as a separately scoped contract change. Server code cannot restart a stopped iOS Shortcut or repair offline connectivity.

Optional support improvement: append the request ID to server-authored error text so the Shortcut can display a useful support ID without concatenating fields. Keep structured request_id/error_code for diagnostics. This is not necessary to build the agreed flow.

## D. Preserve existing integrity gates

Any API adjustment must retain independent parse/validation on submit, current Pacific date, device/player revocation, active-game policy, puzzle mapping, uniqueness, complete round sets, atomic rollback and uniform duplicate notices. Do not restore a confirmation hash/token/draft. The server does not prove that the capture matches the earlier menu; this risk is explicitly accepted by the user.

Historical baseline evidence: 206 tests and local Pages/D1 smoke passed before confirmation removal. Updated verification is in PHASE_4_STATUS.md. Proposed changes require their own meaningful tests and typecheck/lint/build checks; this document does not claim they have passed for unimplemented work.

After alignment and native validation/cancel proof, get explicit approval before a real-player score write. Measure actual accepted device-authenticated import CPU; earlier parser-only timing is not sufficient. Preserve the uncommitted Phase 2/3 checkout. No production deployment or Phase 5.

## Execution order

1. Use the rewritten thin guide; no API change needed for the ordinary valid/confirm/cancel/submit path.
2. Test actual native request serialization and error delivery (B).
3. Server fallback/validation (A) is implemented in the reviewed source; configure the correct clean template after native acceptance.
4. Implement B's adapter only if the native evidence requires it.
5. Recheck integrity, native statuses, cancellation, real approved save/retry and CPU before Phase 4 closeout.

## Implemented user-requested completion flow

Wrong-share guidance now explicitly distinguishes Safari browser Share Website from the website buttons: Krillion uses Safari, NOT its SHARE... button; MapTap uses the blue Share your score website button, NOT Safari Share Website. These remain server error_message values, with no native game/error-code branches.

A new successful submit or valid repeat from either endpoint returns scoreboard_text, completion_message and wht_url. A single consistent score-only query produces submitted-player game sections for the selected day, daily rounds/totals, and inline all-time rank/total/movement against the previous day; it omits any game section with no submission. It does not select Krillion prompts/answers or original MapTap emojis. The native Shortcut copies the exact text, then shows completion_message in Choose from Menu with Close / Open WHT. Open WHT opens wht_url; no auth token appears in the URL. The later website leaderboards/login/copy button are not implemented by this feature.

A post-save preparation failure keeps status submitted, returns null scoreboard_text and an honest unavailable completion message. The native branch skips copying, preserves the clipboard, and offers the same menu. A native Copy action must complete before a copied-success menu is shown; permission/failure behavior is still a native gate. Errors, new-result valid validation and Cancel do not copy. Valid repeats from either endpoint return already_submitted with a fresh scoreboard and honest already-saved completion text; a duplicate validation skips the confirmation and submit request. Null scoreboard_text preserves the clipboard and uses the unavailable completion message. This moves the share renderer forward from Phase 7 by user request, without a new HTTP endpoint or client-side scoreboard calculations. It replaces the prior rank read with one snapshot read; actual request CPU still requires measurement.

## Canonical clipboard formatting revision

Use the user-provided layout now recorded in authoritative section 12 and shortcut/CLIPBOARD_FORMAT_EXAMPLE.txt: 📊 WHT Leaderboard header, uppercase abbreviated dates, game-icon/puzzle/date headings, #daily ranks, compact all-time brackets, bare round lines, and one divider between the game sections. The renderer reads the actual puzzle key in its existing consistent snapshot; privacy/ranking/duplicate policies and native Copy to Clipboard actions do not change. The copied text ends after the final MapTap round line; the separate wht_url response field remains available for Open WHT.

## User-accepted Phase 4 pilot exceptions

On October 21, 2026, the user explicitly accepted the shared native pilot's documented tradeoffs: Safari capture may replace the clipboard before later Cancel/error handling; the submit race/retry path has a bounded duplicate policy; and native scoreboard Copy actions have no null/empty guard. These are accepted pilot tradeoffs for the small group, not required fixes or native acceptance blockers. The stricter build guidance remains the deferred target for a future revision. Backend responses, saved-result uniqueness and the score-only scoreboard format are unchanged. Native clipboard preservation on Cancel/error/unavailable-scoreboard and submit-race clipboard copying are not claimed as proved. The configured Shortcut identity and private device evidence remain outside the public repository.

Clean-template work item A.3 is complete: public artifact inspection and user-reported private installation passed, and the final URL is configured/read back in private environment evidence. Native required-update behavior also passed; the temporary preview-only version policy was restored to 1. Phase 4 functional, installation and update checks are complete with the user's accepted Shortcut pilot exceptions. CPU remains open for monitoring by user decision and does not block Phase 5; see PHASE_4_CPU_INVESTIGATION.md. Production remains undeployed.

Native closeout update: clean installation and the real required-update message/link/stop now pass by user report. The coordinated temporary preview requirement was restored and verified at minimum/latest 1; the clean template stays version 1. All agreed functional checks pass with the user-accepted pilot exceptions. CPU performance remains open; see PHASE_4_STATUS.md (../PHASE_4_STATUS.md from shortcut/) and reports/phase4-native-acceptance.json.

Final CPU disposition: an authenticated saved-result sample remained above the plan’s 10 ms target, so Phase 4 performance remains open and new-save CPU is not yet measured. Exact trace values, game attribution, and the supporting private report remain outside the public documentation. Functional/install/update checks pass with accepted pilot exceptions. See PHASE_4_STATUS.md.
