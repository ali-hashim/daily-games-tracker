# Winstitute of Higher Thinking — Final Implementation Plan

**Document status:** Final implementation specification \
**Last updated:** October 25, 2026
**Time zone:** `America/Los_Angeles` \
**Supersedes:** Every earlier plan, prototype specification, and authentication design for this project

This file is the complete, self-contained implementation plan for Winstitute of Higher Thinking. It does not rely on another plan or on the prior conversation. Where an implementation detail remains dependent on real-device behavior, this file states the required proof test and the fallback.

**Current status — October 25, 2026:** Core features through Phase 8 and Phase 9 hardening are implemented and preview-deployed (944ff1a6). Production remains undeployed. Phase 5B closed under bounded acceptance; Phase 5A formal closeout and Phase 9 launch gates remain open. **Phase 10 User page/tab is implemented, independently reviewed, and preview-deployed at `3e7e7979`; physical-device/native evidence remains open.** See [PROJECT_STATUS.md](daily-games-tracker/PROJECT_STATUS.md) and [Phase 10 evidence](daily-games-tracker/reports/phase10-user-page-verification.md).

---

## 1. Product summary

Winstitute of Higher Thinking is an iPhone-first progressive web app for a private group of friends who play daily games. Version 1 supports:

- **Krillion** — seven rounds. Capture the completed result page from Safari, retain each prompt, answer, score, and the final score.
- **MapTap** — five rounds. Capture the text supplied by MapTap's native iOS Share Sheet, retain each raw round score and original emoji, and verify the weighted final score.
- One universal iOS Shortcut named **Upload to WHT**.
- Passwordless, invitation-only player registration.
- A private authorization code pasted once into the Shortcut during installation.
- A website **Login with Device** flow that uses the registered Shortcut.
- Combined daily and all-time leaderboard pages containing every supported game.
- A score-only clipboard format that can be shared without exposing Krillion answers.
- A protected administrator page for players, registered devices, submissions, corrections, and audit history.

The system runs on Cloudflare Pages, Pages Functions/Workers, and D1. Screenshots, OCR, player passwords, player PINs, email accounts, Apple ID sign-in, and native iOS app distribution are not part of Version 1.

### Primary user experience

After one-time setup, a normal submission is:

1. Finish a game.
2. Share to **Upload to WHT**.
3. Read the native iOS confirmation supplied by Cloudflare.
4. Choose **Submit Results**.
5. The Shortcut copies the server-generated score-only scoreboard, then shows “Upload successful. Scoreboard copied to clipboard.” with Close and Open WHT choices.

If this player already has a result saved for the same game/day, validation returns already_submitted. The Shortcut skips confirmation and submit, copies the latest server scoreboard and shows “You already have a result saved for this game today. Scoreboard copied to clipboard.” with Close / Open WHT. The saved result is unchanged. A repeat detected by submit follows this same completion flow.

There is no required website review step and no player-editable correction form.

---

## 2. Final product decisions

These decisions are fixed for Version 1.

### 2.1 Accounts and devices

- Registration is **admin-invitation only**. There is no open signup.
- Players do not have PINs, passwords, email-based accounts, or Apple ID accounts.
- A player may have multiple registered Shortcut installations/devices.
- Each installation receives a long, random authorization code.
- The player copies the code from the registration page and pastes it once into the Shortcut's Apple **Import Question** during installation.
- The configured Shortcut stores the code in readable form. This is an accepted convenience/security tradeoff for a small friends-only group.
- Cloudflare stores only a hash of the authorization code.
- Administrators can revoke one device without deleting the player or their history.
- A replacement or second device receives a new invitation and a new authorization code.

### 2.2 Submission rules

- Players may submit only the current Pacific-calendar-day puzzle through the Shortcut.
- Only an administrator may add historical results.
- A player may submit each game once per game day.
- Every valid repeat attempt for the same player/game/day returns status already_submitted, “You already have a result saved for this game today.” and a fresh server scoreboard for copying. Duplicate validation skips confirmation and submit and enters the Close / Open WHT completion flow. No result comparison or hashing is performed.
- Identical and different repeat results receive the same already-saved notice. The existing record is never overwritten; corrections require an administrator.
- Players cannot edit, override, or manually enter extracted results.
- If extraction is incomplete or inconsistent, nothing is saved.
- If a player cancels the confirmation menu, nothing is saved.
- The administrator can correct or delete a finalized submission, with every change recorded in the audit log.

### 2.3 Daily access and spoilers

- The daily leaderboard requires an authenticated website session.
- For the current day, each game's detailed daily table unlocks independently.
- A player can see the current Krillion detail table only after submitting that day's Krillion result.
- A player can see the current MapTap detail table only after submitting that day's MapTap result.
- Submitting one game does not unlock the other game's detailed table.
- Historical daily tables are viewable by any authenticated player, even if that player did not participate on that historical date.
- The all-time leaderboard is public and always includes all results submitted so far, including today's results.
- The score-only clipboard output intentionally emits only game sections with saved submissions and does not enforce the detailed-table spoiler locks.

### 2.4 Ranking

- Daily ranks use descending daily totals.
- All-time ranks use descending cumulative totals within each game.
- Ties use competition ranking: `1, 1, 3`.
- Players tied on score share a rank; their columns are ordered alphabetically.
- Players who have not played the selected day appear at the far right, alphabetically, with a null result rather than a zero.
- A valid submitted score of zero remains a played result and is distinct from not playing.
- All-time movement compares the current all-time rank with the rank calculated through the end of the previous Pacific day. It never compares with the prior submission made today.

### 2.5 Site ranking badges

Ranking badges are shown on the website but omitted from the copied share text.

**Krillion leaderboard placement badges**

| Rank/status                      | Badge | Label             |
| -------------------------------- | ----: | ----------------- |
| 1                                |    🌟 | One in a Krillion |
| 2                                |    🏮 | Deep Cut          |
| 3                                |    🦑 | Rare              |
| 4                                |    🐟 | Schooler          |
| 5                                |    🤡 | Too Clever        |
| 6 and below, if played           |    🫧 | Plankton          |
| Current-day submitted total of 0 |    ⬛ | Miss              |
| Not played / never played        |    ⬛ | No result         |

**MapTap leaderboard placement badges**

The website uses MapTap-themed emojis as placement badges. Version 1 seeds the ordered placement list below. It is configuration, not game-score logic, so it can be changed centrally without altering the database schema or Shortcut.

| Rank                      | Badge |
| ------------------------- | ----: |
| 1                         |    🎯 |
| 2                         |    🔥 |
| 3                         |    🏅 |
| 4                         |    🏆 |
| 5                         |    🎉 |
| 6                         |    👏 |
| 7                         |    🌞 |
| 8                         |    😁 |
| 9                         |    😂 |
| 10                        |    🫢 |
| 11                        |    🙈 |
| 12 and below, if played   |    😒 |
| Not played / never played |     — |

MapTap round-result emojis are separate from placement badges. The original round emoji received from MapTap must be stored and displayed exactly, including emojis not present in the placement list.

---

## 3. Scope and non-goals

### 3.1 Included in Version 1

- Mobile-first PWA and responsive desktop fallback.
- Universal iOS Shortcut distributed through one iCloud Shortcut link.
- Krillion Safari DOM capture.
- MapTap native Share Sheet text capture.
- Server-side game detection, parsing, validation, and confirmation text.
- Stateless validate-then-submit API flow; no temporary submission draft.
- Invitation-based player/device registration.
- Device-authenticated website login.
- Daily and all-time leaderboards.
- Clipboard sharing.
- Administrator dashboard and audit log.
- Manual admin backfill/correction tools.
- Parser versioning and strict failure behavior.

### 3.2 Explicitly excluded

- Screenshot upload or screenshot storage.
- Tesseract, Apple Vision OCR, or any paid AI service.
- Native iOS application or App Store distribution.
- Embedded/iframe gameplay.
- Player PINs, passwords, email authentication, or Sign in with Apple.
- Open public registration.
- Player-editable results after extraction.
- Player submission of past dates.
- Cross-device identity based on MAC address, browser fingerprint, serial number, or hardware ID.
- Automatic proof that a player did not tamper with their local Shortcut. The system protects against mistakes and ordinary impersonation, not a determined player modifying their own client.

---

## 4. System architecture

### 4.1 Runtime architecture

```text
Krillion in Safari ─┐
                    ├─> Upload to WHT Shortcut
MapTap Share Sheet ─┘        │
                             ├─ POST /api/import/validate
                             │      parse + validate only
                             │      return confirmation or error
                             │
                             └─ POST /api/import/submit
                                    parse + validate again
                                    write final result to D1

iPhone/desktop browser ─> Cloudflare Pages PWA
                              │
                              └─ Same-origin Pages Functions/Workers ─> D1
```

