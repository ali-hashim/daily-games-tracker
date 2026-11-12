# Phase 5A native acceptance record

Updated 2026-10-25. This public record preserves the current acceptance
dispositions without publishing private device evidence, user data, captures,
configured Shortcuts, credentials, or installation links.

> **Superseded November 12, 2026:** Rows marked pending for the protected signing workflow or operational signing activation are historical. The workflow (`.github/workflows/shortcut-sign-disabled.yml`, legacy filename) is live, and protected CI signing of the version-1 candidate from source `29c4acea` is recorded complete in [project status](../PROJECT_STATUS.md).

| Acceptance item | Disposition | Meaning of the public record |
| --- | --- | --- |
| Maintained source and pinned tooling | pass | Public source, lock, CI contract, inspectors, and synthetic fixtures are available. |
| Native core flows | pass | Bounded user-reported core-flow acceptance is recorded; detailed native evidence is not included in this export. |
| Saved-result integrity | pending | Independent pretest/result evidence is not included in this export. |
| Protected signing workflow | pending | Static guard checks are maintained; signing activation is not claimed. |
| Independent rollback reference | pending | No private backup identifier, hash, or bytes are published here. |
| Phase 5B source/toolchain handoff | pending | Source handoff is prepared while dependent release evidence remains open. |
| Native edge-case matrix | waived | Explicitly waived for this Phase 5A record. |
| Native race/concurrency exercise | waived | Explicitly waived for this Phase 5A record. |
| General byte/semantic reproducibility | waived | Explicitly waived; bounded checks do not become a general reproducibility claim. |
| Operational signing activation | pending | The protected workflow remains disabled and no activation is recorded. |
| Public Shortcut release or install link | pending | Release publication remains a separate decision. |

The `pass` disposition above applies only to the maintained public
source/tooling contract. It does not assert native installation, native
execution, player or result outcomes, operational signing, or production
release. Private acceptance evidence, if reviewed later, must be summarized
without copying device identifiers, user data, captures, credentials, or
installation links into this repository.

See [`PHASE_5A_HANDOFF.md`](PHASE_5A_HANDOFF.md) for the maintained source
paths and public handoff boundary.
