# Public snapshot review

This file records the scope and validation status of the curated public repository [`ali-hashim/daily-games-tracker`](https://github.com/ali-hashim/daily-games-tracker). It was prepared as a clean source snapshot; the authoritative workspace history and unrelated local work were not published. The repository uses the owner-selected MIT license, including the project icons the owner approved for publication.

## Included scope

The allowlist includes the React application, backend functions, game parsers, shared types/rules, service worker, schema migrations, local-only configuration, static application assets, synthetic tests, Safari capture source and Cherri migration experiments. Only the local schema and Pages smoke scripts remain from the application scripts directory. `PUBLIC_MANIFEST.json` lists every included file with its byte size and SHA-256 hash; the manifest excludes itself to avoid circular hashing.

## Exclusions and replacements

- All original Git metadata/history, root project plans, historical phase reports, deployment/access setup instructions, pilot/handoff notes, private reports, diagnostic workers, network probes, CPU profilers, Shortcut download tools and live configuration were omitted.
- Parser diagnostic functions `_lib/parser-proof.ts`, `admin/parser-proof.ts` and `api/admin/parser-proof.ts`, their public JavaScript and both diagnostic test suites were omitted together. The removed modules imported captured personal data.
- The Safari capture instrumentation wrapper, public proof text, generation script and the single test asserting their measurements were omitted. The remaining capture/privacy/limits/parser tests are retained without weakened assertions.
- All 21 capture/result fixture files and their dependent test expectations were reused from the earlier synthetic derivative. They replace prompts, answers, score vectors/totals, puzzle identifiers and visible text/nodes. Names containing `iphone` describe a schema test case, not a personal capture. Fixed dates and sequential round numbers remain test-clock/protocol constraints.
- Configuration contains an all-zero local database identifier and a reserved example administrator email. Real project/database identifiers, personal identity, Access audience/domain, hosted origins, device credentials and installation links are absent. Synthetic test credentials and constructed synthetic URLs remain to test authentication and strict URL validation; they are not usable configuration.
- Remote database/deployment npm commands were omitted. The only hosted workflow is the credential-free Cherri compile/inspection experiment: it builds the pinned compiler in Actions and compiles unsigned synthetic probes. It does not sign, distribute, contact WHT, or use repository secrets.

## Validation of this candidate

- All four TypeScript checks passed.
- Lint and application formatting checks passed.
- `npm test` passed **202 tests in 14 files**.
- `npm run build` passed with Vite; generated assets were removed after validation.
- `npm run test:database` was attempted locally but blocked before assertions by Windows sandbox restrictions: workerd reported `GetFinalPathNameByHandleW: #5 Access is denied`. Wrangler also could not create its default log file. This check is **not verified**.
- `npm run test:smoke` was not run because it uses the same blocked local workerd/D1 runtime. This check is **not verified**.

The TypeScript checks, lint, formatting, 202 unit/integration tests and application build passed during local preparation. The local database and smoke checks remain unverified because the Windows environment blocked file-path operations required by workerd. The Cherri workflow has since run successfully on GitHub Actions: run 17 compiled and structurally inspected probes 01–07 with the pinned Cherri compiler. These checks do not prove iPhone execution or runtime JSON serialization. No deployment was invoked.

The smaller test count reflects the deliberately excluded diagnostics/instrumentation scope. It is not a claim about the original project's historical verification. Functional test assertions and fixture coverage remain in the candidate; local synthetic tests do not prove native Safari behavior or cloud performance.

Validation temporarily used a separate local copy of existing dependencies. Dependencies, caches, generated assets, runtime files, logs and temporary validation helpers were removed before creating the final manifest. No junctions or symlinks remain.

## Remaining before Shortcut release

- Native iPhone acceptance, including Safari input, runtime JSON types, and null/missing response behavior, remains unverified.
- The unsigned probe artifact is temporary. Signing has not occurred; the exact harmless alert candidate and its checksum are recorded in `daily-games-tracker/shortcut/cherri-migration/toolchain.lock.json`.
- The public snapshot manifest is an integrity inventory, not a security certification. The currently unverified local database and Pages smoke checks should be rerun in a normal development environment.

The bounded privacy scan checked known original personal/resource markers and common credential patterns before publication. It is not a security certification. Game names and domains remain for parser compatibility and do not imply affiliation.