### 4.2 Technology choices

| Layer                            | Choice                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------ |
| Frontend                         | React, TypeScript, Vite                                                        |
| Styling                          | Tailwind CSS; mobile-first, accessible components                              |
| PWA                              | Web app manifest, icons, standalone display, service worker for app shell only |
| Static hosting                   | Cloudflare Pages                                                               |
| API                              | Same-origin Cloudflare Pages Functions, running on the Workers runtime         |
| Database                         | One Cloudflare D1 database bound as `DB`                                       |
| Admin authentication             | Cloudflare Access protecting `/admin*` and `/api/admin/*`                      |
| Player submission authentication | Random per-installation device authorization code                              |
| Player website authentication    | Opaque server-side session referenced by a Secure HttpOnly cookie              |
| Time                             | IANA zone `America/Los_Angeles`; never a fixed UTC offset                      |
| Images                           | No user screenshots or game images retained                                    |

Pages and API routes remain on the same origin. This avoids CORS complexity and makes first-party session cookies straightforward.

### 4.3 Suggested repository layout

```text
/
├─ src/                         React application
│  ├─ pages/
│  ├─ components/
│  ├─ leaderboard/
│  ├─ admin/
│  └─ lib/
├─ functions/                   Pages Functions routes
│  ├─ api/
│  │  ├─ import/
│  │  ├─ auth/
│  │  ├─ leaderboard/
│  │  └─ admin/
│  └─ _middleware.ts
├─ shared/                      Shared types, schemas, ranks, game config
├─ parsers/
│  ├─ krillion.ts
│  └─ maptap.ts
├─ migrations/                  Ordered D1 SQL migrations
├─ shortcut/                    Human-readable Shortcut build specification
├─ tests/
│  ├─ fixtures/
│  ├─ unit/
│  ├─ integration/
│  └─ e2e/
├─ public/
├─ wrangler.jsonc
└─ README.md
```

---

## 5. Universal iOS Shortcut specification

Implementation is now split into **Phase 5A**, which establishes the maintained source, pinned builds/signing and native acceptance of the upload client, and **Phase 5B**, which adds Login with Device to that accepted source. The existing manual pilot remains reference/rollback. The name, device-code setup and API responsibilities below are unchanged. Detailed current work and evidence are in `daily-games-tracker/PHASE_5A_PLAN.md`, `daily-games-tracker/PHASE_5B_PLAN.md` and their combined `PHASE_5_STATUS.md` index.

### 5.1 Identity

- **Name:** `Upload to WHT`
- **Distribution:** One shared iCloud Shortcut link.
- **Version field:** A constant such as `shortcut_version = 1` sent with every API call.
- **Import Question:** `Paste your private WHT device code.`
- The import answer fills a Text action/constant named `device_code`.
- The configured code must never be shown in confirmation or error messages.

### 5.2 Accepted launch modes

The same Shortcut supports three modes.

| Mode                | How it starts                                     | Input                                         |
| ------------------- | ------------------------------------------------- | --------------------------------------------- |
| Krillion submission | Safari Share Sheet on the completed Krillion page | Safari webpage                                |
| MapTap submission   | MapTap's in-game **Share your score** sheet       | Text                                          |
| Website login       | Website button opens `shortcuts://run-shortcut`   | Text instruction containing a login challenge |

The Shortcut must appear in the iOS Share Sheet for Safari webpages and text.

### 5.3 Branch order

1. If text input begins with `DGT_LOGIN_V1:`, run the website-login branch.
2. Else if input is a Safari webpage, run the generic webpage-capture branch.
3. Else if input can be converted to non-empty text, run the shared-text branch.
4. Else show `Unsupported input` and stop.

### 5.4 Generic webpage capture

The Shortcut runs **Run JavaScript on Web Page** against the active Safari page. The JavaScript returns a generic capture envelope rather than game-specific parsed results.

Required fields:

```json
{
  "capture_schema": "dgt.capture.v1",
  "source_kind": "safari_webpage",
  "source_url": "https://…",
  "page_title": "…",
  "visible_text": "…",
  "visible_nodes": [
    {
      "tag": "DIV",
      "id": "",
      "class": "result-row",
      "text": "…"
    }
  ]
}
```

Capture constraints:

- Normalize repeated whitespace but preserve meaningful line order in `visible_text`.
- Include visible leaf/near-leaf nodes with tag, id, class, and text so server parsers can use DOM hints.
- Exclude scripts, styles, SVG path data, hidden elements, and form secrets.
- Cap `visible_text` at 100 KB, node count at 5,000, and the serialized capture at 256 KB.
- Return the capture through the JavaScript `completion()` handler promptly.
- Do not include cookies, local storage, session storage, or page source.

Server-side game parsers own all game-specific interpretation. A new browser game can be added without updating the Shortcut if this generic capture contains the required result data.

### 5.5 Shared-text capture

For MapTap and future text-sharing games, the Shortcut sends:

```json
{
  "capture_schema": "dgt.capture.v1",
  "source_kind": "shared_text",
  "shared_text": "www.maptap.gg October 20\n98🔥 80👏 98🔥 91👑 66😔\nFinal score: 845"
}
```

The text is forwarded unchanged except for line-ending normalization.

### 5.6 Validate and confirm

The Shortcut sends the capture to `POST /api/import/validate` with:

```http
Authorization: Device <device_code>
Content-Type: application/json
```

The server returns one of:

- `valid` with `confirmation_text` and a normalized summary;
- `error` with a player-facing `error_message` and stable `error_code`;
- `update_required` with the newest Shortcut installation link.

For `valid`, use **Choose from Menu** with the server-provided multiline prompt and exactly two choices:

- `✅ Submit Results`
- `Cancel`

The confirmation must show:

- player name;
- game and puzzle/date;
- every extracted round result;
- final total;
- `Validation passed`.

For Krillion, list all seven answers with their configured scoring emoji and numeric round score. For MapTap, list all five raw scores and final total. The native Shortcuts interface controls the visual style.

If the player selects Cancel, use **Stop This Shortcut**. No API write occurs.

### 5.7 Submit

After confirmation, the Shortcut sends the same original capture and shortcut_version to `POST /api/import/submit`. No confirmation hash, token, fingerprint or draft is exchanged or stored by validate. The server authenticates, parses, and validates the received capture again before writing. The user explicitly accepts that the server does not bind this request to the earlier confirmation; the native Shortcut keeps and resends its original capture.

On a new successful submission or a valid already_submitted response from either endpoint, the response includes scoreboard_text, completion_message and wht_url, alongside game/date/current rank where available. Only a new save includes success_message/final_score; repeats include the already-saved message and never present the incoming score as saved. The Shortcut copies scoreboard_text to the clipboard, then uses completion_message as a native Choose from Menu prompt with exactly Close and Open WHT. Close stops; Open WHT opens wht_url and stops. The API renders the scoreboard using section 12's privacy/format rules; the phone does not assemble it. If scoreboard_text is null because post-save preparation failed, leave the clipboard unchanged and show the server's honest unavailable completion_message with the same menu; never claim copying succeeded. The copy-success prompt is shown only after the native Copy to Clipboard action completes.

On a network error, the Shortcut may retry once. If a result was already saved, the API returns already_submitted with “You already have a result saved for this game today.” plus a fresh server scoreboard and the Close / Open WHT completion menu. This is a notice that a record exists, not a claim the retried capture matches it. No second record is created.

### 5.8 Required wrong-method errors

| Player action                                                            | Required response                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Uses Krillion's in-game copy/share summary instead of Safari Share       | `INCOMPLETE_KRILLION_SHARE` — Oops! For Krillion, use the Safari browser’s Share Website menu on the completed results page, then choose Upload to WHT. Do NOT use the "SHARE..." button inside the Krillion website. We need all seven answers and scores. |
| Uses Safari Share on MapTap instead of MapTap's in-game Share your score | `INCOMPLETE_MAPTAP_SHARE` — Oops! For MapTap, use the blue "Share your score" button inside the MapTap website, then choose Upload to WHT. Do NOT use the Safari browser’s Share Website menu. We need all five round scores.                               |
| Runs before finishing                                                    | `GAME_NOT_COMPLETE`                                                                                                                                                                                                                                         |
| Parser finds fewer/more expected rounds                                  | `ROUND_COUNT_MISMATCH`                                                                                                                                                                                                                                      |
| Round totals do not reproduce final total                                | `SCORE_MISMATCH`                                                                                                                                                                                                                                            |
| Result is not for the current Pacific day                                | `WRONG_GAME_DAY`                                                                                                                                                                                                                                            |
| Any existing submission for player/game/day                              | `already_submitted` (HTTP 200) — already-saved notice plus fresh scoreboard and completion menu                                                                                                                                                             |
| Unknown or revoked device code                                           | `DEVICE_NOT_AUTHORIZED`                                                                                                                                                                                                                                     |
| Game/site format is no longer recognized                                 | `PARSER_UNSUPPORTED`                                                                                                                                                                                                                                        |

