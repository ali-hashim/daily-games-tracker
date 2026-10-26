# WHT — current project status

Updated October 25, 2026 (America/Los_Angeles). This is the progress index. The [final specification](../Daily_Games_Tracker_Final_Implementation_Plan.md) owns requirements; [execution plan](EXECUTION_PLAN.md) owns phase sequence; [Phase 9 ledger](PHASE_9_LAUNCH_GATES.md) owns detailed launch evidence.

## Current baseline

Working [preview](https://preview.example.invalid). Latest recorded reviewed deployment: [3e7e7979](https://preview.example.invalid), October 25. The prior Phase 9 baseline was [944ff1a6](https://preview.example.invalid). Production is undeployed. The reviewed application and preview source are preserved in this GitHub-backed candidate. Task 1 migration is prepared but prepublication: after the authorized cutover, this checkout will be the sole maintained source for the application, Shortcut, tests, migrations, tooling, and maintained documentation. The private WHT worktree and its commit identity remain historical migration evidence only; no push or cutover is claimed here. Public sanitized Shortcut-source publication is separate from application deployment.

| Phase | Current state                                                                                                           | Open work                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0–3   | Foundation, onboarding/device authorization, capture and parsers completed                                              | Preserve contracts/evidence                                                                    |
| 4     | Imports/native pilot functionally accepted with explicit pilot exceptions                                               | Repeat CPU recorded at 13/14 ms; new-save unmeasured; nonblocking monitoring by user decision  |
| 5A    | Upload client compiled, inspected, signed; core device flows accepted by user report                                    | Operational signing, independent rollback, bounded integrity and formal handoff                |
| 5B    | Sessions/Login with Device closed under bounded acceptance October 23; later Safari return-menu correction built/signed | Exact newer native acceptance not established; reconcile release identity; retain waived cases |
| 6     | Daily/All-Time implemented and preview-deployed                                                                         | Preserve privacy/ranking/date navigation                                                       |
| 7     | Selected-date clipboard sharing implemented and verified                                                                | Full launch native privacy matrix remains pending                                              |
| 8     | Audited admin dashboard/corrections/deletion/backfill implemented, reviewed and preview-deployed                        | Operational/account recovery remains open                                                      |
| 9     | Hardening/local recovery tooling reviewed clean and preview-deployed                                                    | Full launch readiness remains open                                                             |
| 10    | **User page/tab implemented, independently reviewed, and preview-deployed October 25**                                | [Requirements, acceptance, and deployment evidence](PHASE_10_USER_PAGE_PLAN.md)                |

## Recorded verification

The Phase 9 launch ledger records the reviewed application and script checks, TypeScript projects, build, database, and disposable Pages/D1 smoke passing. Phase 10 verification now records 420 application tests across 26 files, full typecheck, build, scoped ESLint, current schema/migration checks, disposable Pages/D1 smoke passing with schema 3, and read-only/browser checks against the deployed preview alias, including the User-route repair; exact evidence is [reports/phase10-user-page-verification.md](reports/phase10-user-page-verification.md). Scoped ESLint/Prettier passed; global lint/format remain non-green on unrelated existing files. Physical device/native evidence remains separate from this verification.

## Shortcut identities and limitations

- Older **Phase 5A baseline:** 31,044 bytes, SHA-256 19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd. [Handoff](../shortcut/PHASE_5A_HANDOFF.md) and Phase 9 JSON retain this identity and its bounded device-evidence disposition.
- **Later Safari login-return build:** Phase 5B records a pinned CI build and one approved one-time signing result. The private evidence archive retains the reviewed package's size and SHA-256. This proves file identity, not Apple cryptographic validation, installation or native acceptance of that exact file.
- Reconcile source/CI/package/signed bytes/native proof before choosing the distributed release. Earlier artifacts remain dated evidence.
- Standing authorization covers exact reviewed credential-free one-time HubSign sends. Protected automated signing remains activation-disabled/undispatched; one-time signing does not prove operational CI signing. Compile new/modified Shortcuts only through the pinned GitHub Action, never locally.
- Native edge-case matrix, native race/concurrency and general byte/semantic reproducibility remain **waived**, not passed. Private rollback is saved by user report; identifier/hash and independent byte verification remain absent. Bounded saved-result consistency does not prove a pretest baseline, phone request counts or historical timestamp preservation.

## Open work

Use [launch dispositions](PHASE_9_LAUNCH_GATES.md) and [JSON evidence](reports/phase9-launch-gates.json):

- Phase 5A formal signing/rollback/integrity/handoff closure and exact release-artifact reconciliation.
- Current/oldest-available iOS, Safari and separate PWA contexts, interruption/revocation/update coverage; two-person then seven-player pilots.
- External D1 Time Travel/restore, production restore and operational administrator/account recovery documentation. Local export/restore/migration/application-correction/forced rollback rehearsal is not production evidence.
- Production secrets/configuration/Access/bindings/migrations/seed verification, invitations and distribution/install-link/version decisions. Provisioned production D1 IDs are not deployed production.
- Monitoring/account-specific usage margin and final game-terms decisions. October 25 source reviews are dated; recheck before rollout, including official Krillion terms host.
- Refresh affected login/privacy/device launch evidence after a separately authorized preview/device pass. Expanded V1 remains subject to the existing Phase 5A/Phase 9 launch gates; this local Phase 10 implementation does not close them.
