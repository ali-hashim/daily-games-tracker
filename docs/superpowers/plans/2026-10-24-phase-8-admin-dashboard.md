# Phase 8 Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the protected Phase 8 administrator dashboard and transactional correction, deletion, audit, and historical backfill workflows.

**Architecture:** Keep `/api/admin/*` as the independently authenticated compatibility boundary and delegate to focused service functions for read models and mutations. Use a forward D1 migration only for additive schema/index needs, and perform correction/deletion/backfill writes with the normalized submission/round rows and audit insert in one transactional unit.

**Tech Stack:** Cloudflare Pages Functions, D1/SQLite, TypeScript, React, Vitest, Miniflare.

**Spec:** `docs/superpowers/specs/2026-10-24-phase-8-admin-dashboard-design.md`

## Global Constraints

- Every admin handler must independently require the verified Cloudflare Access administrator identity.
- Every material mutation must be audited; correction and deletion require a non-empty reason.
- Corrected rounds and totals must be revalidated against the game configuration before normalized rows are replaced.
- Deletion must preserve a full redacted before-state in an append-only audit row in the same transactional unit as the delete.
- Historical backfill must take an explicit Pacific `game_date` and persist `source_kind = 'admin'`.
- Secrets, invite tokens, session values, device credentials, screenshots, and raw protected game text must not appear in audit content or ordinary list responses.
- Existing Phase 7 leaderboard queries are the derived read model; no direct board edits are allowed.

## Review Focus

- Unauthorized direct handler calls and non-admin requests: reject before reading or mutating D1; test at the route and middleware boundaries.
- Missing/blank/oversized correction or deletion reasons: reject without changing normalized data or creating an audit row; test in the mutation task.
- Invalid round count, score domain, weight, or total: reject atomically and preserve the original submission; test in the correction/backfill task.
- Deletion audit ordering and redaction: the audit row must retain all non-secret submission/round fields even after cascade deletion; test with a real D1 transaction.
- Pacific date and derived-board consistency: backfill/correction/deletion must use the requested date and change leaderboard output immediately; test through existing leaderboard helpers.

---

### Task 1: Admin data model and transactional service

**Files:**
- Create or modify: `daily-games-tracker/functions/_lib/admin.ts` and any focused helper modules following existing conventions.
- Create: `daily-games-tracker/migrations/0003_phase8_admin.sql` only if additive schema/index changes are required.
- Test: `daily-games-tracker/tests/integration/admin.test.ts`.

**Interfaces:**
- Consumes: `AppEnv`, existing Access/session helpers, game config, leaderboard/scoreboard helpers, and the existing D1 schema.
- Produces: typed admin list queries plus correction, deletion, and backfill commands that accept verified admin identity and return sanitized result data.

- [ ] **Step 1: Write failing integration tests** for list reads, required reasons, invalid round/totals rejection, transactional correction, full redacted deletion snapshot, explicit Pacific-date admin backfill, audit append-only behavior, and immediate derived-board changes.
- [ ] **Step 2: Run the focused admin test file and verify it fails because the Phase 8 service behavior is absent.**
- [ ] **Step 3: Implement minimal typed service functions and additive migration/indexes if required.** Keep redaction centralized and exclude secrets/raw protected text from output. Build correction/deletion/backfill batches so normalized rows, timestamps, and the audit insert succeed or fail together.
- [ ] **Step 4: Run the focused admin tests until green, then run the existing leaderboard/onboarding integration tests.**

### Task 2: Protected admin API surface

**Files:**
- Modify: `daily-games-tracker/functions/api/admin/[[path]].ts`.
- Test: `daily-games-tracker/tests/integration/admin.test.ts` and relevant access tests.

**Interfaces:**
- Consumes: Task 1 service functions and existing `requireAdmin`, origin, body, and error helpers.
- Produces: authenticated GET/PATCH/POST/DELETE endpoints for players, invitations, devices, sessions, submissions, backfill/correction/deletion, and audit history.

- [ ] **Step 1: Add failing handler tests** for every new endpoint, including missing auth, forged/non-admin auth, wrong method, cross-origin write, and sanitized response contracts.
- [ ] **Step 2: Run the focused handler tests and verify the expected failures.**
- [ ] **Step 3: Add route dispatch and request validation while keeping independent admin verification at the handler boundary.**
- [ ] **Step 4: Run focused handler/access tests and verify all writes create the expected audit entries.**

### Task 3: Administrator dashboard UI

**Files:**
- Modify: `daily-games-tracker/src/pages/AdminPage.tsx` and `daily-games-tracker/src/styles.css` only where needed for the existing visual system.
- Test: `daily-games-tracker/tests/unit/admin-page.test.tsx` or the repository’s established UI test location.

**Interfaces:**
- Consumes: Task 2 JSON contracts.
- Produces: protected views for players, invitations, devices, sessions, submissions, and audit history, with reason inputs and confirmations for correction/deletion/backfill.

- [ ] **Step 1: Write failing UI tests** for section rendering, sanitized fields, required reason inputs, and refresh after mutations.
- [ ] **Step 2: Run the focused UI tests and verify they fail for missing Phase 8 controls.**
- [ ] **Step 3: Implement the dashboard sections using existing `apiRequest`/copy helpers and accessible form controls.**
- [ ] **Step 4: Run UI tests, typecheck, lint, and production build.**

### Task 4: Full verification and exit gate

**Files:**
- Modify: only tests/docs needed to record verified behavior.

- [ ] **Step 1: Run the complete test suite, typecheck, lint, and build.**
- [ ] **Step 2: Re-read the Phase 8 requirements and verify each exit criterion against test evidence and the final diff.**
- [ ] **Step 3: Record unresolved concerns explicitly; do not claim completion if an access, audit, transaction, or derived-board requirement remains unverified.**
