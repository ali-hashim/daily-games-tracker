# Safari login-return correction — implementation report

Date: 2026-10-24 \
Base inspected: `5bc9f0345a6ba596a8edd213925c7a1cdab20844` \
Scope: Phase 5B Safari login-return behavior only; no deployment or publication.

## Result

After an approved Shortcut login, the native action now reads the server-provided runtime `return_url` and presents an explicit success menu:

- `Return to WHT` opens that runtime URL through the existing Safari-opening action and then stops.
- `Close` stops without opening a URL.

Challenge extraction, the exact approval request and device-code binding, error/unknown/cancel handling, upload/capture/clipboard flow, accepted completion menu, App Store icon workaround, and schema/version/auth boundaries remain unchanged.

## Files changed

- `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri`
- `daily-games-tracker/scripts/inspect_phase5b_login.py`
- `daily-games-tracker/scripts/tests/test_phase5b_login.py`
- `daily-games-tracker/scripts/tests/test_phase5a_upload.py`
- `daily-games-tracker/PHASE_5B_PLAN.md`
- `daily-games-tracker/PHASE_5_STATUS.md`
- `daily-games-tracker/shortcut/PHASE_5_LOGIN.md`

The Phase 5A test expectation was updated deliberately from `networkActions == 2` to `3`: the reviewed native contract contains the device-approval request plus the existing validate and submit requests. No upload-tail behavior was changed.

The required ignored Superpowers progress ledger was also updated under `.superpowers/sdd/2026-10-23-safari-login-return/`.

## TDD evidence

The focused regression test was added before production source changes and was run against the manual-return source. Expected red result:

```text
FAIL: test_source_contract_includes_runtime_return_menu
AssertionError: 0 != 1
```

The failure was the missing `getValue(@loginResponse, "return_url")` assertion in the current manual-return source. After the minimal source and inspector changes, the focused suite passed:

```text
python -m unittest daily-games-tracker/scripts/tests/test_phase5b_login.py
Ran 6 tests ... OK
```

## Verification

- Phase 5B focused regression: 6/6 passed.
- Phase 5B inspector self-test: passed; 15 synthetic regressions rejected and 6 prefix fixtures accepted.
- Python syntax compilation for the changed inspector and focused tests: passed.
- Phase 5A upload tests: 9/9 passed.
- Full Python script test suite: 88/88 passed.
- Native Node contract/verifier tests: 29/29 passed.
- Full Vitest suite: 19 files, 307/307 tests passed, 0 skipped.
- TypeScript checks for app, functions, service worker, and tests: all passed.
- Vite production build: passed; 37 modules transformed.
- Cherri prepare workflow: passed; preparation only, not compilation.
- Toolchain guard: passed against `.github/workflows/cherri-alert-experiment.yml` and the pinned toolchain lock.
- Signing workflow guard: passed; disabled signing preparation performed no execution.

The first full Python/Vitest attempts encountered sandbox restrictions on temporary-directory handling and local receiver sockets. The same relevant suites were rerun with the repository-local temporary directory and required elevated local-test permission; the final results above are fresh passing results.

## Artifacts and hashes

The checked source and static artifacts are:

| Artifact | SHA-256 |
| --- | --- |
| `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri` | `b5ebd84d47c52c4ba95e90e6b55a5f8ca741577526059a213d28539e75e8f435` |
| `daily-games-tracker/scripts/inspect_phase5b_login.py` | `132c01a578de946971c2ffd336b3b2a44de7500262159122d83229396f307bb2` |
| `daily-games-tracker/scripts/tests/test_phase5b_login.py` | `040e4f6c4fe0b8cf861d92993a2992edb42c58b1b7a0146a537d8da979c8d8b1` |
| `daily-games-tracker/scripts/tests/test_phase5a_upload.py` | `cdee806b8718b8b29228de148f4ec527e76e9af1a6f89638727d995c4682e929` |
| prepared `daily-games-tracker/shortcut/cherri-migration/out/manifest.json` | `612852311d77ac66a4247a793ad4d5e0171bf4c73a10dd73fe091de3a00afa92` |
| prepared capture evidence | `fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb` |

## Base/diff and concerns

All seven scoped implementation/documentation/test paths were absent from the inspected base commit and are currently untracked files in the intentionally dirty shared worktree. A scoped status check confirmed only those expected target paths; unrelated user changes were preserved. No commit was created, because staging or committing the shared dirty worktree was outside the request.

No pinned Cherri compiler was available in this workspace, so no newly compiled unsigned candidate was produced. Consequently, no new credential-free package was sent to HubSign, and no native execution, signing, deployment, publishing, push, install-URL change, or production change was performed. The existing signing workflow is disabled and its guard passed.

