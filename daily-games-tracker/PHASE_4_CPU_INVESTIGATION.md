# Phase 4 CPU investigation

**Current disposition:** Full import CPU remains an open, nonblocking
monitoring item by the recorded user decision. The latest saved-result
validation observations were above the Workers Free 10 ms/request target; the
new-save path is unmeasured. Detailed request traces and platform reports stay
private.

## Scope and findings

- The measurement target is the complete authenticated
  `/api/import/validate` path, including authorization, version checks,
  parsing, D1 reads, and response construction.
- Parser-only local timings are not substitutes for deployed full-request CPU.
- Read consolidation and exact-path dispatch candidates were checked locally
  and in preview. The latest bounded saved-result sample measured 13/14 ms;
  this is too small to establish a percentile, cold/warm bound, or causal
  improvement claim.
- New-result/write-path CPU, account-specific usage margin, and paid-plan
  entitlement remain unmeasured or unconfirmed.

No production deployment, billing change, database write, or private evidence
export is part of this phase record.
