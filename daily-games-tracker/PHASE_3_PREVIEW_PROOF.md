# Phase 3 preview proof

The preview parser diagnostic and synthetic fixture suite completed the Phase 3
boundary checks. The public record keeps the scope and limitations; raw device
captures, player results, request identifiers, and platform trace exports stay
in private evidence.

## Publicly maintained contract

- Preview diagnostics use fixed synthetic cases and read-only behavior.
- Successful and failing parser cases are checked through the same capture and
  parser modules used by the application.
- The diagnostic does not accept arbitrary uploads, write D1, expose answers,
  or read device credentials.
- Security headers, request boundaries, no-store behavior, and unknown-route
  failures are covered by the application checks.

The resulting checks establish preview behavior for the tested synthetic
inputs. They do not establish production deployment, native iPhone layout,
full-request CPU headroom, or current account usage margin.
