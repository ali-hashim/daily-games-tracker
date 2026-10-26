# Canonical repository workflow

This checkout is the maintained source for `ali-hashim/daily-games-tracker`. The private WHT workspace and its migration evidence are historical handoff material. The initial reviewed publication is a one-time migration; after it is accepted, work from short-lived branches in this checkout and use ordinary commits, pull requests and CI. Do not create a second export checkout or recopy the private workspace for routine changes.

Before the one-time migration, or any later public push or pull request that publishes this repository, read and follow [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md). Ordinary local edits and branch work do not require an export workflow.

# Public deployment privacy

Tracked Markdown, reports, manifests, examples, source and pull-request text must not publish hosted origins, deployment URLs or IDs, Pages project names, account or D1 identifiers, Access audiences or administrator identities, private evidence, or install links. Keep those values in private platform configuration or ignored local files and use inert placeholders for public contract examples. GitHub repository, branch, commit and CI links are source provenance and may remain when they do not identify a deployment. A normal future branch/PR/CI workflow replaces the one-time migration; do not create recurring exports.

# Implementation and review roles

Implementation workers use GPT-5.6 Luna with xhigh reasoning. Independent review uses GPT-6.1 Sol with medium reasoning. Keep file ownership disjoint, preserve unrelated working-tree changes, and run the relevant checks before reporting completion. These role pins apply to repository implementation and review work; they do not authorize deployment, remote database mutation, Shortcut distribution, or signing.

# Shortcut creation and CI

For every new or modified Shortcut, use the pinned GitHub Actions workflow `.github/workflows/cherri-alert-experiment.yml` as the authoritative Cherri compiler and build environment. Do not search for, install, or rely on a local Cherri compiler. Run CI on the reviewed public revision and use only its inspected artifacts for Shortcut distribution. Local source-contract checks are supplementary and do not replace CI compilation. Reviewed, credential-free signing packages are approved for the authorized protected transfer, including user-directed retries of previously ambiguous outcomes when the exact CI-inspected package, source-commit, digest and workflow-state checks pass; do not bypass those checks or ask for repeat approval. The Actions-only signing workflow compiles and inspects through pinned CI, records a GitHub pending lease, sends one exact HubSign POST, and retains only AES-256-GCM encrypted intent/result artifacts with bounded expiry. Preserve its fail-closed integrity and state behavior: a retry must still use the exact reviewed package and valid private artifacts, and no changed or unreviewed payload is authorized. Do not claim that an operational CI signing run or signed delivery has occurred. No runtime signing worker or endpoint is required.