Failures state **Nothing was submitted**. An already_submitted response is a completion outcome, confirming an existing record and supplying a fresh scoreboard without changing the saved result. The Shortcut offers no edit fields.

### 5.9 Shortcut updates

Most future games require only a server parser and website UI update. A Shortcut update is needed only if the new game requires a capture mode that is neither shared text nor readable Safari DOM text.

Every API response may include:

```json
{
  "shortcut_support": "supported | update_available | update_required",
  "latest_version": 2,
  "install_url": "https://www.icloud.com/shortcuts/…"
}
```

An optional update lets the user continue. A required update stops and opens the new installation link. Because Apple installs personal copies, updates are not pushed automatically; the player installs the new copy and pastes a newly issued or existing device code as directed by the administrator.

---

## 6. Player registration and device authorization

### 6.1 Admin-created invitation

The administrator:

1. Creates or selects a player.
2. Chooses **Add Device**.
3. Generates a single-use registration link, default expiry 24 hours.
4. Sends the link privately to the player.

There is no public registration route without a valid invitation token.

### 6.2 Registration page

After redeeming the invitation, the page:

1. Shows the player display name for confirmation.
2. Creates a random 256-bit device authorization code.
3. Stores only `SHA-256(code)` in D1.
4. Shows the plaintext code once with a **Copy** button.
5. Shows an **Install Upload to WHT** link to the universal iCloud Shortcut.
6. Instructs the player to paste the copied code into the Shortcut's one-time setup question.
7. Establishes an initial website session in that browser.

The page cannot preload a unique code into the shared iCloud Shortcut. Copy once and paste into the Import Question is the final installation flow.

### 6.3 Device credential properties

- At least 32 random bytes from Web Crypto, encoded base64url without padding.
- Sent only over HTTPS in an `Authorization: Device` header.
- Has player-level permissions only: validate/submit games, approve website login, and read its own status.
- Cannot use admin endpoints.
- Has `created_at`, `last_used_at`, `revoked_at`, and optional user-entered label.
- Remains valid until revoked; inactivity alone does not expire it.
- Is visible to someone who can inspect the configured Shortcut. This limitation is disclosed during registration.

### 6.4 New or lost device

- **Second device:** Admin generates another Add Device link. Both credentials remain valid.
- **Replacement device:** Admin generates a new link and may revoke the prior device.
- **Lost/stolen device:** Admin revokes that device and its associated website sessions immediately.
- **Shared or leaked configured Shortcut:** Treat as a credential leak; revoke and issue a new device code.

---

## 7. Website authentication — Login with Device

### 7.1 Session model

The browser stores an opaque session identifier in a first-party cookie:

```text
dgt_session=<random-value>;
Path=/;
Secure;
HttpOnly;
SameSite=Lax;
Max-Age=34560000
```

`34560000` seconds is 400 days. The cookie is only a lookup key; authorization is controlled by the server-side session record.

Server-side rules:

- Rolling inactivity window: 7 days.
- Absolute maximum: no later than the browser cookie's current hard expiry.
- Successful authenticated website activity extends `idle_expires_at` by 7 days and renews the cookie.
- Successful Shortcut validation/submission extends every still-active, non-revoked web session for that player by 7 days, without resurrecting an already-expired session.
- Revoking a device or player can invalidate the corresponding sessions immediately.
- If Safari deletes or expires the cookie, the account and results remain intact; the browser simply uses Login with Device again.

### 7.2 Login page

The player-facing label is **Login with Device**, not Login with Shortcut.

When no valid session exists, the daily page shows:

- explanation that the registered device will verify the login;
- a **Login with Device** button;
- a fallback instruction to reinstall/register the Shortcut if it is unavailable.

### 7.3 Login challenge flow

Do not pass a reusable browser session ID to the Shortcut.

1. Browser calls `POST /api/auth/device/start`.
2. Server creates a random, single-use challenge that expires after 2 minutes and sets a short-lived, HttpOnly `dgt_login_flow` cookie binding the browser to that challenge.
3. Server returns a URL such as:

   ```text
   shortcuts://run-shortcut?name=Upload%20to%20WHT&input=text&text=DGT_LOGIN_V1%3A%3Cchallenge%3E
   ```

4. The website opens the URL after the user's tap.
5. Shortcut detects `DGT_LOGIN_V1`, calls `POST /api/auth/device/approve` with the challenge and its device credential.
6. Server marks the challenge approved for that player.
7. Shortcut opens the provided return URL, or the player returns to the waiting page.
8. Browser calls `POST /api/auth/device/complete`. The server requires the matching login-flow cookie, consumes the approved challenge, creates a web session, and sets `dgt_session`.
9. Browser redirects to the originally requested daily page.

The challenge contains no player identity and is useless without an authorized device credential and the initiating browser's flow cookie.

### 7.4 PWA/Safari behavior

Safari and a Home Screen PWA may not always share the same session context. Login with Device must establish the cookie in the browser/PWA instance that initiated the flow. Phase 5B includes a real-iPhone proof test for both Safari and an installed PWA. If automatic return to the PWA is unreliable, the approved waiting page remains open and completes login when the user returns to it.

---

## 8. Game parsing and validation

### 8.1 Common normalized result

Every parser returns the same internal shape:

```ts
type NormalizedGameResult = {
  gameKey: "krillion" | "maptap" | string;
  gameDate: string; // YYYY-MM-DD in America/Los_Angeles
  externalPuzzleKey: string; // e.g. "97" or "2026-10-20"
  finalScore: number;
  rounds: Array<{
    roundNumber: number;
    prompt?: string;
    answer?: string | null;
    rawScore: number;
    originalEmoji?: string | null;
  }>;
  parserVersion: string;
};
```

Parsing is pure and deterministic. Validation happens after parsing. Parser code never writes to D1.

### 8.2 Krillion source and parser

**Required source:** Safari Share Sheet on the fully completed Krillion results page.

The capture already proved that the completed page exposes:

- `DIVE #<number> COMPLETE`;
- final total;
- seven prompts;
- seven answers;
- seven individual numeric scores;
- completed-results content under `THE CATCH`.

Parser requirements:

1. Require a completed-dive marker and puzzle number.
2. Prefer stable DOM hints from `visible_nodes`; use bounded text parsing only as a fallback.
3. Locate the seven round blocks inside the completed results section, not unrelated logbook or marketing text.
4. Associate each prompt, answer, and score within the same round block.
5. Represent a genuine no-answer/miss explicitly as `answer = null` and `score = 0` when the DOM clearly marks it.
6. Reject ambiguous rows rather than guessing.
7. Require round numbers 1 through 7 exactly once.
8. Require the final total to equal the sum of the seven round scores.

Allowed Krillion scores and display emojis:

| Score | Emoji | Tier              |
| ----: | ----: | ----------------- |
|   100 |    🌟 | One in a Krillion |
|    85 |    🏮 | Deep Cut          |
|    60 |    🦑 | Rare              |
|    30 |    🐟 | Schooler          |
|    15 |    🤡 | Too Clever        |
|    10 |    🫧 | Plankton          |
|     0 |    ⬛ | Miss              |

Any other round score is rejected until the configuration and tests are deliberately updated.

Date/puzzle handling:

- The submission date is the current Pacific date at the server.
- Reject known archive URLs or archive-state markers.
- `game_days` maps that Pacific date to a single Krillion puzzle number.
- The first accepted Krillion submission can establish the day's puzzle number; subsequent submissions must match it.
- The admin can set/correct the date-to-puzzle mapping.
- Before launch, test whether the live page exposes a stronger current-day marker. Use it when available.

### 8.3 MapTap source and parser

**Required source:** MapTap's in-game **Share your score** button, which opens the native iOS Share Sheet.

Confirmed input example:

```text
www.maptap.gg October 20
98🔥 80👏 98🔥 91👑 66😔
Final score: 845
```

Parser requirements:

1. Require the `www.maptap.gg` marker.
2. Parse month and day.
3. Parse exactly five `integer + emoji` round tokens.
4. Preserve each original emoji exactly.
5. Require each raw score to be an integer from 0 through 100.
6. Parse the reported final score.
7. Recalculate using multipliers `[1, 1, 2, 3, 3]`.
8. Require calculated and reported totals to match.
9. Infer the year from the current Pacific date and require the parsed month/day to be today. Do not silently accept a year rollover mismatch.

