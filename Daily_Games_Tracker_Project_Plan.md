# Daily Games Tracker — Master Project Plan

> **Current tracking (October 25):** Historical document, not the active queue. Use [PROJECT_STATUS](daily-games-tracker/PROJECT_STATUS.md), the final specification and repository execution plan. Core features/Phase 9 engineering are preview-deployed; Phase 5A/9 gates remain open and final Phase 10 is planned.

> **Superseded historical plan:** Use [the Final Implementation Plan](Daily_Games_Tracker_Final_Implementation_Plan.md) and [the repository execution plan](daily-games-tracker/EXECUTION_PLAN.md). These are the current requirements, including API-owned validation, no game-result hashes, and fresh scoreboard copying for already-saved results from either import endpoint. The older decisions below are retained only as history.

**Specification status:** V1 scope frozen for implementation \
**Updated:** October 20, 2026 \
**Target:** Small private group (initially ~7–15 friends), iPhone-first, free Cloudflare deployment \
**Purpose of this file:** Single source of truth for implementation, testing, deployment, and future expansion

> **Read this first:** This plan **supersedes** the old Phase 1 README's PIN authentication, Krillion screenshot/OCR intake, MapTap manual-paste intake, and three-step manual submission flow. The earlier starter remains a useful frontend/D1 foundation, but it is **not** the final design.

---

## 1. Product goal and success criteria

A lightweight mobile website tracks daily scores, round-by-round performance, and cumulative rankings for **Krillion** and **MapTap**. Each person plays the games on their original websites, then submits directly from the iPhone Share Sheet using **one installed Apple Shortcut** named **Upload Game Results**.

The Shortcut captures the information available on the phone; **Cloudflare** identifies the game, parses the results, validates the score, handles authentication, and updates leaderboards. No screenshot recognition, manual data entry, per-game Shortcut, app-store installation, or normal submission review page is needed.

**Everyday submission:**

1. Complete either game in Safari.
2. **Krillion:** invoke _Safari Share → Upload Game Results_ on the completed results webpage. Do **not** use Krillion's in-game Copy Result/Share.<br>
   **MapTap:** invoke _MapTap's own Share your score → Upload Game Results_. Do **not** use Safari's page Share.
3. Shortcut sends the captured text and its installed credential to `/api/validate`.
4. Cloudflare returns either an actionable error or a concise confirmation summary.
5. Shortcut displays native _Submit Results_ / _Cancel_ options.
6. On Submit, Shortcut sends the same original capture to `/api/submit`.
7. Cloudflare validates **again**, saves once, and replies with success.

**Definition of done:** Seven-plus actual players can enroll, use the same Shortcut on supported iPhones, submit both games without screenshots or manual scores, share score-only standings, view protected answers after playing, and have errors corrected **only by the administrator**. No paid infrastructure required at expected usage.

## 2. Locked product decisions

| Area                  | Decision                                                                                                                                                                               |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms             | Cloudflare-hosted iPhone-first React PWA + one Apple Shortcut; no native iOS app in V1                                                                                                 |
| Hosting               | Cloudflare Pages / Pages Functions (Workers runtime) + D1; free tier targeted                                                                                                          |
| Games                 | Krillion and MapTap at launch; extensible for additional games                                                                                                                         |
| Shortcuts             | **One universal** Shortcut for all supported games, registration, and website login                                                                                                    |
| Source capture        | Krillion completed Safari webpage text; MapTap native Share Sheet text                                                                                                                 |
| Interpretation        | Cloudflare detects, parses, validates; Shortcut does only necessary local capture and UI actions                                                                                       |
| Submission            | Stateless `/api/validate` → Shortcut confirmation → `/api/submit`; **no D1 submission draft or temporary submission ID**                                                               |
| Correction            | **No player edits, overrides, or score-entry fallback**; reject invalid capture; admin-only corrections/backfill                                                                       |
| Accounts              | Invite-only registration; no player email/password, Apple ID login, or PIN                                                                                                             |
| Device registration   | One-time, strong authorization code copied from registration website into Shortcut **Import Question**                                                                                 |
| Multiple devices      | Admin issues a new device invite for existing player; one credential per authorized Shortcut installation                                                                              |
| Device identity       | Random revocable installation credential, **not** an iPhone MAC address or hardware ID                                                                                                 |
| Daily website sign-in | **Login with Device** via existing Shortcut + browser-bound login challenge                                                                                                            |
| Browser login window  | Rolling **7 days** of player activity, enforced by Cloudflare                                                                                                                          |
| Cookie                | First-party server-set `HttpOnly`, `Secure` cookie with nominal **400-day Max-Age**, renewed on website visits; not a guaranteed Safari retention period                               |
| Session renewal       | Successful Shortcut submissions **and** authenticated website activity extend any still-valid associated browser sessions by 7 days                                                    |
| Daily reset           | Midnight in `America/Los_Angeles`, handling PST/PDT automatically                                                                                                                      |
| Ordinary submissions  | **Today only**; admin can enter/correct prior days                                                                                                                                     |
| Ties                  | Competition ranking: 1st / 1st / 3rd; alphabetical column order among ties                                                                                                             |
| Daily page            | Both games; today's detailed table for a game unlocks only after that player submitted that game                                                                                       |
| Old daily pages       | Accessible to signed-in players without needing to have played those past days                                                                                                         |
| All-time page         | Public; both games, separate rankings, includes today's live scores                                                                                                                    |
| Rank movement         | Compare today's current all-time rank with **yesterday's closing all-time rank**, never previous submission in the same day                                                            |
| Copy Leaderboard      | Score-only output for each emitted game section with saved submissions, plus inline all-time standings and movement; no trailing link, Krillion answers, or rank badges in copied text |
| Admin                 | Hidden-from-navigation `/admin` **plus real separate server-side administrator authentication**                                                                                        |

## 3. Existing artifacts and migration approach

