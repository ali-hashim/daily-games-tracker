# Phase 5A source and tooling handoff

Updated 2026-10-25. This is the credential-free public handoff for the
maintained Shortcut source and its pinned build and inspection tooling.

## Maintained scope

- Source: `shortcut/cherri-migration/source/upload-to-wht.cherri`
- Toolchain lock: `shortcut/cherri-migration/toolchain.lock.json`
- Pinned CI workflow: `.github/workflows/cherri-alert-experiment.yml`
- Source and artifact checks: `scripts/phase5a-*.mjs`,
  `scripts/inspect_phase5a_shortcut.py`, and the focused tests under
  `scripts/tests/`

The CI workflow is the authoritative compiler environment. The public tree
contains source, contracts, and synthetic fixtures only. Configured
Shortcuts, device codes, credentials, signing payloads, player data, native
captures, result records, and installation links remain outside this export.

## Dispositions

| Gate | Disposition | Public record |
| --- | --- | --- |
| Accepted source revision | pass | The accepted public source identity is retained by the launch ledger. |
| Compiler lock and build contract | pass | The source, lock, workflow, inspectors, and synthetic tests are checked in. |
| Signed candidate identity | pass | The accepted candidate identity is retained by the launch ledger; signing material is not published here. |
| Native core flows | pass | Bounded user-reported core-flow acceptance is recorded; detailed native evidence remains external. |
| Protected signing workflow | pending | Static guards are retained; activation and dispatch are not claimed. |
| Saved-result integrity | pending | Independent native baseline and result evidence remain open. |
| Rollback reference | pending | No private backup identifier or bytes are published here. |
| Phase 5B source/toolchain handoff | pending | This handoff is prepared; dependent release evidence remains open. |
| Native edge-case matrix | waived | The remaining matrix is an explicit waived limitation. |
| Native race/concurrency exercise | waived | The exercise is an explicit waived limitation. |
| General byte/semantic reproducibility | waived | General reproducibility is an explicit waived limitation. |
| Operational signing activation | pending | The protected workflow remains disabled. |

The pending and waived dispositions preserve the launch ledger's boundary:
static source/tooling checks do not establish native execution, operational
signing, independent rollback, or release readiness. A future reviewed
revision may update these dispositions with new credential-free evidence.

## Handoff boundary

Use the source and checks above for public review and CI inspection. Do not
add configured device exports, private captures, player/result data, signing
material, or install-link changes to this tree. Any release decision remains
separate from this source handoff.
