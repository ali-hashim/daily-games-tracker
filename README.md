# Daily Game Tracker

WHT explores an iPhone-first daily game tracker for Krillion and MapTap. A React interface, TypeScript server functions and a SQLite-compatible schema demonstrate invitation onboarding, device authorization, browser sessions, result validation, atomic submission and scoreboard formatting.

This is a curated source showcase for `ali-hashim/daily-games-tracker`. It includes synthetic test data and local-only configuration. The project is licensed under MIT; publication is pending final owner review.

## Explore the source

- `daily-games-tracker/src/`: interface and registration/device-login flows.
- `daily-games-tracker/functions/`: API, session and authorization implementation.
- `daily-games-tracker/parsers/` and `shared/`: capture validation, game rules and ranking.
- `daily-games-tracker/migrations/`: database schema and uniqueness constraints.
- `daily-games-tracker/tests/`: unit and integration coverage using synthetic captures.
- `daily-games-tracker/shortcut/capture-safari.js`: Safari webpage capture source.
- `daily-games-tracker/shortcut/cherri-migration/`: experimental Cherri sources and offline preparation/inspection harness.

The interface is an implementation demo, not a completed public service. Authentication needs independently configured identity infrastructure for a hosted installation. There is no hosted instance, install link, device credential or deploy workflow in this candidate. Cherri experiments are not a complete or accepted native Shortcut.

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

See [PUBLIC_REVIEW.md](PUBLIC_REVIEW.md) for curation decisions, validation results and publication prerequisites. [PUBLIC_MANIFEST.json](PUBLIC_MANIFEST.json) inventories the review files with sizes and SHA-256 hashes.
