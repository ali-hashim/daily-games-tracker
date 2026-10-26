---
name: sanitized-push
description: Safely publish reviewed WHT changes to the public GitHub repository.
---

# Sanitized pushes

This skill governs the one-time migration from the private WHT workspace into
`ali-hashim/daily-games-tracker`. After that migration is reviewed and merged,
the canonical checkout is the sole maintained source tree. Future changes use
ordinary branches, commits, pull requests, and CI from that checkout; do not
recreate a second export, recopy the private workspace, or run a sanitization
build for every push. Read this skill before the migration push and whenever a
future change materially affects publication safety.

1. **Use the canonical public checkout.** For the initial migration, never push the private workspace or its Git history: work from the clean public checkout of `ali-hashim/daily-games-tracker`, copy in only reviewed changes, and preserve its existing public files. After cutover, work directly from that canonical checkout. Never use broad private staging, `--mirror`, all-ref pushes, force-pushes, or history rewrites.

2. **Confirm scope and remote.** An explicit request to push authorizes that reviewed push; do not ask for redundant approval. Verify the checkout remote is exactly `ali-hashim/daily-games-tracker` before writing. This does not authorize deployment, Shortcut signing, or unrelated changes.

3. **Review the diff.** Inspect the diff against the public baseline and every changed or staged file. Scan for credentials, tokens, passwords, private `.env` or deployment configuration, hosted origins, deployment URLs or IDs, Pages project names, account or D1 identifiers, Access audiences or administrator identities, private Shortcut codes or install links, player names/results/captures, database or operator data, local machine paths, `.wrangler` state, and generated evidence. Remove private values or replace them with inert synthetic placeholders or private external-configuration references. Check URLs and request destinations for unintended private endpoints; public docs must not contain real deployment identities even when those values are not passwords.

4. **Keep signing protected.** Preserve the automatic trigger for relevant reviewed pushes to protected `main`, optional protected manual recovery, dedicated protected environment, pinned compile/inspect checks, exact reviewed-source and package-digest checks, GitHub pending lease, one exact HubSign POST, AES-256-GCM encrypted intent/result artifacts with bounded expiry, and fail-closed one-request behavior. Do not retry ambiguous responses, re-sign after artifact expiry, or claim an operational signing run or signed delivery until protected CI evidence exists. No runtime signing worker or endpoint is required.

5. **Test proportionally.** Run relevant tests and builds for the changed behavior and publication risk. Respect an explicit request to skip cosmetic regression tests. Separate local checks from unproved CI, native execution, or signing claims.

6. **Publish safely.** Review the final staged diff, commit, tree, and branch update. Update the intended branch without force. If a secret or mismatch appears, stop and fix the local candidate; never rewrite remote history.