The verified existing **Phase 1 starter** archive is `Daily_Games_Tracker_Phase_1.zip` (React/Vite/TypeScript, Cloudflare Pages Functions, initial D1 migration, mobile UI shell, date/rank utilities and tests). Its README dated October 2026 still describes PINs, screenshot OCR, pasted MapTap text, and a manual 3-page submission. Do not treat these as requirements.

**Reuse:** React shell, Vite/TypeScript configuration, styling where useful, Pages/D1 plumbing, `games`, `puzzles`, `submissions`, `round_results`, time utilities, rank utilities, relevant tests, PWA assets.

**Replace:** PIN fields and lookup tables, manual submission screen as the primary flow, screenshot-upload/OCR pipeline, manual MapTap paste pipeline, old account provisioning model, obsolete landing-page copy.

**Add:** player invitations, separate per-install Shortcut credentials, login challenges, browser sessions with activity expiry, two-step stateless submission API, shared parser registry, real leaderboards, score-only clipboard, admin CRUD/audit.

**Important code status:** Only the Phase 1 archive was inspected for this plan; do not assume any subsequently discussed validate/submit implementation is present in that archive. Start implementation by auditing the active repository/branch before applying migrations.

Migrate with **new, versioned D1 migrations**, not destructive production table rewrites. Retain existing historical submissions if any exist. In development, a clean rebuild is acceptable; in production, make reversible/backed-up changes.

## 4. Core user journeys

### 4.1 Admin invites a new player

1. Admin signs into `/admin` and selects **Invite New Player**.
2. Backend creates an unpredictable, single-use **invitation** with expiration (suggested default: 48 hours), stored as a hash.
3. Admin copies its registration link and sends it privately.
4. Invitee opens `/register?invite=...`, chooses an available display name, and confirms account creation.
5. Backend creates a player and issues a **different**, long random _Shortcut installation credential_ (e.g., 256 random bits). The website reveals this credential once and offers **Copy Code**.
6. Page links to the **same universal Shortcut** iCloud installation link for everyone.
7. At installation, Shortcut's **Import Question** requests **Paste your authorization code**. This inserts the code into the person's installed copy.
8. Shortcut calls authenticated APIs using that credential. Optionally show _Connection successful: [name]_ on first call.
9. Registration may simultaneously establish a website session in the browser that completed registration, but this is independent of Shortcut installation.

The registration invite is **not** the ongoing device credential. Avoid including the ongoing credential in URL parameters or logs. The copied credential must be high entropy, because it is a long-lived bearer secret.

### 4.2 Add or replace a device

- Admin selects the existing player → **Add Device**, sends an expiring one-use device invitation.
- The new device receives a newly generated credential and installs the universal Shortcut with that credential.
- Both registered installations remain authorized unless admin revokes one.
- For lost/stolen devices, admin revokes that device's credential and sessions established through it. Existing historical scores remain.
- An installed Shortcut is **not cryptographically locked to physical hardware**; anyone who can extract/copy its stored credential can impersonate the player until revoked.

### 4.3 Submit a completed Krillion dive

- User finishes game; results page displays `DIVE #... COMPLETE`, game total, and seven detailed rounds.
- User taps **Safari's** Share button → **Upload Game Results**.
- Shortcut receives the _Safari webpage_, runs `Run JavaScript on Web Page` against that active page, and returns its visible results text (`document.body.innerText` initially; use structured DOM extraction locally only if needed).
- Shortcut forwards input type, source URL, captured content and version to Cloudflare.
- Cloudflare recognizes completion, puzzle number, exactly 7 ordered rounds, answers including allowed explicit misses, seven canonical scores and reported total.
- Cloudflare checks allowed scores and exact sum; checks puzzle date is today (per authoritative puzzle calendar mapping).
- Shortcut shows player, dive number, ordered round scores and total; **Submit / Cancel**.
- Successful submit stores seven answers + scores. Screenshot never captured/stored.

**Observed sample:** Krillion Dive #97 on 2026-10-20: Margarine 60, Harissa 60, United Arab Emirates 60, Air compressor 30, Hamster 10, Astound 60, Camel 30 = **310**. Existing example Dive #92 on 2026-10-15 sums to **325** and contains zeros; zero/miss handling must be tested in the parser.

### 4.4 Submit completed MapTap

- User finishes game and taps **MapTap's in-game “Share your score”** button.
- Apple's Share Sheet supplies **plain text** to the same Shortcut.
- Shortcut sends that text verbatim to Cloudflare (no OCR or DOM scraping required).
- Cloudflare identifies `www.maptap.gg`, date, five ordered raw scores/emojis and reported weighted total.
- Score formula: `r1 + r2 + 2*r3 + 3*r4 + 3*r5`, max 1000.
- Prompt the same **Submit / Cancel** confirmation.
- Store five scores and original emojis; weight and total are server-calculated/verified.

**Observed sample:** `www.maptap.gg October 20` + `98🔥 80👏 98🔥 91👑 66😔` + `Final score: 845` → **845**. Test the other seven previously supplied examples as fixtures. Emojis can vary for nearly identical integer scores, so **preserve original emoji rather than reconstructing it**.

### 4.5 Wrong share method or incomplete result

Fail closed. **No partially saved results, no user correction form.** Specific errors:

| Condition                                        | Player-facing direction                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Krillion's in-game result summary shared as text | “Incomplete Krillion result. Open completed game in Safari and use **Safari's Share** button.” |
| MapTap Safari webpage shared                     | “Incomplete MapTap result. Use **MapTap's Share your score** button.”                          |
| Game not completed                               | “Finish today's game before uploading results.”                                                |
| Missing Krillion round/answer/score              | “Could not verify all 7 Krillion rounds. Try again or contact admin.”                          |
| Missing MapTap score                             | “Could not verify all 5 MapTap rounds.”                                                        |
| Totals inconsistent                              | “Score mismatch. Nothing was submitted.”                                                       |
| Wrong game day / old puzzle                      | “Only today's completed games can be submitted. Contact admin for history.”                    |
| Exact duplicate already saved                    | Return clear **Already submitted** confirmation, not a second insert                           |
| Different second result same day                 | Reject; admin must correct                                                                     |
| Unsupported game/layout                          | “Game result not recognized. Contact admin.”                                                   |
| Temporary network failure                        | Explain nothing can be confirmed; retry safely and check submitted status                      |
| Credential revoked/invalid                       | Show device registration/support instructions; never accept result                             |

