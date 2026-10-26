# Phase 2 access, invitations, and devices

Phase 2 established the invitation-only onboarding and administrator boundary
in preview. This public summary preserves the behavior and current state while
omitting identities, device labels, invitation URLs, device codes, request
IDs, and screenshots from private verification.

## Implemented contract

- Cloudflare Access protects administrator routes and the application verifies
  the expected audience before allowing administrator operations.
- Administrators can create, deactivate, and invite players through the
  protected dashboard flow.
- Invitations are one-use and time-limited. Redemption creates the player,
  an initial browser session, and a separate device credential.
- Device credentials are shown once during private setup, hashed before
  storage, scoped to player operations, and immediately revocable.
- Browser sessions are opaque, HttpOnly, activity-limited, and invalidated by
  revocation or player deactivation.
- Replayed, expired, malformed, cross-origin, or unauthorized requests fail
  without exposing credential material.

## Verification boundary

Preview route and authentication checks were exercised during the phase and
the resulting evidence remains private. The public source contains only
placeholder configuration and credential-free synthetic tests. No invitation,
configured Shortcut, device code, player record, or Access secret is included
in this repository.

Production Access configuration, administrator identity, player invitations,
device setup, and account recovery remain release tasks. Public Access domain
and audience identifiers may be committed when intentionally configured; they
are identifiers, not bearer credentials.