Formula:

```text
final = r1 + r2 + (2 × r3) + (3 × r4) + (3 × r5)
```

Maximum score is 1,000.

### 8.4 Common validation

Every validate and submit request enforces:

- authorized, active player device;
- supported Shortcut version;
- known game parser;
- completed-game marker/format;
- current Pacific date;
- exact round count;
- sequential unique round numbers;
- game-specific score domain;
- final-score reproduction;
- normalized payload size limits;
- no existing submission for player/game/date; every valid repeat gets already_submitted with the same already-saved notice and a fresh scoreboard.

Validation returns no partial success. A multi-game batch is not used: each Share Sheet action submits one game result.

---

## 9. API contract

All responses use JSON and a request ID. Player-facing text is generated centrally so errors and confirmations can change without updating the Shortcut.

### 9.1 `POST /api/import/validate`

Purpose: authenticate, detect, parse, and validate without writing a game submission.

Request:

```json
{
  "shortcut_version": 1,
  "capture": {
    "capture_schema": "dgt.capture.v1",
    "source_kind": "shared_text",
    "shared_text": "…"
  }
}
```

Success:

```json
{
  "status": "valid",
  "request_id": "req_…",
  "game": "maptap",
  "player": "Alex",
  "game_date": "2026-10-20",
  "round_count": 5,
  "final_score": 845,
  "confirmation_text": "MapTap — October 20\nPlayer: Alex\nRounds: 98 · 80 · 98 · 91 · 66\nTotal: 845\n\nValidation passed. Submit results?",
  "shortcut_support": "supported"
}
```

Failure:

```json
{
  "status": "error",
  "request_id": "req_…",
  "error_code": "INCOMPLETE_MAPTAP_SHARE",
  "error_message": "Incomplete MapTap results…\n\nNothing was submitted."
}
```

This endpoint performs no submission write and creates no confirmation proof or draft. No game-result hash is calculated or stored. If a submission already exists, return HTTP 200 with status already_submitted, message “You already have a result saved for this game today.”, fresh scoreboard_text, completion_message and wht_url. The native Shortcut copies the returned text and shows the completion menu without confirmation or another submit request. It may update device `last_used_at` and extend active web sessions only after successful authentication and successful validation.

### 9.2 `POST /api/import/submit`

Receives only shortcut_version and the original capture, repeats the complete parse and validation, checks for an existing player/game/day record, and saves atomically only when no record exists. No game-result hash or content comparison is used. There is no comparison with an earlier validation response.

Success:

```json
{
  "status": "submitted",
  "request_id": "req_…",
  "game": "maptap",
  "game_date": "2026-10-20",
  "final_score": 845,
  "daily_rank": 3,
  "success_message": "✅ MapTap submitted!\nScore: 845\nCurrent daily rank: 3",
  "scoreboard_text": "📊 WHT Leaderboard — OCT 20, 2026\n\n…server-rendered score-only scoreboard…",
  "completion_message": "Upload successful. Scoreboard copied to clipboard.",
  "wht_url": "https://<site>/daily/2026-10-20"
}
```

Idempotency behavior:

- Use the unique player/game-day slot to detect any existing result; do not hash or compare result content.
- Unique constraint on `(player_id, game_day_id)`; the game day identifies the game/date.
- If any row exists, return HTTP 200 with status already_submitted, message “You already have a result saved for this game today.”, fresh scoreboard_text, completion_message and wht_url. Do not alter saved submissions, rounds or timestamps. Render from stored data, never the changed incoming capture. If rendering fails, return null scoreboard_text and an honest unavailable completion_message; the phone preserves its clipboard.
- Apply the same response after a concurrent insertion wins or a committed response is lost.

Example repeat response from either endpoint (HTTP 200):

```json
{
  "status": "already_submitted",
  "message": "You already have a result saved for this game today.",
  "submission_id": "<existing submission ID>",
  "game": "maptap",
  "game_date": "2026-10-20",
  "daily_rank": 1,
  "scoreboard_text": "<fresh server-rendered score-only scoreboard>",
  "completion_message": "You already have a result saved for this game today. Scoreboard copied to clipboard.",
  "wht_url": "https://<site>/daily/2026-10-20"
}
```

Duplicate validation skips the score confirmation and submit request. Both duplicate validation and duplicate submit use the same native completion flow. Support/version metadata remains present. A null scoreboard uses “You already have a result saved for this game today. Scoreboard copying is unavailable right now.”
New submissions insert the submission and all round rows in one D1 batch/transactional unit.

### 9.3 Device login endpoints

- `POST /api/auth/device/start` — browser starts challenge and receives Shortcut launch URL.
- `POST /api/auth/device/approve` — authorized Shortcut approves challenge.
- `POST /api/auth/device/complete` — initiating browser consumes approval and receives session.
- `POST /api/auth/logout` — revokes current browser session and clears cookie.
- `GET /api/auth/me` — returns current player/session state.

### 9.4 Leaderboard endpoints

- `GET /api/leaderboards/daily?date=YYYY-MM-DD`
  - requires a website session;
  - returns per-game lock state;
  - omits current-day protected game details until that player submitted that game.
- `GET /api/leaderboards/all-time`
  - public;
  - returns every game.
- `GET /api/leaderboards/share?date=YYYY-MM-DD`
  - requires a session and at least one submission by that player on the requested current day;
  - returns server-generated plain text only.

### 9.5 Registration/admin endpoints

- `POST /api/admin/players`
- `PATCH /api/admin/players/:id`
- `POST /api/admin/players/:id/devices/invite`
- `POST /api/admin/devices/:id/revoke`
- `POST /api/admin/submissions/manual`
- `PATCH /api/admin/submissions/:id`
- `DELETE /api/admin/submissions/:id`
- `GET /api/admin/audit`
- `GET /register/:inviteToken`
- `POST /api/register/:inviteToken/redeem`

Every `/api/admin/*` route independently verifies Cloudflare Access identity; a hidden URL alone is never authorization.

---

## 10. D1 data model

Use migration files and foreign keys. Store UTC timestamps as ISO-8601 text; store game days as Pacific `YYYY-MM-DD` strings.

### 10.1 `players`

| Column         | Notes                                           |
| -------------- | ----------------------------------------------- |
| `id`           | UUID/ULID primary key                           |
| `display_name` | Unique case-insensitive active display name     |
| `active`       | Boolean; deactivate instead of deleting history |
| `created_at`   | UTC                                             |
| `updated_at`   | UTC                                             |

### 10.2 `device_credentials`

| Column            | Notes                                  |
| ----------------- | -------------------------------------- |
| `id`              | Primary key                            |
| `player_id`       | FK                                     |
| `credential_hash` | Unique SHA-256 digest; never plaintext |
| `label`           | Optional, e.g. `Alex's iPhone`         |
| `created_at`      | UTC                                    |
| `last_used_at`    | UTC nullable                           |
| `revoked_at`      | UTC nullable                           |

### 10.3 `registration_invites`

| Column        | Notes                  |
| ------------- | ---------------------- |
| `id`          | Primary key            |
| `player_id`   | FK                     |
| `token_hash`  | Unique SHA-256 digest  |
| `expires_at`  | Default 24 hours       |
| `consumed_at` | Nullable; one use only |
| `created_by`  | Admin identity string  |
| `created_at`  | UTC                    |

### 10.4 `web_sessions`

| Column                | Notes                                |
| --------------------- | ------------------------------------ |
| `id`                  | Primary key                          |
| `player_id`           | FK                                   |
| `session_hash`        | Unique SHA-256 digest                |
| `source_device_id`    | Nullable FK to device credential     |
| `idle_expires_at`     | Rolling 7-day server expiry          |
| `absolute_expires_at` | Hard expiry, at most cookie lifetime |
| `last_activity_at`    | UTC                                  |
| `revoked_at`          | UTC nullable                         |
| `created_at`          | UTC                                  |

### 10.5 `login_challenges`

| Column               | Notes                    |
| -------------------- | ------------------------ |
| `id`                 | Primary key              |
| `challenge_hash`     | Unique digest            |
| `browser_flow_hash`  | Binds initiating browser |
| `approved_player_id` | Nullable FK              |
| `approved_device_id` | Nullable FK              |
| `expires_at`         | 2 minutes                |
| `consumed_at`        | Nullable                 |
| `created_at`         | UTC                      |

### 10.6 `games`

| Column         | Notes                                |
| -------------- | ------------------------------------ |
| `id`           | Primary key                          |
| `key`          | Unique stable key, e.g. `krillion`   |
| `display_name` | UI name                              |
| `active`       | Boolean                              |
| `round_count`  | 7 or 5 for V1                        |
| `config_json`  | Rank badge and scoring configuration |

