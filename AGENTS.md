# Canonical repository workflow

This checkout is the maintained source for `ali-hashim/daily-games-tracker`. The private WHT workspace and its migration evidence are historical handoff material. The initial reviewed publication is a one-time migration; after it is accepted, work from short-lived branches in this checkout and use ordinary commits, pull requests and CI. Do not create a second export checkout or recopy the private workspace for routine changes.

Before the one-time migration, or any later public push or pull request that publishes this repository, read and follow [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md). Ordinary local edits and branch work do not require an export workflow.

# Implementation and review roles

Implementation workers use GPT-5.6 Luna with xhigh reasoning. Independent review uses GPT-6.1 Sol with medium reasoning. Keep file ownership disjoint, preserve unrelated working-tree changes, and run the relevant checks before reporting completion. These role pins apply to repository implementation and review work; they do not authorize deployment, remote database mutation, Shortcut distribution, or signing.

# Shortcut creation and CI

For every new or modified Shortcut, use the pinned GitHub Actions workflow `.github/workflows/cherri-alert-experiment.yml` as the authoritative Cherri compiler and build environment. Do not search for, install, or rely on a local Cherri compiler. Run CI on the reviewed public revision and use only its inspected artifacts for Shortcut distribution. Local source-contract checks are supplementary and do not replace CI compilation. Reviewed, credential-free signing packages are approved for one-time HubSign transfer; do not disable or defer signing when the exact CI-inspected package and hashes are available. Preserve the package's fail-closed integrity checks and never retry an ambiguous transfer. The checked-in signing workflow remains fail-closed and disabled unless the separately reviewed activation gate is satisfied; preserve its false guard and all-zero reviewed-commit sentinel.
