# Winstitute of Higher Thinking — V1 Product Specification and Execution Plan

> **Current tracking (October 25):** Historical document, not the active queue. Use [PROJECT_STATUS](daily-games-tracker/PROJECT_STATUS.md), the final specification and repository execution plan. Core features/Phase 9 engineering are preview-deployed; Phase 5A/9 gates remain open and final Phase 10 is planned.

> **Superseded historical plan:** Use [the Final Implementation Plan](Daily_Games_Tracker_Final_Implementation_Plan.md) and [the repository execution plan](daily-games-tracker/EXECUTION_PLAN.md). These are the current requirements, including API-owned validation, no game-result hashes, and fresh scoreboard copying for already-saved results from either import endpoint. The older decisions below are retained only as history.

**Status:** Design agreed in conversation; open decisions appear at the end.
**Date:** October 15, 2026
**Primary target:** iPhone Safari, portrait orientation; usable as a Home Screen web app.
**Games:** Krillion and MapTap.
**Goal:** A shared, low-maintenance, free-to-operate game-results website where friends submit daily results, compare scores, and review historical rankings.

## 1. Product boundaries

- No native iOS app, App Store distribution, screenshots stored in the cloud, paid OCR API, or third-party identity provider required for V1.
- One player identity across both games, resolved using the player's unique PIN; no username selector on the submission flow.
- Two **combined** leaderboard pages: Daily (Krillion + MapTap), All-Time (Krillion + MapTap). Rankings are independent for each game.
- A protected `/admin` route exists but is not advertised in normal navigation. The absence of a link is **not** a security boundary.
- A screenshot may be held temporarily in browser memory for OCR and preview; never upload or persist it. No screenshot or extracted raw image data in logs, caches, analytics, or D1.

## 2. Routes and access model

