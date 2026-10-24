# Public publication

Before preparing or publishing a public export, push, or pull request from this repository, read and follow [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md). Ordinary local edits do not require the publication workflow.

# Shortcut creation and CI

For every new or modified Shortcut, use the pinned GitHub Actions workflow `.github/workflows/cherri-alert-experiment.yml` as the authoritative Cherri compiler and build environment. Do not search for, install, or rely on a local Cherri compiler. Run CI on the reviewed public revision and use only its inspected artifacts for Shortcut distribution. Local source-contract checks are supplementary and do not replace CI compilation. Keep `.github/workflows/shortcut-sign-disabled.yml` permanently disabled and preserve its fail-closed guards; do not enable signing or change its zero-commit sentinel.
