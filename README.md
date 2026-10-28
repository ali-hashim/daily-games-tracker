# Daily Game Tracker

WHT explores an iPhone-first daily game tracker for Krillion and MapTap. A React interface, TypeScript server functions and a SQLite-compatible schema demonstrate invitation onboarding, device authorization, browser sessions, result validation, atomic submission and scoreboard formatting.

This is the maintained public repository for `ali-hashim/daily-games-tracker`. The one-time migration from the private WHT workspace preserves synthetic test data and reviewed application source while omitting hosted deployment identities. The project is licensed under MIT.

## Explore the source

- `daily-games-tracker/src/`: interface and registration/device-login flows.
- `daily-games-tracker/functions/`: API, session and authorization implementation.
- `daily-games-tracker/parsers/` and `shared/`: capture validation, game rules and ranking.
- `daily-games-tracker/migrations/`: database schema and uniqueness constraints.
- `daily-games-tracker/tests/`: unit and integration coverage using synthetic captures.
- `daily-games-tracker/shortcut/capture-safari.js`: Safari webpage capture source.
- `daily-games-tracker/shortcut/cherri-migration/`: experimental Cherri sources and offline preparation/inspection harness.

Authentication needs independently configured identity infrastructure for a hosted installation. This source contains no device credential, configured install link, hosted origin, deployment ID, project/account ID, D1 ID, Access audience or administrator identity; those values are supplied through private platform configuration, while local placeholders live in `.env.example`. The pinned Cherri GitHub Action compiles unsigned probes and the full client; the separate protected Actions-only workflow may send one exact reviewed package to HubSign after compile/inspect, but its configuration remains unprovisioned and no operational signing run is claimed. Neither workflow deploys the application. Native behavior and application readiness remain separate from structural build checks.

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

For a local Pages/Functions/D1 session, run `npm run db:local:migrate`, `npm run build` and `npm run dev:pages`; open `http://localhost:8788`. The all-zero database identifier is an inert local placeholder. Remote D1 resource IDs, Access audiences, administrator identities and install values remain private external configuration.

Remote operations are explicit and require an authenticated Wrangler session plus the applicable Cloudflare Access and database checks. From `daily-games-tracker/`, the available commands are `npm run db:preview:migrate`, `npm run deploy:preview`, `npm run db:production:migrate` and `npm run deploy:production`. CI does not invoke these commands. See [CLOUDFLARE_SETUP.md](daily-games-tracker/CLOUDFLARE_SETUP.md) for the operator sequence.

Tests cover parsing, ranking, capture limits/privacy, authorization, registration, device login, sessions and duplicate-safe submissions. Fixed fixture dates are test clocks. All capture/result fixtures are generated examples and do not represent player activity. Local simulated coverage does not establish Safari layout, iPhone behavior, cloud performance or production readiness.

See [PUBLIC_REVIEW.md](PUBLIC_REVIEW.md) for the historical one-time export review. [PUBLIC_MANIFEST.json](PUBLIC_MANIFEST.json) and [PUBLIC_DIFF.json](PUBLIC_DIFF.json) are historical migration artifacts; the canonical checkout and its normal branch/PR/CI workflow are the maintained source going forward.

## Full upload Shortcut source

The source for `Upload to WHT` is in `daily-games-tracker/shortcut/cherri-migration/source/upload-to-wht.cherri`. It uses native icon color `431817727`, glyph `59742`, and the confirmation option `Submit Results`. The normalizer, strict native contract, unsigned build harness and synthetic mutation tests are included. The earlier synthetic routing probe keeps its independent fixture labels.

The full client receives its runtime origin from private external configuration when it validates and submits captures. Safari capture reads the user-shared page. Completion can open a server-returned WHT URL; update-required branches can open a server-returned install URL. Hosted origins, deployment identities and install links are intentionally omitted from this public source. Signing is handled by the protected GitHub Actions workflow; no runtime signing worker or endpoint is required.

The unsigned workflow uses pinned compiler, Go and Action versions and read-only repository permissions. The separate Actions-only signing workflow runs automatically for relevant reviewed pushes to protected `main` and supports optional protected manual recovery; it compiles and inspects through pinned CI, records a GitHub pending lease, sends one exact HubSign POST and stores only private R2 signing state and digest-verified signed objects. Its protected configuration remains unprovisioned, so no operational CI signing run or signed delivery is claimed; user-directed retries of previously ambiguous outcomes are authorized when the exact reviewed package, source/digest checks and valid private R2 state pass, without repeat approval.

The current candidate validation includes 24 application test files and 385 public tests, typechecking, D1 schema checks, a production build, and a local Pages/Functions/D1 smoke run. Thirty-six private proof-diagnostic tests remain outside the public tree. Shortcut tooling checks remain separate and use the pinned Cherri workflow. These checks establish synthetic structural properties and local behavior; they do not establish complete iPhone acceptance or production readiness.

Read [DEVELOPMENT_WORKFLOW.md](DEVELOPMENT_WORKFLOW.md) for normal changes. Read [skills/sanitized-push/SKILL.md](skills/sanitized-push/SKILL.md) for the one-time migration and any future public push review; do not create a second export checkout or repeat the migration after cutover.