| Route                    | Purpose                                            | Access                                                                                       |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/submit`                | Three-step unified game submission                 | PIN required before final submission                                                         |
| `/daily?date=YYYY-MM-DD` | Both daily leaderboard tables and Copy Leaderboard | Historical daily details: PIN; today's detailed game results: PIN + submitted that game/date |
| `/all-time`              | Both all-time rankings and date rows               | Public, no PIN needed                                                                        |
| `/admin`                 | Manage players, scores, PIN resets, activity log   | Separate admin authentication and authorization                                              |

**Daily spoiler policy:** Authentication alone does not reveal today's Krillion answers or today's MapTap level-by-level details for an unplayed game. The server checks a submission for the authenticated player, game, and selected date before returning that game's detailed rows. Being eligible for Krillion does not unlock MapTap. Never send locked raw details to the client. Historical daily pages can be read after authentication even if that user did not submit for that date.

**All-time policy:** All-time standings are always current and public, even if they include today's scores. No special filtering. Public endpoints return only permitted statistics, not private answer data or PIN information.

**Copy policy:** A player who has submitted at least one game for that day may use Copy Leaderboard. The clipboard content includes score-only standings for **both** games and does not include any Krillion answers. It contains a link to the full `/daily?date=...` page, but that link never bypasses access checks. The share body has no PIN instructions and no separate all-time leaderboard section.

## 3. Unified submission workflow

### Step 1 — Select Games

- Two choices: 🦐 Krillion, 🌎 MapTap. Choose one or both. Require at least one selection.
- Use large touch targets and make the next action obvious.

### Step 2 — Data Entry

- A single six-digit player PIN field, no name dropdown. The server resolves the player ID from the PIN.
- **Krillion:** one iPhone photo/screenshot picker. There is **no Krillion shared-text box**. Run image preprocessing and Tesseract.js locally, preferably in a background Web Worker. Do not transmit screenshot bytes.
- **MapTap:** one multiline text box for pasted `www.maptap.gg Month DD`, five `score+emoji` pairs, and `Final score: ...`.
- Render only the sections chosen in Step 1.

### Step 3 — Extraction Review and Submission

- Clearly display the authenticated player's display name.
- Krillion: editable puzzle number/date, seven answers (including missing-answer support), seven scores/tier emojis, and calculated total. Highlight low-confidence OCR, suspicious values, or disagreements between displayed total and extracted rounds.
- MapTap: editable date/year, five base round scores and captured emojis, weighted contributions, and calculated final total.
- Both games: show explicit validation status. Submission is possible only after confirming a valid result for each selected game.
- Save selected games in a single backend request/transaction after explicit confirmation. Show which game(s) succeeded. On repeat submission for the same player+game+date, do not silently overwrite; send the player to an admin-correction flow or display that it has already been recorded.
- After a successful submission, take the player to the Daily page (or offer a clear View Daily Leaderboards action).

## 4. Scoring and parsing

### Krillion

- Seven levels per puzzle. Allowed scored values: `0, 10, 15, 30, 60, 85, 100`.
- Tier mapping: `🌟=100`, `🏮=85`, `🦑=60`, `🐟=30`, `🤡=15`, `🫧=10`, `⬛=0`.
- Total is the sum of the seven scores; max 700.
- Screenshot uses a visually consistent results layout, but rows can shift if extra notes are present. Implement region detection using anchors/labels plus row-wise crop, not seven hardcoded absolute y coordinates only.
- Extract text and score separately; normalize common OCR artifacts (smart quotes, punctuation, letter confusion) without silently rewriting answers. If confidence is low, flag for manual review.
- Distinguish an unanswered round (`answer=null`) from a submitted answer that received zero (`answer` contains attempted text); both score zero.
- No screenshot stored on-device after the upload workflow completes except temporary in-memory browser state, and none stored in Cloudflare.

### MapTap

- Extract date text, five scores (integers from 0 through 100), five original round emojis, and a final total.
- Verified against all seven user-provided examples: weighted total = `R1 + R2 + 2×R3 + 3×R4 + 3×R5` (max 1,000).
- Preserve original score emojis rather than attempting to derive them from displayed integer scores; displayed score and emoji are not a one-to-one mapping in the supplied examples.
- When the date lacks a year, infer a reasonable year (default current year) and **show it for review** before saving. Do not use upload date as the game date without confirmation.
- MapTap fixtures must remain on their original dates: the sample with score 936 was shared as **October 14**, not October 15.

## 5. Leaderboard layout and ranking rules

### Daily page (both games, stacked)

- Date navigation above the sections: previous/next day and calendar picker.
- Player columns from left to right, sorted by descending **daily** game total. Ties receive equal numeric rank and sort alphabetically within the tie. Not played sorts last, alphabetically, and is distinct from a valid 0-point game.
- Rows: seven Krillion levels or five MapTap rounds. Each player column header shows display name, daily score, daily rank emoji, and numeric rank.
- Krillion level cell: answer text + actual tier emoji and numeric round score.
- MapTap level cell: original round score and original round emoji (not weighted contribution by default); optional tap to see weighted contribution.
- Narrow iPhone screens: horizontally scrollable player columns, sticky level-number column, sticky names/totals header. Prioritize readable text and touch targets over fitting seven users simultaneously.
- Daily rank emoji rules for Krillion by _placement_: 1 🌟; 2 🏮; 3 🦑; 4 🐟; 5 🤡; 6+ 🫧. Valid 0 score or no submission: ⬛, with explicit distinct labels.
- MapTap placement emojis use the agreed illustrative ordered set: rank 1 🎯; 2 🔥; 3 🏅; 4 🏆; 5 🎉; 6 👏; 7 🌞; 8 😁; 9 😂; 10 🫢; 11 🙈; 12+ 😒. These are presentation badges, **not an asserted official MapTap ranking system**. Unplayed/zero handling should be clearly labeled, with a neutral missed/not-played treatment.

### All-Time page (both games, stacked)

- Player columns from left to right, sorted by descending **cumulative** game points; ties share rank and sort alphabetically within the tie; never-played users last and marked unranked/missed.
- Top of each player column: player name, cumulative score, game-specific rank emoji, games played, optionally average per game.
- Rows: dates, latest to oldest; each cell: that game's final daily score or `—` for no submission.
- Rankings independent per game. Today's results appear as soon as saved.

### Movement comparisons

- Each displayed **all-time** rank-change arrow in the clipboard compares current all-time rank against the standings at **23:59:59 of the calendar day before the selected leaderboard date** in the group's chosen timezone, never against the preceding submission during the current day.
- Arrow: `📈` improved numeric rank, `📉` worsened, `➖` unchanged. Treat a player without an earlier rank explicitly (proposed `🆕` or a neutral indicator, pending choice).
- Admin corrections to historical records cause future computed totals and prior-day baselines to update consistently; document this in the audit log.
- For tied ranks, use competition ranking (e.g. 1,1,3) consistently.

## 6. Approved share/clipboard formatting

- No daily/all-time rank emojis in the clipboard (only on the website).
- First line for each player: `#<dailyRank> · <dailyTotal> — <name> [#<allTimeRank> · <allTimeTotal> <movement>]`.
- Second line: Krillion **seven tier emojis only** in round order; MapTap **five numbers only** in round order.
- Include only registered players with a saved submission for that game and selected day, ordered by each game's daily result; omit a game section when no player has submitted it.
- Two game sections: `🦐 KRILLION — #<puzzle>` and `🌎 MAPTAP — <date>`; no standalone all-time sections.
- End after the final MapTap round line. Do not append a divider, footer, or URL section.
- The server should create share text from **approved score-only database fields**. Do not query or format the `answer` column for this feature.
- Open decision: define precisely whether a copy generated later is a snapshot frozen when the player submitted or a snapshot of live standings at the instant the Copy button is tapped. Default proposal: latest standings at tap time, with a fixed prior-day movement baseline.