Return stable machine-readable error codes and a **server-authored** message. The Shortcut displays that text via native **Show Alert** and stops.

### 4.6 View daily leaderboard later

- At `/daily`, show Krillion **and** MapTap for chosen date.
- Existing browser session: silently identifies player.
- No valid browser session: show **Login with Device** (not “Login with Shortcut”).
- Today: require a submission for **that specific game** before its full round details are served. Submitting Krillion does not unlock MapTap, or vice versa.
- Past days: any authenticated player can view historical results even if they did not participate.
- Scores in public all-time data and score-only sharing are **not considered spoilers**; Krillion answers are protected.
- Apply access checks **server-side**: do not send unauthorized answers in API results or page HTML.

### 4.7 Log in with device (no password)

1. User opens `/daily` (Safari or Home Screen PWA); website sees no valid session.
2. User taps **Login with Device**.
3. Website creates a random, short-lived (e.g., 2-minute) **login challenge** bound to that browser using a secure browser-bound request identifier; returns a `shortcuts://run-shortcut?...&input=text&text=LOGIN:<challenge>` deep link.
4. **Same universal Shortcut** recognizes `LOGIN:` rather than a game capture, and posts its registered credential + challenge to `/api/login/approve`.
5. Backend authorizes the browser-bound challenge exactly once; no reusable session token passes through the Shortcut URL.
6. Original browser tab/PWA resumes; page polls or offers **Continue**, then `/api/login/complete` sets the browser's own `HttpOnly` session cookie.
7. Page returns to `/daily` and applies the usual per-game participation gate.

**Do not put the real browser session ID in a URL**, JavaScript, or the Shortcut. A short-lived login challenge is distinct from the rejected temporary _score-submission_ drafts; this login challenge is necessary for safe browser handoff.

**Risk/prototype gate:** The `shortcuts://` deep link is supported by Apple, but the exact round trip into an installed Home Screen PWA vs Safari must be tested on real iPhones. Fallback: player manually runs the installed Shortcut's **Login with Device** branch from Shortcuts with a copied challenge code, then returns to the browser.

## 5. Authentication and session rules

### 5.1 Credential model

- Each Shortcut installation has a random, revocable bearer credential.
- Store only a hash of the credential in D1; transmit over HTTPS in `Authorization: Bearer ...`, never in URL/query parameters.
- Shortcut stores its own credential in its editable **Import Question** text field. This is **not secure Keychain storage**, and the token can be read/copied by someone with access to that Shortcut. High entropy + per-install revocation mitigate exposure but do not make it hardware-bound.
- Admin cannot retrieve existing credential; admin can create/revoke/reissue one.
- Rate-limit invitation claims, unknown tokens, repeated authentication failures and abusive import requests.
- A credential cannot authorize admin APIs.

### 5.2 Website session behavior

- Server-created first-party session cookie: `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`; nominal `Max-Age=34560000` (400 days). The browser may remove it earlier under its own policies or user actions.
- D1 `web_sessions` record stores **hash of opaque cookie token**, `player_id`, `approved_by_credential_id`, `last_activity_at`, `expires_at`, `revoked_at`.
- Effective server authorization requires a matching cookie **and** `expires_at > now` and active player/credential status.
- A newly authenticated browser starts with `expires_at = now + 7 days`.
- Authenticated website activity renews `expires_at` by 7 days and can refresh the cookie's browser-side lifetime.
- A **successful Shortcut game submission** renews any of that player's **still-active** browser sessions to `now + 7 days` even with Safari closed. Never resurrect an already-expired/revoked session.
- Validation calls, rejected submissions, and anonymous page views **do not** renew sessions.
- Player can have separate sessions for Safari, installed PWA and multiple phones; login may be needed separately in each context.
- If cookie expires/clears even though a server record remains, the user reauthenticates via **Login with Device**. Historical data remains untouched.
- Deactivating a player or revoking a credential invalidates the relevant Shortcut and browser access.

### 5.3 Admin authentication

Admin pages are absent from public navigation but `/admin` is **not secured by obscurity**. Protect `/admin` and every `/api/admin/*` action with administrator-only server-side authentication and rate limits. Recommendation: Cloudflare Access with only the owner's identity **if compatible with the chosen hostname/free setup**; otherwise implement a single separately authenticated admin account with a strong credential and secure session. Decide/test admin auth before making the admin endpoints reachable publicly. Player credential never grants admin authority.

## 6. Shortcut v1 design

**Name:** `Upload Game Results` \
**Install:** Shared iCloud Shortcut link, identical for every friend \
**Setup:** One Import Question “Paste your authorization code” \
**Share Sheet accepted types:** Safari webpages, Text (and URLs only if useful for classifying user errors; not blindly accepted for scores)

**Top-level routing (in this order):**

1. `Shortcut Input` begins with `LOGIN:` → website-login branch.
2. Incoming Safari webpage from supported game origin → execute small local page-text capture, pass result as source type `safari_webpage`.
3. Incoming plain shared text → forward as source type `shared_text`.
4. Other input → generic unsupported-input alert.
5. `POST /api/validate` with credential, shortcut version and input.
6. `status=invalid` → **Show Alert** using `error_message`; **Stop**.
7. `status=valid` → **Choose from Menu**, prompt using server-returned `confirmation_text`; choices **Submit Results**, **Cancel**.
8. If Submit → `POST /api/submit` with the **same original input**; show server-returned outcome.
9. If Cancel → stop; nothing is saved.

