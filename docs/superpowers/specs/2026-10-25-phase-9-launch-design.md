# Phase 9 Hardening and Launch Design

## Intent

Close the Phase 9 launch gates for the WHT preview without silently converting
external or user-waived evidence into passing evidence. The work hardens the
shared Pages request boundary, makes operational signals safe to inspect, and
records the remaining Phase 5A/launch decisions in a durable ledger.

## Goals

- Enforce and test CSP/security headers, same-origin state-change protection,
  request payload caps, bounded rate limiting, XSS-safe rendering, and redacted
  structured diagnostics.
- Provide a repeatable local rehearsal contract for D1 export/restore,
  forward-only migration, and administrator recovery.
- Record preview deployment checks, manual QA requirements, pilot status, and
  current external review gates with explicit evidence states.
- Preserve the Phase 5A signed candidate identity, protected signing-workflow
  activation condition, user-reported backup limitation, and explicit waivers.

## Non-goals and constraints

- No production deployment, public publication, installation-link change,
  GitHub workflow activation/dispatch, WHT API write, or credential access.
- No claim of native edge-case, native race/concurrency, or reproducibility
  proof without new evidence.
- Preserve all existing dirty work and do not rely on commits or index writes.

## Approaches considered

1. **Code hardening plus evidence ledger (chosen).** Add shared controls and
   focused tests, then record external gates as pass, limitation, blocked, or
   pending with source references. This is the smallest path that advances
   launch readiness while keeping evidence honest.
2. **Documentation-only closeout.** Fast, but would leave missing shared
   controls and regression coverage unresolved.
3. **Production-like full rehearsal.** Strongest operational evidence, but it
   would require unauthorized production/Cloudflare/GitHub side effects and
   cannot be performed in this task.

## Design

The request middleware remains the single response-policy boundary. A bounded
in-memory limiter is used only for per-isolate abuse protection; durable
quotas remain a Cloudflare/platform responsibility. State-changing routes keep
the existing same-origin requirement. All new diagnostics use request IDs and
redacted route metadata only. Tests assert the public behavior and headers,
not implementation internals.

The operational ledger separates automated evidence from manual QA and
external decisions. Phase 5A is considered formally closed only when its
protected signing activation condition, rollback reference, and limitation
decision are explicitly recorded; the recorded limitation is not relabeled as
pass.

## Success criteria

- Focused hardening tests fail before each production-code change and pass
  afterward; the full repository suite, typechecks, build, and local smoke
  checks are rerun.
- Preview deploy and health checks identify the exact deployment URL and
  schema version.
- The launch ledger has one disposition for every Phase 9 checklist item and
  every Phase 5A formal handoff item, with no unsupported completion claims.
