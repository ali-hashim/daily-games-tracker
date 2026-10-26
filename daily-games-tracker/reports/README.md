# Maintained reports

`phase9-launch-gates.json` is the public machine-readable launch ledger. The
verifier accepts `pass`, `pending`, `blocked`, and `waived`; unresolved gates
and explicit waivers remain visible rather than being converted into passes.
Its references point to repository-relative requirements and handoff records.
Public hostnames, deployment identifiers, source revisions, and artifact hashes
are retained only when they are intentional safe identities.

`phase10-user-page-verification.md` records the reviewed User page scope and
checks. It does not include credentials, configured install links, player
captures/results, database exports, or private request traces.

Historical native, CPU, parser, and recovery reports that contain real device
material, player data, configured artifacts, or operational evidence remain in
the private migration archive. They are not required inputs to the public
build; the maintained verifier and recovery tooling use synthetic fixtures and
disposable local state.