**Local capture must remain necessary and minimal:** Cloudflare cannot read an arbitrary player's live Safari page. `Run JavaScript on Web Page` runs **only on an actual Safari webpage shared into Shortcut**. For Krillion, use `completion(document.body.innerText)` as the proven initial method; server-side parser handles detail. If later game demands different local capture, a new Shortcut version may be necessary.

**Native confirmation:** Cloudflare controls displayed text, score order, player name, validation status, and errors. Shortcuts controls the native menu button layout and styles; we cannot create a custom HTML-like dialog with arbitrary controls in the OS alert.

**Versioning:** include `shortcut_version` in every request. Backend responses may indicate `SUPPORTED`, `UPDATE_AVAILABLE`, `UPDATE_REQUIRED`, plus link to newer iCloud Shortcut. Shared copies **do not auto-update**. Central parser and scoring changes require no Shortcut update if capture route stays the same.

## 7. Cloudflare API contract

Use same-origin Pages Functions (Workers runtime), JSON over HTTPS and parameterized D1 queries. Keep client messages generic about secrets. Example contract (final names may vary consistently during implementation):

### 7.1 `POST /api/validate` (read only)

**Request headers:** `Authorization: Bearer <installation-credential>`; `Content-Type: application/json`

```json
{
  "shortcut_version": "1.0",
  "input_kind": "safari_webpage",
  "source_url": "https://krillion.io/",
  "raw_text": "KRILLION ... DIVE #97 COMPLETE ..."
}
```

`input_kind` is `safari_webpage` or `shared_text`; source URL is an untrusted hint, **not proof of origin**. Game detection must validate actual content. Limit input payload length (e.g., 64 KiB of text), normalize whitespace carefully, and reject HTML/scripts/unrecognized data.

**Successful response:**

```json
{
  "status": "valid",
  "game": "krillion",
  "game_day": "2026-10-20",
  "puzzle_number": 97,
  "player_name": "Alex",
  "round_scores": [60, 60, 60, 30, 10, 60, 30],
  "total": 310,
  "confirmation_text": "Krillion #97\nPlayer: Alex\nScores: 60 · 60 · 60 · 30 · 10 · 60 · 30\nTotal: 310\n\nSubmit these results?"
}
```

**Invalid response:**

```json
{
  "status": "invalid",
  "code": "KRILLION_WRONG_SHARE_METHOD",
  "error_message": "Incomplete Krillion results. Use Safari's Share button on the completed game page. Nothing was submitted."
}
```

HTTP status and JSON `status` should be handled robustly for application errors, network failures, authentication failures and rate limits. Do not return raw stack traces or user secrets.

### 7.2 `POST /api/submit` (single atomic write)

Same auth header and the **same original payload** as `/api/validate`. Reauthenticate, redetect, reparse, revalidate **today**, and enforce uniqueness before insertion. There is **no cached draft or D1 write in `/api/validate`**.

Create or find game-day puzzle, insert one submission, insert all seven/five round rows transactionally. Use database constraints to prevent races and duplicate results. Return:

```json
{
  "status": "success",
  "game": "krillion",
  "game_day": "2026-10-20",
  "total": 310,
  "message": "Krillion #97 submitted successfully!"
}
```

- If the exact submitted canonical result is already present: return a safe `already_submitted` success-like response (useful after network timeout).
- If a different result was previously submitted for that game/day: reject with `ALREADY_SUBMITTED_DIFFERENT`; user must contact admin.
- Optional small improvement: `/api/validate` returns a canonical content digest that `/api/submit` compares with the repeated raw input, preventing **accidental** changes between confirmation and save, with no database draft. Server still validates everything independently.
- Consider the midnight boundary: if a user validates at 11:59:59 PM Pacific and submits after midnight, **reject with clear date error**, rather than silently attributing a result to a different day.

### 7.3 Website authentication endpoints

| Endpoint                   | Purpose                                                                 |
| -------------------------- | ----------------------------------------------------------------------- |
| `POST /api/login/start`    | Create short-lived browser-bound challenge                              |
| `POST /api/login/approve`  | Shortcut's credential approves that challenge                           |
| `GET /api/login/status`    | Original browser checks whether approved (without receiving credential) |
| `POST /api/login/complete` | Same initiating browser consumes approval; sets secure session cookie   |
| `GET /api/auth/me`         | Current browser user/session status                                     |
| `POST /api/auth/logout`    | Revoke browser session and clear cookie                                 |

Make challenge one-use, short-lived and bound to an initiating browser secret/cookie. Rate-limit creation and polling. Avoid open redirects and login CSRF. Small temporary **login** records in D1 are acceptable; they are not gameplay drafts.

### 7.4 Leaderboards and sharing

| Endpoint                                     | Access                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /api/games`                             | Public                                                                               |
| `GET /api/leaderboards/all-time`             | Public, includes both games                                                          |
| `GET /api/leaderboards/daily?day=YYYY-MM-DD` | Authenticated; returns each game's detail only if authorized for day/game            |
| `GET /api/leaderboards/share?day=YYYY-MM-DD` | Authenticated and eligible to copy that day's standings; returns **score-only** text |
| `GET /api/health`                            | Public sanitized uptime/schema info only                                             |

For today's daily view, require that authenticated player submitted **that game** today before sending details. Do not rely on frontend hides. For past dates, authenticated access is sufficient. Keep aggregate all-time scores public.

### 7.5 Admin endpoints

Minimum: admin login/status/logout (or Access integration), player create/rename/deactivate, invitation creation/revocation, device invitation, list/revoke credentials, list/edit/delete/backfill submissions, audit history, optional score history/export. Require admin authentication on **every** handler.

## 8. Parsing and scoring specifications

### 8.1 Parser architecture

Create a server-side registry of independent adapters:

```text
GameParser = {
  id, detect(input), parse(input), validate(parsed, gameDay),
  formatConfirmation(parsed), formatShareRows(parsed)
}
```

Game detection should consider capture type and recognizable content, not an asserted `game` field from the Shortcut. Reject ambiguous matches. Keep scoring rules and ranking icons in configurable game metadata.

### 8.2 Krillion

- Detect game branding, completed dive number, final total, and final-results/Dive Log area.
- Parse exactly **seven** ordered numbered rounds, each with its answer text and integer score.
- Extract/retain round question/prompt **when reliably available** (useful for historical comparison); optional for V1 if not stable.
- Ignore player counts, depth in meters, other game promotions, unexpanded summaries, and general page chrome.
- Allow explicit zero/miss round with empty answer where the completed game represents it that way; don't treat an OCR-style missing field as an intentional miss.
- Allowed score values confirmed in observed examples: `0, 10, 15, 30, 60, 85, 100`. Keep mapping versioned/configurable, and verify official game changes before widening it.
- Enforce `sum(round_scores) == reported_total` and score range.
- Confirm today/puzzle number using an authoritative mapping or admin-configured anchor (observed `#97 = 2026-10-20`; `#92 = 2026-10-15`). Do not trust local device time.
- Map each individual round score to its Krillion tier emoji in tables/share: `100 🌟`, `85 🏮`, `60 🦑`, `30 🐟`, `15 🤡`, `10 🫧`, `0 ⬛`.
- **Do not** rely on user-controlled editable answers or manual overrides.

