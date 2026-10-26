# Phase 3 CPU follow-up

This record describes the CPU question without publishing private request
traces or raw captures. Isolated parser work is bounded and optimized, but the
full authenticated import path remains a separate measurement.

## Findings

- Local parser and workerd checks stay within the intended bounded-input
  design.
- The largest synthetic node-count case reaches the platform budget boundary
  at sampled integer precision; no headroom or production percentile claim is
  made.
- Isolated parser results exclude routing, Access verification, D1, and the
  complete device-authenticated request.
- The temporary diagnostic evidence and platform traces remain private and are
  not required by the public build.

Phase 4 owns the full import CPU investigation. Production deployment,
account-plan changes, and private diagnostic resources are outside this
phase.
