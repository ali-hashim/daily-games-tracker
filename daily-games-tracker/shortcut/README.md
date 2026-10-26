# Upload to WHT Shortcut source

The supported source is `cherri-migration/source/upload-to-wht.cherri`. It
accepts Safari webpages and shared text, keeps the original capture available
for validation and submit, and routes server responses through the shared
completion menu. Device authorization is supplied at runtime through the clean
Import Question; no device code or configured Shortcut belongs in this
repository.

Use the pinned CI workflow in
`.github/workflows/cherri-alert-experiment.yml` for every new or modified
Shortcut. The static inspectors and synthetic fixtures document source and
native action contracts. They do not establish Apple signature validity,
native iPhone execution, network failure behavior, clipboard permissions, or
production acceptance.

See [the Cherri tooling guide](cherri-migration/README.md),
[the app Phase 5A handoff](PHASE_5A_HANDOFF.md), and the
[standing HubSign authorization](../scripts/HUBSIGN_AUTHORIZATION.md) for
review boundaries. HubSign transfer, installation-link publication, WHT API
requests, deployments, and real score writes remain separately controlled.