### 8.3 MapTap

- Detect `www.maptap.gg` and a month/day heading, five score+emoji tokens, and `Final score: N`.
- Year is absent in share text; infer using **today's Pacific year/date** and require exact day match. Handle Dec/Jan boundaries deliberately; do not accidentally accept last year's result.
- Parse exactly five raw integers in `[0,100]` in order; preserve emoji strings without deriving them from scores.
- Weighted total is `r1+r2+2*r3+3*r4+3*r5`; must match stated total (0–1000).
- Store original emoji for game history/UI; copied leaderboard shows **numbers only**, not round emojis.
- Verify every previously supplied MapTap share as fixture: six from 2026-10-15 (totals 761, 877, 925, 915, 895, 720), one from 2026-10-14 (936), one from 2026-10-20 (845).

### 8.4 Authenticity limitation

Because the Shortcut and text inputs run on a player's own phone, an intentionally modified Shortcut could submit fabricated but internally consistent results. This app provides **strict consistency/completeness checks, not publisher-signed proof of genuine gameplay**. For the friends-only setting that is an accepted limitation; it is not a reason to introduce manual player corrections.

## 9. Leaderboard UI and ranking rules

### 9.1 Site navigation

`/` landing/home, `/daily`, `/all-time`, `/register`, `/login`, `/admin` (admin not linked publicly). No full manual `/submit` form is required for regular players; old `/submit` should redirect to instructions for using Share Sheet, or be removed.

Mobile-first iPhone layout, readable system fonts, safe-area padding, smooth horizontal scrolling, sticky round/date labels and player headers where practical. PWA manifest/icons and Add to Home Screen supported. No dependence on a game iframe.

### 9.2 Daily page

- Page contains **two separate tables** (Krillion then MapTap) for chosen date, with a date selector.
- **Columns = players**, sorted left to right by that day's total descending; alphabetical among ties. Nonplayers at far right alphabetical.
- **Rows = levels** (Krillion seven, MapTap five).
- Krillion cell = answer + actual round emoji + points. MapTap cell = raw score + original emoji (weighted contribution available as supplementary detail if desired).
- Player header = rank emoji, name, daily total. Don't put player total in an extra right-hand column.
- **Zero actual submission** remains a valid score distinct from **not played** (`null`).
- Today: per-game details locked until authenticated player has submitted that same game. Historical: signed-in players may see the full table even if they missed that day.
- Krillion daily **rank badges** by placement: `#1 🌟`, `#2 🏮`, `#3 🦑`, `#4 🐟`, `#5 🤡`, `#6+ 🫧`; submitted zero and not-played display `⬛` (distinguish with `0` vs `Not played` text).
- MapTap site uses **MapTap-themed rank emojis** (not copied into clipboard). Initial rank sequence from previous design: `🎯 🔥 🏅 🏆 🎉 👏 🌞 😁 😂 🫢 🙈 😒`; below last defined rank, repeat final tier. **Confirm this as a presentation-only ordering**; it has not been verified as MapTap's official score buckets. Use `—` for nonplayers.
- Tied players share the same ordinal rank and corresponding rank badge, despite alphabetical column positioning.

### 9.3 All-time page

- Also contains **both games**.
- Player columns sorted by **cumulative points for that game** descending, alphabetical among ties; latest calendar dates at top.
- Player header shows all-time rank emoji, display name and cumulative score, optionally games played and average as secondary metadata.
- Each row is a date, each cell is that player's **daily total**; nonparticipation is blank/`—`, not zero.
- All-time is publicly readable with live same-day totals and **no spoiler-protection filtering**.
- All-time ranking is independent for each game. Players with no games played stay far right; for Krillion show miss rank marker; otherwise use sensible no-play placeholder.
- Use separate cumulative rankings, never sum MapTap points with Krillion points.

### 9.4 Previous-day rank movement

For a requested share on day D:

1. Compute **current** cumulative points and ranks from submissions with `puzzle_day <= D` as of the clipboard generation time.
2. Compute **baseline** cumulative points/ranks from submissions with `puzzle_day < D` (through end of day D−1 in Pacific Time).
3. Compare current all-time rank to previous-day rank: lower number `📈`, higher `📉`, equal `➖`.
4. New players with no prior rank: use neutral `🆕` or `—` (presentation default `—`); don't claim movement.
5. **Never** compare to the previous submission during D. All copies made during D use the **same prior-day cutoff**, though current totals/ranks can change as submissions arrive.
6. After historical admin corrections, recompute affected cumulative ranks/baselines from corrected data, or rebuild materialized rank snapshots if used. Small group can calculate directly from D1; no background job required.

### 9.5 Copy Leaderboard output — approved format