The remaining concern is therefore operational rather than a source-contract failure: compiled-client and signing evidence still need to be produced by the existing pinned workflow when that compiler/workflow environment is available.

Self-review against the supplied design and plan found no critical or important issue in the scoped implementation.

## Fix round 1/5 — native contract repair

Reviewer finding addressed: the build-facing native contract and
`phase5a_inspect_upload.py` now require the approved-login success menu, one
runtime `return_url` dictionary read bound to `loginReturnURL`, a variable
input to the existing Safari `openurl` action, and explicit Stop actions for
both **Close** and **Return to WHT**. The contract fixture is now 207 actions
with four menus:

```text
Cancel / Approve Login
Close / Return to WHT
Cancel / Submit Results
Close / Open WHT
```

The three-network-action contract remains intentional: one device approval
request, one import validation request, and one import submission request.
The accepted upload tail and all existing login challenge, device binding,
error, unknown, and cancel behavior remain covered.

The Phase 5A tests now connect the maintained source to the generated native
contract and directly exercise the native inspector with mutations for a
missing `return_url` read, hard-coded return target, missing Return stop, and
missing Close stop. Documentation now labels the earlier 197-action signed
artifact historical and identifies the current 207-action contract as
uncompiled static evidence.

### Fix-round red evidence

Before the contract/inspector repair, after adding the native regression:

```text
python -m unittest daily-games-tracker/scripts/tests/test_phase5a_upload.py
Ran 11 tests ... FAILED (failures=4)
```

The failures included zero native `return_url` reads, no Return menu branch,
and mutation cases that could not exercise the missing native behavior.

### Fix-round green evidence

The following commands passed after the repair:

```text
python -m unittest daily-games-tracker/scripts/tests/test_phase5a_upload.py
Ran 11 tests ... OK

python -m unittest daily-games-tracker/scripts/tests/test_phase5b_login.py
Ran 6 tests ... OK

python daily-games-tracker/scripts/inspect_phase5b_login.py --self-test
static source contract passed; 15 synthetic regressions rejected; 6 prefix fixtures accepted

python -m py_compile daily-games-tracker/scripts/phase5a_inspect_upload.py daily-games-tracker/scripts/inspect_phase5b_login.py daily-games-tracker/scripts/tests/test_phase5a_upload.py daily-games-tracker/scripts/tests/test_phase5b_login.py
exit 0

node --test daily-games-tracker/scripts/tests/phase5a-signing-workflow.test.mjs daily-games-tracker/scripts/tests/phase5a-verifier.test.mjs
29 passed, 0 failed, 0 skipped

node daily-games-tracker/shortcut/cherri-migration/build/build.mjs --prepare
prepared; not compiled; 7 experiments; 13 runtime fixtures; capture SHA-256 fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb

node daily-games-tracker/scripts/phase5a-verify-toolchain.mjs --lock daily-games-tracker/shortcut/cherri-migration/toolchain.lock.json --workflow .github/workflows/cherri-alert-experiment.yml
workflow and lock agree; unsigned-only guard passed

node daily-games-tracker/scripts/phase5a-verify-signing-workflow.mjs
Disabled full-client signing preparation guards passed; no execution performed.
```

The requested full Python discovery command was started with the required
local temporary directory/socket permission and then stopped before completion
when the user requested a status report rather than waiting indefinitely. No
full-suite result is claimed for this round.

### Fix-round artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `daily-games-tracker/shortcut/cherri-migration/build/upload-native-contract.json` | `991dd8ce668ba581fd609dfa33adc7b69d6e751b9f06a44349a47509bf9d86d6` |
| `daily-games-tracker/scripts/phase5a_inspect_upload.py` | `367270a1b962a867ec97f824e34e663a19861d6efc418f5691f37ad1f9321d67` |
| `daily-games-tracker/scripts/tests/test_phase5a_upload.py` | `19e8d36a8cc47528a943428858e40ac7e75ebb99c5781ce85f2bb41987c472d3` |
| `daily-games-tracker/PHASE_5_STATUS.md` | `9536c892acdcf5406a0e5cbdd456a642bfdd6d53ac41a3e01e7ba00bfadfdcf4` |
| `daily-games-tracker/shortcut/PHASE_5_LOGIN.md` | `b4bb4970db4584f76276a76b906cd9cb681a81aae3b9b2b1b41c516fc1efd69c` |

No commit, signing transfer, native execution, deployment, publication, or
production change was made. The pinned compiler remains unavailable, so the
current contract is static generated evidence pending the existing compile
workflow; signing remains unperformed.