### 10.7 `game_days`

| Column                | Notes                              |
| --------------------- | ---------------------------------- |
| `id`                  | Primary key                        |
| `game_id`             | FK                                 |
| `game_date`           | Pacific date                       |
| `external_puzzle_key` | Krillion number or MapTap date key |
| `metadata_json`       | Optional prompts/config            |

Unique: `(game_id, game_date)` and `(game_id, external_puzzle_key)` where appropriate.

### 10.8 `submissions`

| Column                    | Notes                                       |
| ------------------------- | ------------------------------------------- |
| `id`                      | Primary key                                 |
| `player_id`               | FK                                          |
| `game_id`                 | FK                                          |
| `game_day_id`             | FK                                          |
| `final_score`             | Integer                                     |
| `parser_version`          | Exact parser version used                   |
| `source_kind`             | `safari_webpage`, `shared_text`, or `admin` |
| `submitted_via_device_id` | Nullable for admin backfill                 |
| `submitted_at`            | UTC                                         |
| `updated_at`              | UTC                                         |

Unique: `(player_id, game_day_id)`.

Do not store the raw capture after successful parsing. Keep only the normalized result, source kind, and parser version. Game-result hashes are not stored; schema migration 0002 removes the old column.

### 10.9 `round_results`

| Column           | Notes                                                          |
| ---------------- | -------------------------------------------------------------- |
| `id`             | Primary key                                                    |
| `submission_id`  | FK with cascade delete                                         |
| `round_number`   | Integer                                                        |
| `prompt`         | Krillion prompt snapshot; null for MapTap                      |
| `answer`         | Krillion answer; null for MapTap/miss                          |
| `raw_score`      | Unweighted round score                                         |
| `original_emoji` | MapTap shared emoji; derived Krillion emoji may also be stored |

Unique: `(submission_id, round_number)`.

### 10.10 `admin_audit_log`

| Column           | Notes                            |
| ---------------- | -------------------------------- |
| `id`             | Primary key                      |
| `admin_identity` | Cloudflare Access identity       |
| `action`         | Stable action name               |
| `entity_type`    | Player/device/submission/etc.    |
| `entity_id`      | Target ID                        |
| `before_json`    | Redacted prior state             |
| `after_json`     | Redacted new state               |
| `reason`         | Required for score edits/deletes |
| `created_at`     | UTC                              |

Secrets, session values, invitation tokens, and device credentials never appear in the audit log.

### 10.11 Required indexes

- Active player name.
- Device credential hash.
- Session hash and active expiry.
- Login challenge hash and expiry.
- Game/date.
- Submission by game day and score.
- Submission by player/date.
- Round results by submission/round.
- Audit log by entity and creation time.

---

## 11. Leaderboard behavior and UI

### 11.1 Navigation

Primary mobile navigation:

- **Play / Submit Help** — links to both game sites and Shortcut installation/help.
- **Daily** — combined daily leaderboards.
- **All-Time** — combined all-time leaderboards.
- **User** — permanent fourth dock tile after All-Time: `/user` sign-in, personal stats/Shortcut redownload/logout (Phase 10 preview-deployed; physical-device/native acceptance remains open).

The admin page is not linked from normal navigation.

### 11.2 Daily leaderboard page

The page contains a date selector and one table per active game.

For each game:

- columns are players;
- rows are levels/rounds;
- player columns are sorted left-to-right by daily total descending;
- ties share rank and sort alphabetically;
- nonparticipants are at the far right alphabetically;
- header contains placement badge, rank, display name, and daily total;
- row and player headers are sticky where supported;
- table scrolls horizontally on iPhone.

Krillion cells show:

- answer;
- scoring emoji;
- numeric round score.

Krillion round labels show round number and prompt when available.

MapTap cells show:

- raw numeric score;
- original shared emoji;
- optional secondary weighted contribution on tap/details, not as the primary value.

For today's locked game, return no protected rows to the browser. Show an explanation: **Play and submit today's [game] result to unlock this table.** Access control is server-side, not merely hidden CSS.

### 11.3 All-time leaderboard page

This page is public and contains one table per game.

- Player columns are sorted by cumulative score descending.
- Ties share competition rank and sort alphabetically.
- Players who have played at least once rank ahead of never-played players.
- Never-played players appear at the far right alphabetically.
- Column header contains placement badge, rank, display name, cumulative total, games played, and average score.
- Rows are game dates, newest first.
- Each cell contains that player's daily final total or an em dash for not played.
- A daily total is tappable to open the corresponding historical daily detail page after authentication.
- Ranking uses cumulative total only. Average and games played are informational.

### 11.4 All-time movement

For each player and game:

1. Calculate current all-time rank using all accepted submissions through the selected/current day.
2. Calculate baseline rank using accepted submissions dated before the current Pacific day.
3. Compare rank numbers:
   - smaller number: `📈`;
   - larger number: `📉`;
   - unchanged: `➖`;
   - no prior-day rank: `NEW`.

All copies generated during the same day use the same prior-day baseline. Administrator corrections to historical data cause the baseline to be recomputed.

### 11.5 Query strategy

Do not persist mutable leaderboard totals in V1. Calculate them from indexed submissions and round results. The group is small, and derived queries reduce synchronization bugs after admin edits.

If profiling later shows a need, add materialized daily summaries with deterministic rebuild tooling; do not introduce them preemptively.

---

## 12. Copy Leaderboard specification

### 12.1 Availability

- Automatically returned by a successful new Shortcut upload or valid repeat detected by either endpoint, for native clipboard copying followed by Close / Open WHT. This server renderer is pulled forward into Phase 4 by user request.
- Also appears on the daily page after the authenticated player has submitted at least one game for the current day; the website button/endpoint remains later work.
- Generates a single plain-text snapshot from one consistent database read after the Shortcut submission commits, or at website button press when that later UI is implemented.
- Includes a game section only when at least one active registered player submitted that game for the selected day, even if the copying player submitted only one other game.
- Includes only active registered players with a saved submission for that game and selected day.
- Ends after the final MapTap round line; no trailing divider, footer, or URL section is included.

### 12.2 Privacy and formatting rules

- Never include Krillion answers or prompts.
- Krillion individual round results are **emojis only**; omit round score numbers.
- MapTap individual round results are **numbers only**; omit round emojis.
- Omit all rank-tier emojis from the share copy for both daily and all-time rank.
- Movement symbols `📈`, `📉`, and `➖` remain.
- Fold all-time rank, cumulative total, and movement into each player's daily line; do not create separate all-time sections.
- Daily nonparticipants are omitted from the share copy.
- Use localized thousands separators.

### 12.3 Canonical clipboard layout

The user-approved clipboard layout is the example below. Preserve its punctuation, emoji headers, blank lines and divider bars, substituting live database values and the configured site origin.

- Title: `📊 WHT Leaderboard — OCT 21, 2026` (English abbreviated month in uppercase).
- Krillion header: `🦐 KRILLION — #98`, using the selected game day's external_puzzle_key. If no puzzle mapping exists, show #— rather than invent a puzzle number.
- MapTap header: `🌎 MAPTAP — OCT 21`, using the selected date.
- Player line: `#<daily rank> · <daily total> — <name> [#<all-time rank> · <all-time total> <movement>]`.
- No AT label and no extra middle dot before movement.
- Round values go on the next line with no Rounds: prefix. Krillion uses space-separated score emojis only; MapTap uses raw numeric scores separated by `·`.
- Put a blank line between player blocks and after each game heading.
- Separate the two game sections with `━━━━━━━━━━━━━━━━━━━━` and a blank line on each side. Do not append a final divider or link block.
- Keep existing ranking/privacy rules: competition ranks, alphabetical ties among submitted players, submitted players only, and movement against the previous Pacific day. Zero remains a valid submitted score.

### 12.4 Canonical example