- On `/daily`, button **Copy Leaderboard** becomes available after the signed-in player submits at least one game for that selected day.
- Includes each game section only when at least one active player has a saved submission for the selected day, and lists only players with a saved submission for that game and day.
- Shows for each player: `#daily_rank · daily_total — Name [#all_time_rank · all_time_total movement]`.
- **No site rank badge emojis in any ranking line.**
- **Krillion second line = 7 round emojis only** (no numeric per-round scores, no answers).
- **MapTap second line = 5 round numbers only** (no emojis).
- **No separate all-time sections.** All-time ranks, totals, and movement appear **inside brackets beside each name**.
- End after the final MapTap round line; do not append a divider, footer, or URL section.
- Clipboard is a text snapshot generated at copy time (typically immediately after submission), not a persisted editable leaderboard.
- Server generates output from score-only data; do **not** fetch Krillion answers and strip them client-side for copying.

**Illustrative abbreviated share:**

```text
📊 DAILY GAMES — OCT 20, 2026

🦐 KRILLION — #97
#1 · 455 — Alex [#2 · 7,810 📈]
🌟 🏮 🏮 🏮 🦑 🐟 🫧

#2 · 430 — Sam [#1 · 7,925 ➖]
🌟 🏮 🏮 🦑 🦑 🐟 🫧

🌎 MAPTAP — OCT 20
#1 · 936 — Chris [#2 · 18,520 📈]
99 · 100 · 88 · 88 · 99

```

Names, scores and ranks in the sample are placeholders. Real output must contain **all** players, ordered by each game's daily rank, with real live data.

## 10. Data model / migration

Use integer score columns and UTC timestamps; use `YYYY-MM-DD` Pacific puzzle day as a **separate indexed field**. Suggested D1 entities:

| Table                         | Main fields / constraints                                                                                                              |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `players`                     | `id`, case-insensitive unique `display_name`, active flag, timestamps; **no PIN/password**                                             |
| `games`                       | `id`, name, icon, round count, parser id/config, active flag                                                                           |
| `puzzles`                     | `id`, `game_id`, Pacific `puzzle_day`, optional `puzzle_number`; unique game/day and sensible puzzle number constraint                 |
| `submissions`                 | `id`, `player_id`, `puzzle_id`, total, creation/admin edit metadata, `UNIQUE(player_id,puzzle_id)`                                     |
| `round_results`               | `submission_id`, `round_number`, Krillion answer/question where available, `raw_score`, MapTap original emoji; unique submission/round |
| `registration_invites`        | token **hash**, mode `new_player` or `add_device`, optional existing player reference, expiry, redeemed timestamp, created-by admin    |
| `device_credentials`          | `id`, player, token **hash**, friendly device label (optional), creation, last use, revoked timestamp                                  |
| `web_sessions`                | cookie-token hash, player, credential origin, created/last activity/expiry/revocation                                                  |
| `login_challenges`            | random challenge hash/id, initiating browser secret binding, status, expiry, approving credential, consumed timestamp                  |
| `admins` / admin auth mapping | Dedicated admin identity or external Access policy                                                                                     |
| `admin_audit_log`             | who, action, object, before/after redacted details, timestamp, correction reason                                                       |
| `app_meta`                    | schema/parser/config version, optional Krillion puzzle date anchor                                                                     |

Key database rules:

- Preserve immutable original submitted round data except **audited administrator** corrections.
- `UNIQUE(player_id,puzzle_id)` and FK integrity; submit all related writes atomically (use D1 batch/transaction-supported approach and test rollback semantics).
- D1 schema migrations are versioned; do not keep old `pin_lookup_hash`, `pin_salt`, or `pin_verifier_hash` as live auth requirements.
- Keep secrets, invite tokens, browser tokens and credential plaintext **out of logs/audit content**.
- Index `puzzles(game_id,puzzle_day)`, `submissions(player_id,puzzle_id)`, `submissions(puzzle_id,total_score)`, `device_credentials(token_hash)`, `web_sessions(token_hash,expires_at)`, `registration_invites(token_hash)`, `login_challenges(expiry)`.
- Default remove-user behavior = **deactivate**, not delete historical scores; current public leaderboard treatment of archived players should be confirmed during admin UX implementation.

## 11. Admin dashboard

Route `/admin` is not publicly navigated but is protected separately. Features:

1. **Players:** view/create/invite, rename, deactivate/reactivate, optional archive; uniqueness validation.
2. **Invitations:** copy new-player invitation link, add-device invitation for existing player, view status/expiry, revoke unused invites.
3. **Authorized devices:** list per-player installation credentials (without displaying secret), last used, revoke one or all.
4. **Scores:** filter by game/date/player; inspect 7 or 5 rounds; admin edit/correct scores and Krillion answers; manually backfill prior games; delete erroneous submission with confirmation.
5. **Integrity:** require correction reason; enforce score sum/MapTap weighting on corrected records; when changing official total, reconcile rounds in same admin operation.
6. **History:** audit before/after redacted changes and login/access revocations; undo practical corrections if needed.
7. **Operations:** parser version/current game config, safe feature flags, failing extraction error counts without collecting private credentials, manual database backup/export tools.

Admin edits immediately affect daily/all-time rankings and clipboard output; derived rank movement also recomputes using updated historical data.

## 12. Security, privacy, reliability and constraints

