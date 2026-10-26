# Phase 9 Hardening and Launch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the WHT request boundary and produce an evidence-backed preview launch ledger that closes or truthfully records every Phase 9 and Phase 5A gate.

**Architecture:** Shared Pages middleware owns response headers, request IDs, payload caps, and bounded abuse protection. Existing route handlers retain their route-specific same-origin and authentication rules. A separate Markdown/JSON evidence ledger records automated checks, preview checks, manual QA, waivers, and external blockers without treating limitations as passes.

**Tech Stack:** Cloudflare Pages Functions, TypeScript, React/Vite, D1, Vitest, Node scripts, Markdown evidence records.

**Spec:** `docs/superpowers/specs/2026-10-25-phase-9-launch-design.md`

## Global Constraints

- Do not reset, clean, overwrite unrelated dirty work, or assume commits/index writes are available.
- Do not perform production deployment, public publication, GitHub workflow activation/dispatch, installation-link changes, or WHT API writes.
- Preserve Phase 5A's signed candidate SHA-256 `19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd`.
- Preserve the truth that the Phase 5A native edge-case matrix, native race/concurrency exercise, and general byte/semantic reproducibility are waived limitations.
- Use test-first implementation for new behavior and fresh verification before completion claims.
- Use current preview alias `https://preview.example.invalid` and record the unique deployment URL returned by the preview deployment.

## Review Focus

- Shared response policy must apply security headers consistently to API, auth, admin, registration, and SPA responses without enabling unsafe cross-origin behavior; test in `tests/unit/phase9-hardening.test.ts`.
- Rate limiting must fail closed for the bounded abuse key while not creating a durable quota claim; test deterministic window/reset behavior in `tests/unit/phase9-hardening.test.ts`.
- Oversized or malformed payloads must be rejected before parser/database work; extend focused HTTP tests.
- Diagnostics must not contain credentials, cookies, query strings, raw captures, or registration tokens; extend logging tests.
- The launch ledger must distinguish pass, pending, blocked, and waived evidence and retain exact source references; test the ledger verifier script.

---

### Task 1: Shared request-boundary hardening

**Files:**
- Create: `daily-games-tracker/functions/_lib/rate-limit.ts`
- Modify: `daily-games-tracker/functions/_lib/limits.ts`
- Modify: `daily-games-tracker/functions/_middleware.ts`
- Modify: `daily-games-tracker/functions/_lib/policy.ts`
- Modify: `daily-games-tracker/functions/_lib/logging.ts`
- Create: `daily-games-tracker/tests/unit/phase9-hardening.test.ts`
- Modify: `daily-games-tracker/tests/unit/http.test.ts`
- Modify: `daily-games-tracker/tests/unit/logging.test.ts`

**Interfaces:**
- Produces a bounded limiter and shared request-policy behavior for later preview checks.
- Keeps existing `ApiError`, `applyResponsePolicy`, `declaredBodyTooLarge`, and redaction contracts backward-compatible.

- [ ] Write failing tests for security headers, deterministic bounded rate-limit responses, and diagnostics redaction.
- [ ] Run the focused tests and confirm they fail for the missing behavior.
- [ ] Implement the smallest shared-boundary change that passes the tests, preserving existing route-specific origin/auth checks.
- [ ] Run focused tests, then typechecks and the full Vitest suite.

### Task 2: Phase 5A closeout and launch rehearsal ledger

**Files:**
- Create: `daily-games-tracker/PHASE_9_LAUNCH_GATES.md`
- Create: `daily-games-tracker/scripts/phase9-verify-launch-gates.mjs`
- Create: `daily-games-tracker/scripts/tests/phase9-launch-gates.test.mjs`
- Create: `daily-games-tracker/reports/phase9-launch-gates.json`

**Interfaces:**
- Consumes the authoritative execution plan, Phase 5A handoff/native acceptance records, and local verification commands.
- Produces machine-checkable dispositions for security, recovery, device/browser QA, pilot, terms/platform review, and every formal Phase 5A handoff item.

- [ ] Write failing verifier tests for pass/pending/blocked/waived disposition handling and required Phase 5A limitation text.
- [ ] Run the verifier tests and confirm they fail for the missing ledger/verifier.
- [ ] Implement the verifier and ledger with exact references and no unsupported pass claims.
- [ ] Run the verifier, local recovery/rehearsal checks, and record the current preview evidence.

### Task 3: Integrated verification and preview deployment

**Files:**
- Modify only files required by verified findings from Tasks 1–2.
- Update: `daily-games-tracker/reports/phase9-launch-gates.json`

- [ ] Run focused and full tests, lint/format checks, all TypeScript checks, production build, database test, and local Pages smoke.
- [ ] Deploy only the reviewed revision to the existing preview environment.
- [ ] Run health, security-header, auth/origin, payload-cap, and no-write smoke checks against the unique preview URL.
- [ ] Run the Sol medium substantive review against the actual implementation/tests.
- [ ] If findings exist, repair with a Luna xhigh implementation worker and run targeted Sol medium re-review.
- [ ] Update the ledger with evidence, blockers, limitations, and exact preview URLs.