### Short illustrative extract (not a real record)

```text
📊 DAILY GAMES — OCT 15, 2026

🦐 KRILLION — #92
#1 · 455 — Alex [#1 · 7,460 ➖]
🌟 🏮 🏮 🏮 🦑 🐟 🫧

🌎 MAPTAP — OCT 15
#1 · 925 — Alex [#2 · 17,005 📈]
98 · 93 · 100 · 99 · 79

```

## 7. Admin dashboard

- Hidden `/admin` page, **separate administrator identity** and authentication (prefer strong password plus MFA, not a normal six-digit player PIN); server-side role checks on every admin API.
- User management: add, rename, deactivate/reactivate, provision/reset unique player PIN, view activity. Deactivate rather than delete by default to preserve historical records.
- Results management: filter/search by game, date, puzzle, player; add a missed result; correct answers, scores, date or puzzle; remove invalid or duplicate records with confirmation; automatically recalculate totals/rankings.
- Audit log: who changed what, old vs new values, timestamp, reason when possible. Do not log raw PINs or screenshots.
- Consider CSV/JSON export as a manual backup and recovery feature; keep it admin-only.
- Ordinary users cannot self-edit finalized results. Admin edits are the correction path.

## 8. Technical design

| Layer             | Proposed implementation                                                                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile UI         | React + TypeScript + Vite, responsive CSS, iPhone Safari first                                                                                                                         |
| Hosting           | Cloudflare Pages free plan (`*.pages.dev` subdomain)                                                                                                                                   |
| Backend           | Cloudflare Pages Functions/Workers APIs                                                                                                                                                |
| Database          | Cloudflare D1 SQLite                                                                                                                                                                   |
| Krillion OCR      | Tesseract.js on-device, Web Worker + canvas cropping/preprocessing, English trained data cached                                                                                        |
| MapTap parser     | Pure TypeScript text parser with fixtures and total validation                                                                                                                         |
| Authentication    | PIN-only player flow with keyed, server-secret protected verifier/HMAC lookup, HTTPS, secure HttpOnly sessions, SameSite cookie, rate limiting; admin uses separate strong credentials |
| Image storage     | None; screenshots are never sent to server                                                                                                                                             |
| Deployment        | Git-based Cloudflare Pages build, dev/staging and production databases                                                                                                                 |
| Monitoring/backup | Minimal error logs without sensitive payloads; periodic DB export/backup procedure                                                                                                     |

**Suggested normalized D1 tables:**

- `players`: id, display_name (unique per roster), pin_verifier (unique opaque keyed value), status, created_at.
- `admin_accounts`: id, login identifier, credential verifier/MFA config, status.
- `games`: id, slug (`krillion` / `maptap`), title, round_count, rules version.
- `submissions`: id, player_id, game_id, game_date, puzzle_number nullable, final_total, created_at, updated_at; unique `(player_id, game_id, game_date)`.
- `round_results`: id, submission_id, round_index, answer_text nullable, base_score, score_emoji nullable, weighted_score; unique `(submission_id, round_index)`.
- `sessions`: opaque session-token hash, principal identifier/type, expiry, last_seen.
- `audit_events`: id, admin_id, action, subject_type/id, before/after structured data, timestamp.
- `auth_attempts` (or equivalent): bounded rate-limit counters for attempted PIN verification; do not store plaintext PIN.

Prefer computing ranks from indexed submissions initially, rather than storing fragile running totals; caching/materialized aggregates can be added only if needed. Use D1 transactions/batches for simultaneous submission writes, with duplicate protection enforced in SQL.

## 9. Implementation phases and acceptance criteria

### Phase 1 — Project and database foundation

1. Initialize React/TypeScript/Vite project, style tokens, navigation shell, phone-sized layout.
2. Configure Cloudflare Pages, Pages Functions or Worker, Wrangler and D1; separate local/dev and production environments.
3. Create migrations, seed `games`, include basic export and restore instructions.

**Complete when:** the mobile site deploys, backend health check runs, migrations apply cleanly, and test players can be seeded in development.

### Phase 2 — Authentication and permissions

1. Add admin-created players and unique PIN mapping; implement rate-limited PIN check, secure cookie session and logout.
2. Add admin credentials/role guard and audit-log plumbing.
3. Implement `canViewDailyDetails(player, game, date)` on the server; test each game's independent lock.

**Complete when:** an unsubmitted player cannot retrieve protected round details even by directly calling an API URL, and unprivileged users cannot call admin endpoints.

### Phase 3 — Parsers and verification UI

1. Build MapTap parser + total validator; write fixtures for all seven examples and malformed data.
2. Build Krillion OCR prototype: select image in iOS Safari, detect rows, enhance text, recognize answers/scores, normalize; run against all four supplied screenshots.
3. Build seven-/five-round editable review UI, confidence warnings, strict total validation and missing-answer handling.