- Do not trust source URL, Shortcut input type, client total, player name, rank or device label for authorization. Identify player only from validated credential/session; revalidate game result on `/api/submit`.
- Do not write gameplay on `/api/validate` and do not store temporary submission drafts.
- Never persist screenshots, or store game-page raw text by default. Store only structured game results and necessary audit information.
- Endpoints use TLS; credentials in Authorization header, not query strings; cookies HttpOnly/Secure/SameSite.
- Rate-limit invitation endpoints and repeated invalid credentials, require CSRF protection for cookie-authorized mutations, and use short-lived browser-bound login challenges.
- Displayed confirmation is informational; changes to server parsing rules between `/validate` and `/submit` must not silently change score accepted. Short execution gap makes this unlikely; optionally compare a stateless canonical digest returned by validation.
- Database write is idempotent on canonical result; handle network retries explicitly.
- Distinguish zero-point completed game from not submitted.
- Preserve date semantics in Pacific Time; test midnight PST/PDT, historical dates, and past-dated imports.
- Unknown game version, partial DOM text or unexpected Unicode answer fails closed, with specific diagnostics.
- **Important external limitation:** publisher sites and their sharing formats can change; shortcuts do not gain privileged browser access to MapTap from its Share Sheet or to iframe DOM. The chosen local share methods were tested with real examples, but must be regression-tested on live game versions.
- The iCloud Shortcut install answer/credential is inspectable by someone with device/Shortcut access; do not describe it as hardware-locked or Keychain-protected.
- Free services have quotas; D1/Workers quota errors need graceful handling, not misleading “submitted” messages.

## 13. Cloudflare free-tier operating plan

Use a single Pages project with Pages Functions + one D1 database. No R2 screenshot storage, no paid vision API, no separate always-running server, no Apple Developer Program subscription, no email delivery provider required (admin sends invite links manually).

As documented in October 2026:

- **Workers Free:** ~100,000 requests/day; **10 ms CPU per request** (benchmark parsing and security work on real runtime).
- **D1 Free:** 5 million rows read/day, 100,000 rows written/day, 5 GB across account, **500 MB per free database**.
- Free D1 daily caps are enforced; exceeding them causes D1 requests to fail until reset.

For 7–15 players submitting two games each per day and occasionally reading boards, expected usage is far below those quotas. This is a **budget expectation, not a guarantee**: benchmark CPU time and verify actual billing settings before deployment.

**References:**

- Apple Shortcut Import Questions: https://support.apple.com/en-mt/guide/shortcuts/apdf330fd3a0/ios
- Apple `Run JavaScript on Web Page`: https://support.apple.com/en-au/guide/shortcuts/apdb71a01d93/ios
- Apple Shortcut URL scheme: https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios
- Apple native menu/alert actions: https://support.apple.com/en-gb/guide/shortcuts/apd081d9d61f/9.0/ios/26
- Cloudflare Workers limits: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare D1 pricing: https://developers.cloudflare.com/d1/platform/pricing/
- Cloudflare D1 free database limits: https://developers.cloudflare.com/d1/platform/limits/

## 14. Execution sequence, milestones, and acceptance tests

### Phase 0 — Audit and reconcile current code (**first action**)

**Work:** Inspect actual repository; preserve useful Phase 1 shell/tests; catalog already-implemented endpoints; decide migration strategy; remove obsolete PIN/screenshot/manual-flow assumptions from active requirements.

**Gate:** One running local project; schema and docs reflect updated architecture; no undocumented score-writing endpoint exposed.

### Phase 1 — Parsers and scoring (build/test before user accounts)

**Work:** Pure Krillion and MapTap parsers + fixtures, strict completeness checks, Pacific-date functions, game registry and server-authored confirmation messages. Implement parser tests that do not need production D1.

**Gate:** Pass all 8 provided MapTap examples plus Krillion #97 and #92 (including zero/miss). Reject wrong-method text, unfinished games, malformed data, unexpected answer Unicode/punctuation, and mismatched totals. Test server CPU on representative captures.

### Phase 2 — Database and secure device registration

**Work:** Migrate players off PINs, add hashed device credentials/invites, invitation redemption UX, multi-device support and revocation, admin seed/credential bootstrap in secure config.

**Gate:** Invitation creates only one player; same invitation cannot be reused; installed code authorizes expected player; revoked code fails; adding second device doesn't duplicate player; logs never expose secrets.

### Phase 3 — Universal Shortcut and stateless submission API

**Work:** Build one share-sheet Shortcut with Import Question, Krillion Safari JavaScript branch, MapTap shared-text branch, `/api/validate`, dynamic native confirmation, `/api/submit`, errors/retries/version. Create real shareable iCloud Shortcut link **from an iPhone/Mac** and verify its sharing settings.

**Gate:** On actual iPhone: both games → native confirm → server insert; Cancel → zero writes; wrong share method → specific error; duplicate request → one submission; incomplete/mismatched inputs rejected; no manual player edit. Test older available iOS.

### Phase 4 — Browser sign-in and seven-day rolling sessions

**Work:** `Login with Device` browser-bound challenge and Shortcut deep link, site session cookies/renewal, session revocation, PWA context testing.

**Gate:** Browser can sign in without passwords/PIN; player cookie has no secret readable by JS; shortcut submission extends **active** server session for seven days; expired session can't resurrect silently; lost cookie triggers easy login; first-party Safari vs Home Screen PWA both verified.

### Phase 5 — Combined leaderboard pages

**Work:** Daily and all-time tables for both games, horizontally scrolling player columns, rankings, ties, no-plays and zero scores, historical date navigation, per-game access checks. Make frontend iPhone-first.

**Gate:** Correct ordering and placement badges, 1/1/3 ties, historical ranks and current scores, unauthorized current Krillion answers never returned by API, public all-time uses today's live totals.

### Phase 6 — Clipboard output + previous-day movement

**Work:** Generate the exact score-only copied message for emitted game sections with saved submissions, all-time bracket format, last-day movement, and protected link. Clipboard via browser user gesture.

**Gate:** No Krillion answer appears in copied string; Krillion per-round emojis only; MapTap per-round numbers only; no rank emojis; no separate all-time block; includes only players with saved submissions for emitted game sections; arrows compare prior **calendar day**, not most recent same-day submission. Copy from real iPhone Safari/PWA.

### Phase 7 — Admin dashboard + historical correction

**Work:** Secure admin authentication, invites/devices/player management, backfills, corrections, deactivation, audits, re-ranking, operational error view.