```text
📊 WHT Leaderboard — OCT 21, 2026

🦐 KRILLION — #98

#1 · 455 — Alex [#1 · 7,460 ➖]
🌟 🏮 🏮 🏮 🦑 🐟 🫧

#2 · 430 — Sam [#2 · 7,390 📈]
🌟 🏮 🏮 🦑 🦑 🐟 🫧

#3 · 410 — Chris [#3 · 7,375 📈]
🏮 🏮 🏮 🏮 🦑 🫧 ⬛

#4 · 390 — Jordan [#4 · 7,360 📉]
🏮 🏮 🦑 🦑 🦑 🐟 🫧

#5 · 365 — Taylor [#6 · 7,315 ➖]
🏮 🦑 🦑 🦑 🦑 🐟 🫧

#6 · 325 — Morgan [#5 · 7,325 📉]
🏮 🏮 🫧 ⬛ 🦑 🏮 ⬛

#7 · 265 — Riley [#7 · 7,065 ➖]
🦑 🦑 🦑 🐟 🐟 🤡 🫧

━━━━━━━━━━━━━━━━━━━━

🌎 MAPTAP — OCT 21

#1 · 936 — Chris [#2 · 16,936 📈]
99 · 100 · 88 · 88 · 99

#2 · 925 — Alex [#1 · 17,005 ➖]
98 · 93 · 100 · 99 · 79

#3 · 915 — Jordan [#3 · 16,935 📉]
99 · 97 · 97 · 97 · 78

#4 · 895 — Riley [#5 · 16,395 📈]
100 · 97 · 100 · 94 · 72

#5 · 877 — Sam [#4 · 16,827 ➖]
100 · 97 · 97 · 99 · 63

#6 · 761 — Taylor [#6 · 16,341 📉]
100 · 98 · 100 · 98 · 23

#7 · 720 — Morgan [#7 · 16,120 ➖]
72 · 39 · 99 · 73 · 64

```

The example's scores, names, ranks and dates illustrate layout; the renderer uses actual stored values. The entire text is generated exclusively on the server. The native Shortcut copies scoreboard_text verbatim and needs no formatting changes.

---

## 13. Administrator dashboard

### 13.1 Access

- Route: `/admin`.
- Not linked in public/player navigation.
- Protected by Cloudflare Access at `/admin*` and `/api/admin/*`.
- Configure an allow policy for the administrator's identity only.
- Pages Functions still verify the Access identity/JWT for admin API calls.
- Hidden location is convenience, not security.

### 13.2 Player management

- Create player.
- Rename player.
- Activate/deactivate player.
- View games played and last submission.
- Generate first or additional device invitation.
- View device labels, creation, last use, and revocation state.
- Revoke one device or all player devices.
- Revoke all web sessions.

Player removal defaults to deactivation so historical standings remain intact.

### 13.3 Submission management

- Search/filter by player, game, date, or puzzle.
- View normalized final and round results.
- Add historical/missing submission.
- Edit Krillion prompts, answers, scores, puzzle key, date, and total.
- Edit MapTap date, raw scores, original emojis, and total.
- Delete duplicate/invalid submission.
- Require a reason for every edit/delete.
- Re-run game validation before saving an edit.
- Update the normalized result, `updated_at`, and audit log atomically.
- Leaderboards reflect changes immediately because they are derived from source rows.

### 13.4 Audit history

- Show administrator identity, action, target, reason, time, and before/after values.
- Never show authorization codes, hashes, session tokens, or invite tokens.
- Audit records are append-only through the application.

---

## 14. Security, privacy, and integrity

### 14.1 Core controls

- HTTPS only.
- Device authorization codes, invite tokens, session tokens, browser-flow tokens, and login challenges are generated with Web Crypto.
- Store token hashes, never plaintext tokens.
- Compare digests without data-dependent early exits where practical.
- Device credentials are scoped to non-admin player operations.
- Admin routes require Cloudflare Access.
- Use prepared D1 statements exclusively.
- Set payload and field length limits before parsing.
- Reject unknown JSON fields where schema validation benefits integrity.
- Deny cross-origin API use; no permissive CORS.
- Check `Origin` on browser state-changing routes.
- Use `Secure`, `HttpOnly`, and `SameSite=Lax` cookies.
- Rotate session identifiers on login.
- Apply a restrictive Content Security Policy and avoid third-party scripts on registration/admin pages.
- Rate-limit invalid device credentials, invite redemption, and login challenge creation by IP/device as appropriate.
- Do not log raw captures, credentials, full auth headers, or cookies.

### 14.2 Data integrity rules

- `/validate` does not authorize `/submit`; submit repeats the full validation.
- Database uniqueness is the final duplicate guard.
- No player correction form exists.
- No incomplete round set is saved.
- No score is accepted solely because the final total looks plausible.
- Krillion answers remain bound to their round blocks.
- Parser version is stored with each submission.
- Unknown format changes fail closed with a stable error code.
- Only admin tools can override/correct finalized data, and every override is audited.

### 14.3 Privacy

- No screenshots are uploaded or stored.
- Successful raw DOM/share captures are discarded after parsing/normalization.
- Store only data needed for game history, authentication, and auditing.
- The all-time page is intentionally public and exposes player display names and scores.
- Current-day Krillion answers are protected by the per-game daily unlock.
- The copied score-only leaderboard intentionally exposes score/rank data but never Krillion answers.

### 14.4 Known trust limitation

A configured Shortcut is a client under the player's control. A technically determined player could modify it or fabricate a request. Without publisher-signed results or a first-party game API, the tracker cannot cryptographically prove that a result originated unmodified from a game. For this private social group, strict parsing, duplicate protection, admin review, and the visible confirmation are the accepted safeguards.

### 14.5 Third-party game dependency

Krillion and MapTap are third-party services. Before wider/public distribution, review their current terms and, if appropriate, request permission. V1 uses user-initiated sharing and captures only the user's completed result; it does not crawl games in the background or automate gameplay.

---

## 15. Time, dates, and day rollover

- All game-day decisions use `America/Los_Angeles` through an IANA-aware library/API.
- Midnight Pacific starts the next tracker day, including daylight saving changes.
- Store event timestamps in UTC.
- Store leaderboard/game dates as Pacific `YYYY-MM-DD`.
- The server determines today's date; never trust the Shortcut's clock alone.
- MapTap month/day must match server today.
- Krillion's current result is assigned to server today only after current-page/archive checks.
- Admin historical tools require an explicit date and bypass player current-day restriction while still validating the game's score math.

---

## 16. Error handling and operations

### 16.1 Player-facing behavior

- Messages state the problem, the exact recovery step, and whether anything was saved.
- Do not expose stack traces, SQL errors, selectors, or security details.
- Include a short request ID and stable error code for support.
- Persistent parser failure directs the player to contact the administrator; it never invites manual player editing.

### 16.2 Parser incident workflow

If one player fails:

1. Confirm correct Share method and completed game.
2. Compare iOS/browser/game variant.
3. Inspect redacted structured diagnostics keyed by request ID.
4. Admin may enter/correct the result.

If everyone fails:

1. Disable affected submissions with a clear maintenance error.
2. Add a failing fixture that represents the new format.
3. Update the server parser if the generic capture still contains required data.
4. Deploy the parser fix; no Shortcut update is needed.
5. If required data is no longer present in generic capture, publish a new Shortcut version and return `update_required`.

### 16.3 Backups and recovery

- Use D1 Time Travel/exports where available.
- Before schema migrations or bulk admin corrections, take/export a backup.
- Test restoration in a non-production database.
- Keep migrations forward-only and versioned.

### 16.4 Monitoring

Track:

- request count, latency, and error rate by route;
- parser success/failure by game and parser version;
- invalid credential attempts;
- D1 rows read/written and storage;
- duplicate/conflict rate;
- registration and login challenge failures;
- Shortcut versions in active use.

Logs must be structured and redacted.

---

## 17. Free-tier fit and current platform facts

At the intended scale (roughly 7–15 players, two daily games), usage is far below the current free allowances.

As of October 2026, official Cloudflare documentation lists:

- Workers Free: 100,000 requests/day, 10 ms CPU/request, 128 MB memory.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage.
- D1 Free individual database limit: 500 MB.
- Pages Free: 500 deployments/month.
- Cloudflare Access/Zero Trust Free: up to 50 users.

Free-tier limits can change. Check the linked official documentation immediately before deployment. If a D1 daily free limit is reached, requests fail until reset; there is no silent paid overage on the free plan.

CPU-sensitive code must be benchmarked against the Workers Free CPU limit. The design uses simple string parsing, SHA-256, and indexed SQL; no expensive password hashing or OCR runs inside Workers.

---

## 18. Testing strategy

### 18.1 Fixture tests

Maintain sanitized, versioned fixtures for:

- multiple completed Krillion pages;
- Krillion answers with punctuation, quotes, numbers, accents, and line breaks;
- all Krillion score tiers;
- skipped/no-answer Krillion rounds;
- the actual Dive #97 sample (310 total);
- all supplied MapTap examples;
- the actual October 20 sample (845 total);
- MapTap emojis outside the initial observed set;
- wrong Share methods;
- incomplete and malformed captures;
- old/archive results;
- duplicate and conflicting submissions.

### 18.2 Unit tests

- Game detection.
- Krillion parser.
- MapTap parser and weighted formula.
- Score/emoji mapping.
- Pacific date rollover including DST boundaries.
- Competition ranking and alphabetical tie order.
- Null versus zero handling.
- All-time movement baseline.
- Clipboard formatting and proof that Krillion answers cannot enter it.
- Session expiry/refresh rules.
- Token hashing and revocation checks.

