# Daily scoreboard score-only gating implementation plan

## Implementation name

`daily-scoreboard-score-only-gating`

## Objective

Replace whole-table daily locks with server-enforced score-only responses for
players who have not submitted the selected game/date. Keep questions and
answers available through the existing popovers only after the player's own
submission, while preserving public score sharing and historical unlocks after
the worldwide window closes.

## Tasks

1. Extend the shared daily leaderboard types with score-only and full-detail
   variants. A locked game must still expose players and round scores/emojis,
   but no `prompt` or `answer` fields.
2. Refactor `functions/_lib/leaderboards.ts` so it always builds rankings and
   score-only rows, while selecting `prompt`/`answer` only when the selected
   game's date is expired or the authenticated player has submitted it. Keep
   active-player, rank, zero/null, and identity/date rules unchanged.
3. Update `LeaderboardPages.tsx` to always render the table. For score-only
   games, render ordinary noninteractive score/emoji cells and suppress
   question, answer, and scoring controls that require protected details. For
   MapTap, replace protected inline prompts with a neutral round label while
   locked. Preserve full popovers after unlock.
4. Keep the existing daily API, authentication, session refresh, `no-store`
   response policy, and service-worker network-only behavior. No new endpoint or
   database migration is needed.
5. Add tests before implementation and record the expected failures. Then add
   integration coverage proving:

   - an unsubmitted player receives visible scores/ranks/emojis;
   - locked responses contain no prompt/answer keys, secret text, or protected
     SQL selections;
   - submitting MapTap unlocks only MapTap details;
   - submitting Krillion unlocks only Krillion details;
   - expired dates unlock details for everyone;
   - active/open dates remain score-only until that player submits;
   - ties, inactive players, zero scores, null scores, and worldwide date
     boundaries remain correct.

6. Add UI tests for locked and unlocked question/answer popovers, keyboard
   behavior, DOM disclosure, MapTap labels, and the unchanged shareable table
   shape. Ensure the locked response cannot be unlocked by client state alone.
7. Run focused tests, the full suite, typecheck, changed-file lint,
   formatting, build, and Cloudflare preview smoke checks. Review the actual
   API payload and verify no protected answer/prompt text appears before
   submission.

## Key files

- `shared/leaderboard.ts`
- `functions/_lib/leaderboards.ts`
- `functions/api/leaderboards/daily.ts`
- `src/pages/LeaderboardPages.tsx`
- `src/styles.css`
- `tests/integration/leaderboards.test.ts`
- `tests/unit/leaderboard-pages.test.ts`

## Acceptance rule

For a selected game/date, `hasPlayerSubmission(player, game, date)` controls
detail access while the challenge is open. After the worldwide window closes,
the historical leaderboard returns full details to all authenticated viewers.
All score-only responses must omit protected data at the server boundary.