**Gate:** Admin can safely correct historical score and see boards/movement update; player APIs cannot edit; disabled player/device blocked; missing device invite expires; audit entry shows before/after without secrets.

### Phase 8 — Launch hardening and rollout

**Work:** Production D1 migration, test deployment, CSP/cookie/CORS checks, QA on multiple iPhone/iOS versions, backup strategy, iCloud Shortcut link distribution, install guide. Enroll 1–2 pilots before all friends.

**Gate:** Two consecutive days of successful real submissions from pilot phones for both games; launch checklist complete; no wrong-method cases silently succeed; admin recovery tested; free-tier use monitored.

## 15. Test matrix (must automate where possible)

**Parser:** All known examples, Krillion 7 rounds including zeros, answer with newlines/punctuation/digits/Unicode, MapTap emoji variation, different whitespace, invalid/missing token, extra unrelated page text, wrong site, hidden/unfinished results, score mismatch, old date, end-of-year.

**API:** Unauthorized credential; revoked credential; fake game field; tampered raw text; validation no write; confirmation cancel no write; atomic submit; identical retry; changed duplicate rejection; concurrent duplicate submit; request payload cap; error message accuracy; rate-limit behavior; logging redaction.

**Rankings:** Every score tie combination, 1/1/3, alphabetical ties, missing vs zero, only one player, archived users, all-time cumulative calculations, previous-day baseline, admin historic corrections, multiple submission times on same day, daylight saving transitions.

**Web sessions:** Browser login deep link round-trip, challenge replay/expiry, browser binding, Safari vs standalone PWA, 7-day server rolling expiry, refresh by Shortcut submit, no revival of expired sessions, 400-day nominal cookie/early browser purges, admin revocation, CSRF, no answer leakage via network responses.

**iOS:** MapTap _in-game_ Share Sheet text intake; Krillion _Safari_ Share text extraction; wrong-method messages; Import Question once; display confirmation text; Submit/Cancel choices; Share Sheet permissions; older supported iOS; network offline; slow network; repeated shortcut install; multi-device revocation.

**Clipboard:** Copy text on iPhone, format exact, correct daily/all-time figures, no answer leaks, working protected deep link, acceptable message length in chat apps.

## 16. Out of scope for V1

- Native iPhone app or App Store/TestFlight distribution.
- Hosting games in an iframe or scraping their private internals from Cloudflare.
- OCR/image storage/screenshot submission (unless the project is consciously rescoped in future).
- User email/password login, Sign in with Apple, or PIN-based accounts.
- Manual score editing or game submission by ordinary players.
- Automatically verifying results directly with game publishers.
- Background sync, push notifications, betting, payments, social profiles, complex per-device fingerprinting.
- Shortcut auto-updating or creating unique per-user iCloud Shortcut artifacts.

## 17. Operational playbook / future games

1. Collect several real share samples from the proposed new game.
2. Verify the existing Shortcut can capture required content using **shared text** or **Safari page text**.
3. If yes, add a **server-only parser** + score validator + game configuration + leaderboard table; all existing Shortcut installs continue working.
4. If a different local capture method is required (image, canvas, direct browser access, special permissions), update the universal Shortcut to v2 and distribute a new link. Installed copies do **not** auto-update.
5. Deploy behind a test flag, test multiple real submissions and wrong-method errors, then enable game for users.
6. Provide central error messaging and track parser-version failure counts without logging credentials or full raw answers by default.

## 18. Open implementation details (not product blockers)

These are to be resolved by testing rather than adding user-facing complexity:

1. **Admin sign-in**: Cloudflare Access vs one strong self-managed admin account, based on actual deployment hostname/features.
2. **Krillion parser selectors/zero rounds**: current Safari `innerText` extraction works for observed complete page, but multiple real zero/miss pages need fixtures and targeted structural parsing if ambiguous.
3. **Krillion puzzle-to-date mapping**: confirm official daily numbering/reset behavior from consecutive days and preserve an admin-configurable anchor.
4. **MapTap rank badge order**: site-only emoji order is a presentation convention, not yet verified as official thresholds; keep configurable.
5. **Inactive-player visibility**: retain scores; choose whether deactivated users remain visible in public historical/all-time boards or only archived records.
6. **iOS deep link/PWA return**: prototype real `Login with Device` flow from Safari and Home Screen app before launch; support fallback return/Continue button.
7. **Free CPU performance**: benchmark Workers Free 10 ms CPU constraint with parsing, credential hash checks and D1 queries.

**Implementation priority:** Phase 0 → Phase 1 → Phase 2 → Phase 3 to prove complete real-game submissions, then site login, leaderboards, copy and admin. Do not polish the leaderboard while the capture/auth path is unverified.

---

## Final acceptance checklist

- [ ] Single distributed Shortcut, configured once with player-specific authorization code
- [ ] No PIN, email/password or Apple ID needed for ordinary players
- [ ] New players join via admin invite; second device via admin device invite
- [ ] Krillion Safari page results parsed (all 7 answers/scores) without screenshot/OCR
- [ ] MapTap native Share Sheet results parsed (all 5 scores) without paste
- [ ] Wrong share method / incomplete / invalid / old-day results clearly rejected
- [ ] Cloudflare validate read-only; submit revalidates and writes atomically without drafts
- [ ] Native Shortcut confirmation has Submit/Cancel; no player-edit form
- [ ] Rolling 7-day D1 browser sessions, Safari first-party cookie, Login with Device recovery
- [ ] Daily page includes both games and enforces today-per-game unlock server-side
- [ ] Public all-time page includes both games and today's scores
- [ ] Correct game-themed badges, tie ranking 1/1/3, zero vs missing, alphabetical ordering
- [ ] Copied message includes daily + bracketed all-time figures, previous-day arrows, game-specific compact rounds and protected link
- [ ] Copy has no rank emojis, Krillion answers or separate all-time section
- [ ] Secure `/admin` manages invites/devices/players/manual corrections/audit
- [ ] Real iPhone compatibility and free Cloudflare usage validated prior to rollout