### 18.3 Integration tests

- Validate performs no submission write.
- Submit reparses and validates.
- Atomic submission/round insert.
- Every valid repeat from either endpoint gets HTTP 200 with status already_submitted, the same already-saved notice and a fresh server scoreboard without changing saved scores, rounds or timestamps.
- A validation repeat skips confirmation and submit. Both endpoints feed the same native clipboard and Close / Open WHT completion flow. Null scoreboard_text preserves the clipboard and uses the unavailable message.
- A conflicting valid repeat copies the stored leaderboard without changing the original result.
- Per-game daily locks are server-enforced.
- Historical access rule.
- Public all-time access.
- Device invite redemption and one-use behavior.
- Device revocation.
- Browser login challenge binding, expiry, and one-use behavior.
- Admin Access identity verification and audit logging.

### 18.4 Real-device tests

Test on the oldest available supported iOS version and current iOS:

- universal Shortcut installation through iCloud link;
- Import Question paste and leading/trailing whitespace handling;
- Safari Allow Running Scripts permission;
- Krillion Safari Share capture;
- MapTap in-game Share Sheet text capture;
- native confirmation and cancel paths;
- submit retry after airplane-mode/network interruption;
- Login with Device from Safari;
- Login with Device from installed Home Screen PWA;
- 7-day server session refresh after successful Shortcut use;
- revoked device behavior;
- Shortcut update-required experience.

### 18.5 Security tests

- Brute-force/invalid credential throttling.
- Replay and duplicate requests.
- Stolen login challenge without flow cookie.
- CSRF against website/admin writes.
- XSS through player names, answers, prompts, and emojis.
- Oversized/recursive JSON.
- SQL injection strings in game answers.
- Access bypass attempts on `/api/admin/*`.
- Accidental secret/raw-capture logging.

---

## 19. Implementation phases

Each phase ends with a demo and automated acceptance checks. Do not proceed past the parser proof until real iPhone captures are passing.

### Phase 0 — Repository and fixture baseline

Deliverables:

- Initialize React/TypeScript/Vite/Tailwind project.
- Configure test runner, formatter, linting, and CI.
- Add sanitized Krillion and MapTap capture fixtures.
- Add shared schemas and game configuration.
- Record the universal Shortcut action sequence in `shortcut/`.

Acceptance:

- Project builds locally.
- Tests run in CI.
- No secret or raw private credential is committed.
- Fixtures reproduce the known 310-point Krillion and 845-point MapTap results.

### Phase 1 — Cloudflare foundation and D1 schema

Deliverables:

- Pages project and same-origin Functions.
- D1 database, migrations, local database workflow, and seed games.
- Production/preview configuration through `wrangler.jsonc`.
- Health endpoint and request IDs.

Acceptance:

- Local and preview deployments load.
- Migrations apply from an empty database.
- D1 binding works in local, preview, and production environments.
- Unique constraints and foreign keys are tested.

### Phase 2 — Players, invitations, and device credentials

Deliverables:

- Admin player creation.
- Add Device invitation creation.
- One-use registration page.
- Credential generation, one-time display, hash storage, and initial website session.
- Device revocation.
- Universal Shortcut published with Import Question and version constant.

Acceptance:

- A friend can open an invite, copy code, install Shortcut, and paste once.
- Invite cannot be reused or used after expiry.
- Plaintext code is never recoverable from D1.
- Revoked device fails all authenticated player API calls.

### Phase 3 — Capture and parser proof

Deliverables:

- Generic Safari DOM capture JavaScript.
- Shared-text branch.
- Krillion and MapTap parsers.
- Common normalized result schema.
- Strict validation and player-facing errors.

Acceptance:

- Real Krillion result extracts exactly seven answer/score pairs and correct total.
- Real MapTap Share Sheet extracts five scores/emojis and weighted total.
- Both wrong Share methods produce the correct instructional error.
- Parser rejects ambiguity, incomplete rounds, and mismatched totals.
- Real-device runtime remains within acceptable Shortcut and Worker limits.

### Phase 4 — Validate, confirm, and submit

Deliverables:

- `/api/import/validate` and `/api/import/submit`.
- Server-generated confirmation/error/success text.
- Native Choose from Menu confirmation, followed on new-save success or already_submitted from either endpoint by Copy to Clipboard and a Close / Open WHT completion menu.
- Atomic D1 submission writes.
- Safe repeat behavior through database uniqueness and a uniform already-saved notice.
- Shortcut version responses.

Acceptance:

- Validate writes no submission.
- Cancel writes nothing.
- The native Submit choice resends the same saved original capture; the API revalidates and saves the received capture. No server-side binding to the earlier confirmation is required (user-approved private-group tradeoff).
- Identical and different valid repeats both return already_submitted with the same already-saved message and a fresh scoreboard for copying; the original result remains unchanged.
- No player correction path exists.

#### User-accepted Phase 4 pilot exceptions

On October 21, 2026, the user explicitly chose to keep the shared native Shortcut e08b3d9025d44190bf1053cdc9e332f9 unchanged after static inspection identified these behaviors: (1) the Safari capture is copied before validation, so raw capture data can replace the clipboard even on later Cancel/error; (2) only submitted enters the submit completion branch, while already_submitted is handled on validation but not the submit race/retry path; (3) scoreboard Copy actions have no null/empty guard. These are accepted pilot tradeoffs for the small group, not required fixes or native acceptance blockers. Do not re-request changes or silently modify the Shortcut. The stricter build guidance remains the deferred target for a future revision. Backend responses, saved-result uniqueness and the score-only scoreboard format are unchanged. Native clipboard preservation on Cancel/error/unavailable-scoreboard and submit-race clipboard copying are not claimed as proved.

### Phase 5A — Shortcut source, builds and migration

Status (October 25): upload source compiled, inspected, signed; core iPhone flows accepted by user report. Formal operational signing, independently verified rollback, bounded integrity and handoff remain open. Native edge-case/race/general reproducibility are waived, not passed. See daily-games-tracker/PROJECT_STATUS.md for distinct 5A reference and later 5B artifacts. Deliverables below retain requirements.

Deliverables:

- One maintained upload source consuming the exact existing `capture-safari.js`; preserve numeric version 1, nested capture and the thin-client API contract.
- Enforced compiler/toolchain pins, unsigned checks, explicit generated-plist tests, provenance manifests, durable evidence and a separate approved-payload signing path.
- Native Safari/Text input, original-object binding, runtime JSON and Import Question-to-Device-header proofs.
- A complete upload client with one shared guarded-copy/completion section for `submitted` and `already_submitted`, explicit cancellation/failure stops, and clean installation proof.
- Known reference/rollback, reviewed public export process, and exact accepted source/artifact handoff to 5B.

Acceptance:

- Both games pass private compiled-client validation/Cancel/repeat/completion/error/update tests; any real new-score test is separately approved and independently verified.
- Exact capture bytes, JSON types, runtime credential binding, clipboard behavior and saved-result integrity are proved at the appropriate automated/native/database layers.
- The actual signed artifact imports/runs on iPhone; a signer response/header alone is insufficient. Reproducibility has an explicit evidenced disposition.
- The existing shared pilot and its accepted exceptions remain unchanged. New template sharing, install URL/version changes and production deployment are separate release decisions.

### Phase 5B — Website sessions and Login with Device

Status (October 25): website/API, compiled login and preview/core iPhone flows closed under bounded acceptance October 23. Later Safari return-menu correction built/signed; exact newer native acceptance is not established. Waivers remain limitations. See daily-games-tracker/PROJECT_STATUS.md. Phase 10 replaces the standalone login UI.

Deliverables:

- Server-side hashed opaque sessions and 400-day Secure HttpOnly cookie with rolling 7-day inactivity and renewal capped at the original absolute expiry.
- Shortcut activity refresh of only still-active player sessions; logout and immediate device/player revocation.
- Two-minute browser-bound, one-use, race-safe start/approve/complete device-login flow and login/logout UI.
- `DGT_LOGIN_V1:` dispatch first in the accepted 5A compiler source, preserving its accepted upload behavior, with explicit approval/Cancel and automatic/manual return. Every login branch stops without capture/upload/clipboard fallthrough.
- Exact app/Shortcut integration evidence and real-iPhone Safari/PWA proof after separately authorized preview/signing steps.

Acceptance:

