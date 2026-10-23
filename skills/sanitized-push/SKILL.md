---
name: sanitized-push
description: Safely publish reviewed WHT changes to the public GitHub repository.
---

# Sanitized pushes

Use this skill before a GitHub push from WHT. It governs publication only; ordinary local edits do not need it.

1. **Use the public checkout.** Never push the private workspace or its Git history. Work from the clean public checkout of `ali-hashim/daily-games-tracker`, copy in only reviewed changes, and preserve its existing public files. Never use broad private staging, `--mirror`, all-ref pushes, force-pushes, or history rewrites.

2. **Confirm scope and remote.** An explicit request to push authorizes that reviewed push; do not ask for redundant approval. Verify the checkout remote is exactly `ali-hashim/daily-games-tracker` before writing. This does not authorize deployment, Shortcut signing, or unrelated changes.

3. **Review the diff.** Inspect the diff against the public baseline and every changed or staged file. Scan for credentials, tokens, passwords, private `.env` or deployment configuration, private Shortcut codes or install links, player names/results/captures, database or operator data, local machine paths, `.wrangler` state, and generated evidence. Remove private values or replace them with inert synthetic placeholders. Check URLs and request destinations for unintended private endpoints.

4. **Keep signing disabled.** Preserve the existing permanent `false && inputs.confirm_external_signing` guard and zero-commit sentinel. Do not enable Shortcut signing or relax digest/contract checks without explicit authorization.

5. **Test proportionally.** Run relevant tests and builds for the changed behavior and publication risk. Respect an explicit request to skip cosmetic regression tests. Separate local checks from unproved CI, native execution, or signing claims.

6. **Publish safely.** Review the final staged diff, commit, tree, and branch update. Update the intended branch without force. If a secret or mismatch appears, stop and fix the local candidate; never rewrite remote history.
