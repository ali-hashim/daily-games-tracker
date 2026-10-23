# Daily Game Tracker

WHT explores an iPhone-first daily game tracker for Krillion and MapTap. A React interface, TypeScript server functions and a SQLite-compatible schema demonstrate invitation onboarding, device authorization, browser sessions, result validation, atomic submission and scoreboard formatting.

This is the curated public source showcase for `ali-hashim/daily-games-tracker`. It includes synthetic test data and local-only configuration. The project is licensed under MIT.

## Explore the source

- `daily-games-tracker/src/`: interface and registration/device-login flows.
- `daily-games-tracker/functions/`: API, session and authorization implementation.
- `daily-games-tracker/parsers/` and `shared/`: capture validation, game rules and ranking.
- `daily-games-tracker/migrations/`: database schema and uniqueness constraints.
- `daily-games-tracker/tests/`: unit and integration coverage using synthetic captures.
- `daily-games-tracker/shortcut/capture-safari.js`: Safari webpage capture source.
- `daily-games-tracker/shortcut/cherri-migration/`: experimental Cherri sources and offline preparation/inspection harness.

The interface is an implementation demo, not a completed public service. Authentication needs independently configured identity infrastructure for a hosted installation. This source contains no install link, device credential or deployment workflow. The maintained full-client source uses the reviewed public preview origin described below. GitHub Actions compiles unsigned Cherri probes and the full client; it does not deploy the application or sign a Shortcut. Native behavior and application readiness remain separate from structural build checks.

## Local development

Use Node.js 22 and run these commands from `daily-games-tracker/` after installing the declared dependencies:

```sh
npm ci
npm run format
npm run lint
npm run typecheck
npm test
npm run test:database
npm run build
npm run test:smoke
```

For a local Pages/Functions/D1 session, run `npm run db:local:migrate`, `npm run build` and `npm run dev:pages`; open `http://localhost:8788`. The all-zero database identifier is a local placeholder. Remote database targets and deployment commands were omitted.

Tests cover parsing, ranking, capture limits/privacy, authorization, registration, device login, sessions and duplicate-safe submissions. Fixed fixture dates are test clocks. All capture/result fixtures are generated examples and do not represent player activity. Local simulated coverage does not establish Safari layout, iPhone behavior, cloud performance or production readiness.

See [PUBLIC_REVIEW.md](PUBLIC_REVIEW.md) for curation decisions and validation results. [PUBLIC_MANIFEST.json](PUBLIC_MANIFEST.json) inventories the public files with sizes and SHA-256 hashes.

## Full upload Shortcut source

The source for `Upload To WHT` is in `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri`. It uses native icon color `431817727`, glyph `59742`, and the confirmation option `Submit Results`. The normalizer, strict native contract, unsigned build harness and synthetic mutation tests are included. The earlier synthetic routing probe keeps its independent fixture labels.

The full client contacts the reviewed public preview origin `https://preview.winstitute-of-higher-thinking.pages.dev` to validate and submit captures. Safari capture reads the user-shared page. Completion can open the returned WHT URL; update-required branches open a returned install URL. These runtime destinations are client behavior, not requests made by unsigned CI. The explicit signer helper retains `https://hubsign.routinehub.services/sign`; unsigned CI never sends to that service.

The unsigned workflow uses pinned compiler, Go and Action versions and read-only repository permissions. The separate signing workflow is permanently disabled for this publication, with its false condition and all-zero reviewed-commit sentinel preserved. Signing activation, deployment and installation are outside this source update.

On the prior isolated source export on October 23, 2026, 29 Node tests and 12 Python tests passed, along with offline preparation and one pinned full-client build. Those checks preceded the final cosmetic name, icon and menu changes and were not rerun for those changes. Published CI results must be assessed separately. Tests establish synthetic structural properties; they do not establish complete iPhone acceptance or reproducibility of every artifact byte.

Read [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md) before preparing future public exports or pushes. [PUBLIC_DIFF.json](PUBLIC_DIFF.json) identifies the exact overlay against the public baseline commit; existing public application files are preserved.
