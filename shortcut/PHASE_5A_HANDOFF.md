# Phase 5A accepted-baseline handoff

Updated October 23, 2026 (`America/Los_Angeles`). This handoff records the accepted Phase 5A scope after the user's explicit waiver of the remaining native edge-case matrix, native race/concurrency exercise, and general byte/semantic reproducibility requirement. Those items remain unproved limitations; they are not represented as passing tests.

## Accepted baseline

- Public repository: `ali-hashim/daily-games-tracker`
- Public revision: [`6e77d7a915147387fe37d641cf45537f3aceb49d`](https://github.com/ali-hashim/daily-games-tracker/commit/6e77d7a915147387fe37d641cf45537f3aceb49d)
- CI evidence: [unsigned workflow run 22](https://github.com/ali-hashim/daily-games-tracker/actions/runs/40005210168), completed successfully
- Maintained source: `shortcut/cherri-migration/source/upload-to-wht.cherri`
- Compiler: Cherri v2.3.0 at `d2072c62ea708e7727099fab94fa28b0bcec747b`
- Go toolchain: `1.24.0`
- Embedded capture: `capture-safari.js`, SHA-256 `fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb`
- Signed candidate: 31,044 bytes, SHA-256 `19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd`
- Candidate name: **Upload to WHT**

The signed candidate was installed and configured by the user on an iPhone 15 Pro running iOS 26.6.1. Reported passes cover setup, already-saved Text/Safari completion, scoreboard copy and returned-link behavior, unsupported input with clipboard preservation, Cancel with clipboard preservation, new-save confirmation/success, website score/answer readback, and already-saved reshare without a second confirmation.

## Integrity evidence

The private read-only preview check matched the user-provided result: one submission, five rounds numbered 1–5, and a read-only SELECT reporting `changes=0`, `changed_db=false`, and `rows_written=0`. Focused local import integration coverage also passed 41 tests for validation/cancellation, normalized saves, repeat behavior, saved-row preservation, scoreboard handling, and rollback. Player names, answers, captures, and scores remain in private evidence outside the public export.

This is bounded evidence. It does not reconstruct a pretest database baseline, prove the phone's exact request count, or prove historical timestamp preservation after the user run.

## Scope status

| Task | Status |
| --- | --- |
| Signed candidate installation and core device flows | Complete by user report |
| Remaining native edge-case matrix | Explicitly waived by user |
| Saved-result integrity | Bounded evidence complete; historical baseline limits recorded above |
| Native race/concurrency exercise | Explicitly waived by user |
| General byte/semantic reproducibility | Explicitly waived by user |
| Protected signing workflow | Static preflight complete; activation remains disabled |
| Phase 5B source/toolchain handoff | Prepared by this document |

## Signing and handoff boundary

The disabled signing workflow's static verifier passed, and the one-off HubSign candidate hash was reverified. The workflow remains protected by its permanent `false && inputs.confirm_external_signing` guard and all-zero reviewed-commit sentinel; no automated signing activation is claimed. The source, lock, build instructions, native reports, and candidate hash are retained for Phase 5B integration. The unchanged private manual-pilot backup is recorded as saved by user report; its identifier and hash were not recorded, so it remains a user-held rollback reference rather than an independently verified artifact.

Creating an installation link, sharing it publicly, preview deployment, and production rollout are separate release decisions.

