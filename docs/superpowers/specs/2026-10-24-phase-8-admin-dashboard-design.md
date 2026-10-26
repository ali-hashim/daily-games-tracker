# Phase 8 Admin Dashboard Design

## Intent

Complete the protected administrator surface for the existing WHT Pages Functions/D1 application. Administrators need one place to inspect and manage players, invitations, devices, sessions, submissions, and audit history, plus safe historical backfill and correction tools. The security and data-integrity goal is that every material mutation is authenticated, reasoned, transactional, redacted in an append-only audit row, and immediately visible through the existing derived leaderboard queries.

## Goals

- Keep every `/api/admin/*` operation behind independent Cloudflare Access verification and same-origin checks for writes.
- Expose read-only admin views for players, invites, devices, sessions, submissions, and audits without returning secrets or protected answer data unnecessarily.
- Require a non-empty reason for score corrections and deletions.
- Revalidate game-specific round counts, raw-score domains, weights, and totals before replacing normalized submission/round data.
- Write correction timestamps and audit data in the same D1 transaction as the corrected rows.
- Capture a complete redacted submission/round before-state in the same transaction as deletion; cascade deletion must not lose the audit snapshot.
- Support explicit Pacific `game_date` historical backfill with `source_kind = 'admin'`.

## Non-goals and anti-goals

- No direct database editing, production deployment, or public publication.
- No new player-facing score-entry fallback or parser changes.
- No storage of device credentials, invite/session tokens, raw screenshots, or other secrets in API responses or audit JSON.
- No soft-delete model beyond the existing schema; deletion is an audited hard delete with a preserved redacted before-state.

## Constraints

- Preserve existing dirty user changes and current Phase 7 leaderboard behavior.
- Use the existing Pages Functions, D1, React, Vitest, and Miniflare patterns.
- Keep the existing catch-all admin route as the compatibility boundary, delegating SQL-heavy behavior to focused helpers.
- Use a new forward migration for any schema additions; do not rewrite prior migrations.
- Use TDD for new behavior and verify the complete local suite before completion.

## Approaches

1. Extend the current catch-all route with inline SQL. This is the smallest diff, but would mix authorization, validation, transaction construction, and serialization in one handler and make deletion/correction auditing hard to review.
2. Split every endpoint into independent Pages Function files. This gives clean routing, but duplicates the existing admin boundary and would require a broad route/configuration refactor.
3. Keep the current catch-all route as the compatibility entry point and delegate to focused admin service helpers. This preserves current callers while isolating read models and transaction invariants; it is the selected approach.

## Selected design

Add one forward migration only when needed for admin list metadata or safe query indexes. Add an admin service module with typed list queries and transactional commands: correction, deletion, and backfill. Each command loads the current normalized data, validates the request against the game configuration, creates a redacted JSON snapshot, and uses one D1 batch/transactional unit for all writes and the audit insert. Reasons are trimmed and bounded at the request boundary and stored in the audit row. Extend the existing React admin page with clearly separated management sections and confirmation/reason fields for destructive or score-changing actions.

## Acceptance

Non-admin requests and direct handler calls are rejected; sessions, invites, and device state are visible without secrets; correction/delete requests without reasons fail without mutation; invalid rounds/totals fail atomically; correction and deletion audit rows contain redacted before/after state; backfill stores the explicit Pacific date and admin source; and leaderboard reads change immediately after a correction or deletion.
