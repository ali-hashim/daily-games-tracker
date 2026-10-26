# Safari Login Return Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore an explicit Safari `Return to WHT` branch after successful Shortcut device approval while preserving the accepted upload flow.

**Architecture:** The Cherri login branch reads `return_url` from the approved server response and presents a success menu. The existing `whtOpenURL` action opens that server-owned URL in Safari; `Close` and all failure paths stop. The source inspector and focused tests pin the control-flow contract, while existing build/signing checks validate the generated candidate.

**Tech Stack:** Cherri source, Python source-contract inspection, Python `unittest`, existing Phase 5A/5B build and signing scripts.

**Spec:** `docs/superpowers/specs/2026-10-23-safari-login-return-design.md`

## Global Constraints

- Safari is the intended WHT web interface for this flow.
- Use the server-provided `return_url`; do not hard-code a PWA or browser destination.
- Preserve the existing challenge, authorization header, approval request, error handling, upload/capture, clipboard, and completion-menu contracts.
- No schema/version/authentication redesign, production deployment, public publication, install-link change, or original-pilot rewrite.
- Every login branch must remain fail-closed with explicit Stop This Shortcut behavior.
- Implementation workers use GPT-5.6 Luna with XHigh reasoning; the reviewer uses GPT-6.1 Sol with Medium reasoning.

## Review Focus

- Success menu uses the runtime `return_url` exactly once and opens Safari, not a hard-coded URL — test with a missing/hard-coded return-target mutation.
- `Close` and `Return to WHT` both stop, and approval cannot fall through to capture/upload/clipboard — test control-flow markers and forbidden side effects.
- The accepted upload tail remains byte/source-contract stable — run the existing Phase 5A/5B inspectors and upload regressions.
- The API's `return_url` response field remains the only return destination — inspect the generated action and source contract.
- Existing login error/unknown/cancel behavior remains unchanged — run the focused login tests and full relevant suite.

### Task 1: Restore the Safari return branch

**Files:**
- Modify: `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri`
- Modify: `daily-games-tracker/scripts/inspect_phase5b_login.py`
- Modify: `daily-games-tracker/scripts/tests/test_phase5a_upload.py` or the focused Phase 5B test location selected by the worker
- Modify: `daily-games-tracker/PHASE_5B_PLAN.md`, `daily-games-tracker/PHASE_5_STATUS.md`, and `daily-games-tracker/shortcut/PHASE_5_LOGIN.md` as needed to replace the obsolete manual/PWA-success wording
- Generate/verify: the existing Cherri build output and credential-free signing evidence locations, without publishing or deploying

**Interfaces:**
- Consumes: approved login response fields `status`, `error_message`, and `return_url`; existing `whtOpenURL` action.
- Produces: a success menu with `Return to WHT` and `Close`, runtime `return_url` binding, updated source contract, and a verified candidate artifact.

- [ ] **Step 1: Add the failing regression assertion** for the approved login success branch requiring `return_url`, `Return to WHT`, Safari URL opening, and explicit stop.
- [ ] **Step 2: Run the focused test/inspector** and confirm it fails because the current source intentionally has manual return and no URL branch.
- [ ] **Step 3: Implement the minimal Cherri success branch**: read the response's `return_url`, present `Return to WHT`/`Close`, open the runtime URL only from the return item, and stop in both branches. Preserve all other login and upload behavior.
- [ ] **Step 4: Update the source inspector and tests** to accept the reviewed branch and reject missing, hard-coded, or fall-through variants.
- [ ] **Step 5: Run the focused tests, build, unsigned inspection, and existing signing/package checks. Use the standing HubSign authorization only for the exact reviewed credential-free package if the existing workflow requires a signed candidate; do not deploy or publish.
- [ ] **Step 6: Update Phase 5B documentation** to state Safari is the intended interface and record the PWA/Safari distinction accurately.
- [ ] **Step 7: Report exact files, hashes/artifacts, checks, and any unresolved concerns. Do not spawn additional agents.
