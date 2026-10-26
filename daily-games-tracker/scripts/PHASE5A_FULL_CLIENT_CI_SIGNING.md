# Full-client CI signing preparation

The authoritative preparation path is the disabled workflow at
`.github/workflows/shortcut-sign-disabled.yml`. Its permanent
`false && inputs.confirm_external_signing` job guard and all-zero reviewed
commit sentinel keep activation fail-closed. The routine unsigned workflow
does not send a signing payload, use repository secrets, or deploy the app.

Before a separately authorized operational run, review the exact sanitized
source commit, toolchain lock, native contract, package manifest, and wire
digest. The workflow rebuilds the pinned Cherri source with locked unsigned
flags, builds the complete client twice, compares the native contract, and
freezes the first build for offline review. A fresh build must never approve
itself by deriving expected digests from the same run.

The sender validates every package file, the XML plist round trip, the native
contract, and the exact HubSign JSON wire body before one POST. It does not
follow redirects or retry. An ambiguous transport result remains ambiguous;
preserve its evidence and stop. `AEA1` is only a container-header observation,
not Apple cryptographic signature validation or native acceptance.

Run static checks and synthetic mutation tests from the repository root:

```text
node daily-games-tracker/scripts/phase5a-verify-signing-workflow.mjs
node --test daily-games-tracker/scripts/tests/phase5a-verifier.test.mjs daily-games-tracker/scripts/tests/phase5a-signing-workflow.test.mjs
```

The standing transfer boundary is recorded in
[HUBSIGN_AUTHORIZATION.md](HUBSIGN_AUTHORIZATION.md). It covers only an exact
reviewed credential-free payload sent to the approved HubSign endpoint. It does
not authorize activating or dispatching the workflow, publishing an install
link, making WHT requests, deploying, or submitting real scores.
