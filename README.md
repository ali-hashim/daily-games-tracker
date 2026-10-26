# Daily Game Tracker

WHT explores an iPhone-first daily game tracker for Krillion and MapTap. A React interface, TypeScript server functions and a SQLite-compatible schema demonstrate invitation onboarding, device authorization, browser sessions, result validation, atomic submission and scoreboard formatting.

This is the maintained public repository for `ali-hashim/daily-games-tracker`. The one-time migration from the private WHT workspace preserves synthetic test data, reviewed application source, and safe runtime resource identifiers. The project is licensed under MIT.

## Explore the source

- `daily-games-tracker/src/`: interface and registration/device-login flows.
- `daily-games-tracker/functions/`: API, session and authorization implementation.
- `daily-games-tracker/parsers/` and `shared/`: capture validation, game rules and ranking.
- `daily-games-tracker/migrations/`: database schema and uniqueness constraints.
- `daily-games-tracker/tests/`: unit and integration coverage using synthetic captures.
- `daily-games-tracker/shortcut/capture-safari.js`: Safari webpage capture source.
- `daily-games-tracker/shortcut/cherri-migration/`: experimental Cherri sources and offline preparation/inspection harness.

Authentication needs independently configured identity infrastructure for a hosted installation. This source contains no device credential or configured install link; administrator email and install URL values are provisioned as per-environment Cloudflare Secrets, while local placeholders live in .env.example. The maintained full-client source uses the reviewed public preview origin described below. GitHub Actions compiles unsigned Cherri probes and the full client; it does not deploy the application or sign a Shortcut. Native behavior and application readiness remain separate from structural build checks.

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

For a local Pages/Functions/D1 session, run `npm run db:local:migrate`, `npm run build` and `npm run dev:pages`; open `http://localhost:8788`. The all-zero database identifier is a local placeholder. The reviewed preview and production D1 resource IDs and preview Access audience are intentional public configuration values; administrator and install values come from local placeholders or the configured Cloudflare Secrets.

Remote operations are explicit and require an authenticated Wrangler session plus the applicable Cloudflare Access and database checks. From `daily-games-tracker/`, the available commands are `npm run db:preview:migrate`, `npm run deploy:preview`, `npm run db:production:migrate` and `npm run deploy:production`. CI does not invoke these commands. See [CLOUDFLARE_SETUP.md](daily-games-tracker/CLOUDFLARE_SETUP.md) for the operator sequence.

Tests cover parsing, ranking, capture limits/privacy, authorization, registration, device login, sessions and duplicate-safe submissions. Fixed fixture dates are test clocks. All capture/result fixtures are generated examples and do not represent player activity. Local simulated coverage does not establish Safari layout, iPhone behavior, cloud performance or production readiness.

See [PUBLIC_REVIEW.md](PUBLIC_REVIEW.md) for the historical one-time export review. [PUBLIC_MANIFEST.json](PUBLIC_MANIFEST.json) and [PUBLIC_DIFF.json](PUBLIC_DIFF.json) are historical migration artifacts; the canonical checkout and its normal branch/PR/CI workflow are the maintained source going forward.

## Full upload Shortcut source

The source for `Upload To WHT` is in `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri`. It uses native icon color `431817727`, glyph `59742`, and the confirmation option `Submit Results`. The normalizer, strict native contract, unsigned build harness and synthetic mutation tests are included. The earlier synthetic routing probe keeps its independent fixture labels.

The full client contacts the reviewed public preview origin `https://preview.example.invalid` to validate and submit captures. Safari capture reads the user-shared page. Completion can open the returned WHT URL; update-required branches open a returned install URL. These runtime destinations are client behavior, not requests made by unsigned CI. The explicit signer helper retains `https://hubsign.routinehub.services/sign`; unsigned CI never sends to that service.

The unsigned workflow uses pinned compiler, Go and Action versions and read-only repository permissions. The separate signing workflow is permanently disabled for this publication, with its false condition and all-zero reviewed-commit sentinel preserved. Signing activation, deployment and installation are outside this source update.

The current candidate validation includes 24 application test files and 384 tests, typechecking, D1 schema checks, a production build, and a local Pages/Functions/D1 smoke run. Shortcut tooling checks remain separate and use the pinned Cherri workflow. These checks establish synthetic structural properties and local behavior; they do not establish complete iPhone acceptance or production readiness.

Read [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) for normal changes. Read [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md) for the one-time migration and any future public push review; do not create a second export checkout or repeat the migration after cutover.