**Complete when:** every sample can be entered and corrected to an exact, valid record without sending/storing the image; MapTap totals match all seven examples.

### Phase 4 — Three-step unified submission

1. Game selection -> PIN & chosen inputs -> review & submit.
2. Submit one or both games together, handle duplicate/already submitted rows and date validation, success/failure states.
3. Take users to the daily page with eligible game access unlocked.

**Complete when:** each game can be submitted independently and together; no duplicate player/game/day records are possible; finalized player edits are blocked.

### Phase 5 — Daily and all-time leaderboards

1. Build the two stacked game tables on each page, responsive horizontal scrolling and sticky columns/headers.
2. Add placement badges, ranking/tie rules, not-played states, date navigation, and all-time summary columns.
3. Enforce each day's per-game authorization on the backend.

**Complete when:** seven or more players can be compared on a narrow iPhone; daily columns order by that day's total; all-time columns order by cumulative total; today's all-time totals remain public.

### Phase 6 — Clipboard generator and movement

1. Implement previous-day end-of-day ranking baseline and `📈 📉 ➖` display; test previous-day differences vs same-day submission changes.
2. Build score-only share renderer on the server, copy-to-clipboard button visible after eligible submission, link to daily page.
3. Confirm no Krillion answers, rank-tier emojis, PIN instructions, or standalone all-time sections leak to the clipboard.

**Complete when:** pasted output matches the approved share format for seven players, including missing players and a late submission; movement compares only with the prior day's baseline.

### Phase 7 — Admin tools, polish, and launch

1. Build user management, score correction, add/delete/deactivate, PIN reset, audit history.
2. Test real iPhone Safari behavior: photo picker, large images, orientation/zoom, horizontal table scrolling, cookies, clipboard, slow network and offline errors.
3. End-to-end validation for wrong PINs, malicious requests, wrong dates, duplicate attempts, zero scores, ties, inactive players, late submissions, OCR misses and historical edits.
4. Configure backups, error monitoring, production environment variables and first admin account; deploy on Cloudflare Pages.

**Complete when:** a trusted tester can complete both games in under a minute if OCR succeeds, every sensitive endpoint is permission-checked, admin can repair any incorrect result, and documented backup/restore works.

### Optional Phase 8 — Future enhancements (not V1 launch blockers)

- Home Screen PWA installation / icons, achievements, streaks, compact share variant, game-specific aggregates, new game parser plugin mechanism, guided historical import, better OCR heuristics from real-world screenshots.

## 10. Cost and deployment notes

- Cloudflare Pages static assets: free; Pages free plan includes 500 monthly builds.
- Pages Functions/Workers Free: 100,000 requests per day (with a 10 ms per-invocation CPU budget). OCR runs **client-side**, avoiding that server CPU limitation.
- D1 Workers Free: 5 million rows read/day, 100,000 written/day, up to 5 GB total account storage and **500 MB per free database**. Note that daily row caps are enforced; build efficient indexed queries.
- No R2 requirement (no screenshot storage) and no Workers AI requirement (no paid vision OCR service).
- Expected operating cost for a few friends: **$0/month** inside the above limits, excluding an optional custom domain.
- Sources: https://developers.cloudflare.com/pages/platform/limits/ ; https://developers.cloudflare.com/workers/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/pricing/ ; https://developers.cloudflare.com/d1/platform/limits/ ; https://github.com/naptha/tesseract.js/blob/master/docs/performance.md

## 11. Clarifications to confirm before build

1. **PIN onboarding:** Should admins create/assign each player's unique six-digit PIN, or should players choose their PIN through an admin-issued invitation? **Suggested default:** admin provisions/reset PINs, avoids public registration and duplicate PINs.
2. **Game day and late entries:** Use `America/Los_Angeles` as the group's leaderboard time zone, and allow late historical submissions for a player who had not previously submitted? **Suggested default:** yes, with explicit puzzle/date review.
3. **Share snapshot moment:** Freeze shared standings exactly at successful submission, or generate the latest standings whenever someone taps Copy? **Suggested default:** current standings at Copy time (with rank arrows still fixed against yesterday's final standings).
4. **Newcomer movement:** When a player has no all-time ranking as of the previous day's cutoff, should the share line show `🆕` rather than `➖`? **Suggested default:** `🆕`.
5. **Admin access:** Will there be exactly one admin, and are you comfortable with a separate long password plus a second factor for `/admin`? **Suggested default:** one admin initially, with expandable admin accounts.

## 12. Future change policy

Keep parsers and scoring rules versioned per game. Adding a third game should require one new parser/validator, game configuration, and presentation adapter, without changing the fundamental players/submissions/auth/database access model.
