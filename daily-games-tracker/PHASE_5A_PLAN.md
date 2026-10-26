# Phase 5A — Shortcut source and build handoff

**Current status:** The upload client source and pinned build/inspection
contracts are maintained in the public tree. Formal operational signing,
independent rollback identity, bounded saved-result integrity, and complete
native handoff remain open. The protected signing workflow remains disabled.

## Scope

- Keep the Shortcut thin: capture, version, credential binding, HTTP requests,
  server-authored messages, and completion routing remain client duties.
- Compile and inspect new or changed Shortcut source only through the pinned
  GitHub Actions workflow. Local compiler installation is not part of the
  public workflow.
- Preserve the nested capture body, numeric version, response routing, and
  fail-closed integrity checks.
- Keep configured Shortcuts, device codes, private player captures/results,
  signing payloads, and operator reports outside the repository.

## Remaining gates

Native installation and execution of the exact reviewed client, independent
rollback bytes, saved-result integrity, reproducibility disposition, and
operational signing activation require separately reviewed release evidence.
Phase 5A does not authorize production deployment, install-link publication,
or player communication. The exact candidate identity and pending/waived
dispositions are retained in [PHASE_9_LAUNCH_GATES.md](PHASE_9_LAUNCH_GATES.md)
and its machine-readable companion.
