# Phase 5B — Login with Device

**Current status:** Website sessions and Login with Device are implemented and
closed under bounded acceptance. Native acceptance of any later Shortcut build,
operational signing, independent rollback, and exact release reconciliation
remain open. Production is undeployed.

## Contract

- A browser starts a short-lived, same-origin login challenge.
- An authorized device approves the challenge; the initiating browser completes
  it once and receives the normal HttpOnly session cookie.
- Challenges are one-use, expiry-bound, browser-bound, and checked against the
  active player/device state.
- Logout, expiry, revocation, wrong-browser completion, replay, and malformed
  return targets fail closed.
- Login branches stop before capture, upload, or clipboard behavior.

The public source contains the implementation, synthetic fixtures, and
credential-free inspectors. Native device evidence, configured artifacts,
request traces, and private rollback material remain outside the repository.
Phase 10 builds on this contract for `/user` and the `/login` compatibility
alias.