- Registration creates the initial browser session; Login with Device establishes the initiating Safari or installed PWA context's session and preserves dated-page return, refresh and logout.
- Challenge expiry, browser binding, replay protection, concurrent approval/completion and transactional rollback hold; wrong-browser/cancel/unavailable/lost-response recovery is proved.
- Active sessions extend from website and Shortcut activity without extending the original hard cap or resurrecting expired/revoked sessions; both cookies remain inaccessible to JavaScript.
- Automatic PWA return is observed rather than assumed; manual return to the original waiting context plus Check login works.
- Original pilot decisions and nonblocking CPU monitoring remain. No real score submission is needed for login acceptance; distribution and production remain separate gates.

5B local review/test preparation can proceed during 5A, but dependent native integration uses 5A's accepted foundation. Phases 6–9 retain their existing numbering and scope.

### Phase 6 — Daily and all-time leaderboards

**Current status:** Implemented and preview-deployed.

Deliverables:

- Combined Daily page with one table per game.
- Combined public All-Time page.
- Ranking badges, ties, sorting, sticky headers, and mobile scrolling.
- Per-game current-day detail locks.
- Historical access.
- Movement calculation against previous-day close.

Acceptance:

- Results and ranks match fixture calculations.
- Zero and missing are distinct.
- Locked current-day details are absent from API responses.
- All-time is public and includes current results.
- Admin corrections immediately change derived rankings.

### Phase 7 — Clipboard sharing

**Current status:** Implemented and verified; full launch native privacy matrix remains pending.

The canonical score-only renderer and automatic completion payload for new saves and valid repeats were pulled forward into Phase 4. Reuse that renderer; this phase adds the website copy endpoint and UI button.

Deliverables:

- Server-generated copy endpoint and UI button.
- Exact canonical format for each emitted game section.
- Clipboard text ends after the final MapTap round line; `wht_url` remains a separate response field for Open WHT.

Acceptance:

- Includes only submitted active players, and omits any game section with no submission for the selected day.
- Krillion rounds contain emojis only and no answers/numbers.
- MapTap rounds contain numbers only and no emojis.
- Rank badges are absent.
- All-time rank/total/movement are inline with each daily line.
- Movement is relative to previous day, not previous submission.

### Phase 8 — Admin dashboard

**Current status:** Implemented, reviewed and preview-deployed; operational account recovery remains open.

Deliverables:

- Cloudflare Access protection.
- Player/device/session management.
- Manual historical entry and finalized-result correction/deletion.
- Audit log viewer.

Acceptance:

- Unauthenticated/non-admin requests cannot reach admin APIs.
- Every material mutation has an audit entry and reason.
- Device revocation takes effect immediately.
- Score edits revalidate and rankings update immediately.

### Phase 9 — Hardening and launch

**Current status:** Engineering reviewed clean and preview-deployed to 944ff1a6. Full launch readiness remains open: see daily-games-tracker/PHASE_9_LAUNCH_GATES.md and daily-games-tracker/PROJECT_STATUS.md.

Deliverables:

- Security headers, rate limits, redacted logging, monitoring.
- Accessibility and iPhone usability pass.
- Backup/restore rehearsal.
- Production deployment and installation/help page.
- Seven-player pilot before full rollout.

Acceptance:

- All automated, integration, and real-device tests pass.
- Pilot players can install, submit both games, log in, view allowed tables, and copy standings.
- Free-tier usage dashboard shows ample margin.
- Admin can recover from a parser failure or incorrect submission without direct database editing.

---

### Phase 10 — User page/tab (final additional phase)

**Implemented, independently reviewed, and preview-deployed.** [Requirements and evidence](daily-games-tracker/PHASE_10_USER_PAGE_PLAN.md): canonical `/user` with `/login` alias; permanent fourth dock tile after All-Time; 401-only logged-out Daily redirect with safe dated return; no signed-in Daily identity/logout card; polished Login with Device; signed-in per-game stats, supported Shortcut redownload and logout. Metrics/layout decisions are recorded in the Phase 10 design. Physical-device/native evidence and existing Phase 5A/Phase 9 launch gates remain open. Preview alias: `https://preview.winstitute-of-higher-thinking.pages.dev`; latest deployment: `3e7e7979`.

## 20. Launch checklist

**Evidence boundary:** Release checklist; preview engineering does not establish production/manual/operational passes. See [Phase 9 dispositions](daily-games-tracker/PHASE_9_LAUNCH_GATES.md).

- [x] Implement, preview-deploy, and verify Phase 10; see `daily-games-tracker/reports/phase10-user-page-verification.md`.
- [ ] Refresh affected login/privacy/device evidence through separately authorized preview and real-device checks.

- [ ] Confirm current Krillion and MapTap terms are compatible with the intended private use.
- [ ] Create Cloudflare Pages project and D1 binding.
- [ ] Configure production secrets and environment separation.
- [ ] Configure Cloudflare Access for admin paths.
- [ ] Apply and verify migrations.
- [ ] Seed game/scoring/rank configuration.
- [ ] Publish universal Shortcut and record its version/install URL.
- [ ] Test both games on at least two iOS versions.
- [ ] Test Safari and Home Screen PWA Login with Device.
- [ ] Create administrator recovery documentation.
- [ ] Create players and send one-use device invitations.
- [ ] Run seven-player pilot.
- [ ] Verify clipboard output contains no Krillion answers.
- [ ] Verify backup/export and restore.
- [ ] Enable monitoring and review free-tier usage.

---

## 21. Definition of done

Version 1 is complete when:

1. An administrator can create a player and send a one-use Add Device invitation.
2. A player can copy one authorization code, install the universal Shortcut, and paste the code once through Apple's Import Question.
3. The same Shortcut can capture Krillion through Safari DOM text and MapTap through its native Share Sheet text.
4. Cloudflare can detect, parse, and strictly validate either game, return a native confirmation, and save only after confirmation.
5. Wrong Share methods, unfinished games, malformed rounds, wrong dates, score mismatches, revoked devices, and unsupported formats all fail without saving data.
6. Players cannot manually alter extracted results; administrators can correct data with an audit trail.
7. Current-day detailed tables unlock per player, per game, only after that player submits that game.
8. Historical daily tables are available to authenticated players, and all-time standings are public.
9. Daily and all-time ranks, competition ties, game-themed site badges, null handling, and previous-day movement match this specification.
10. Copy Leaderboard includes submitted active players, omits game sections with no submission for the selected day, includes daily scores and inline all-time rank/total/movement, Krillion emoji-only rounds, MapTap number-only rounds, no rank emojis, no Krillion answers, and no trailing URL section.
11. Login with Device restores a browser/PWA session without email, password, PIN, or Apple ID.
12. Website sessions use the 400-day first-party cookie and rolling seven-day server inactivity model described here.
13. The administrator can manage players/devices, revoke access, backfill/correct results, and review audits.
14. The system is deployed on Cloudflare Pages/Functions/D1 and operates comfortably within current free-tier limits for the group.
15. Permanent fourth User tile opens /user; logged-out Daily visitors reach polished sign-in, signed-in User shows per-game stats/Shortcut redownload/logout, and Daily has no signed-in/logout box.

---

## 22. Authoritative platform references

These references verify the platform capabilities used by this plan. Product limits and Apple UI details should be rechecked during implementation.

### Apple Shortcuts

- [Use Run JavaScript on Web Page on iPhone or iPad](https://support.apple.com/guide/shortcuts/use-the-run-javascript-on-webpage-action-apdb71a01d93/ios)
- [Launch a Shortcut from another app through the Share Sheet](https://support.apple.com/en-gb/guide/shortcuts/apd163eb9f95/ios)
- [Add Import Questions to shared Shortcuts](https://support.apple.com/guide/shortcuts/add-import-questions-to-shared-shortcuts-apdf330fd3a0/ios)
- [Run a Shortcut using the `shortcuts://` URL scheme](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios)

### Cloudflare

- [Cloudflare Pages](https://developers.cloudflare.com/pages/)
- [Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Pages Functions D1 bindings](https://developers.cloudflare.com/pages/functions/bindings/)
- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [D1 overview](https://developers.cloudflare.com/d1/)
- [D1 pricing and free limits](https://developers.cloudflare.com/d1/platform/pricing/)
- [Cloudflare Access for Workers and paths](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare product pricing, including Zero Trust free-user allowance](https://www.cloudflare.com/plans/)

### Safari cookie behavior

- [WebKit: client-created cookies and the seven-day ITP cap](https://webkit.org/blog/8613/intelligent-tracking-prevention-2-1/)
- [WebKit discussion of server-set first-party cookies and the industry 400-day cap](https://bugs.webkit.org/show_bug.cgi?id=237350)

The authentication cookie in this plan is first-party, server-set, Secure, and HttpOnly. The server-side seven-day inactivity rule is the actual authorization control; the long cookie lifetime only preserves the opaque lookup key.
