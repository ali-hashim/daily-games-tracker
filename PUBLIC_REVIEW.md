# Public snapshot review

The original snapshot review below is historical baseline evidence. The October 23, 2026 source update is recorded afterward; its approved preview origin and unsigned full-client CI supersede earlier statements that hosted origins and full-client source were absent.

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

---

# October 23, 2026 source update review

Refreshed locally October 23, 2026, for approved source publication and unsigned CI in `ali-hashim/daily-games-tracker`. This directory is a narrow source export; it is not a replacement application snapshot or a deployment unit. The previous curated snapshot is untouched. No Git metadata, signed/unsigned Shortcut artifact, install link, real capture, personal result, database output, deployment config, environment file, attachment or compiler binary is included.

## Scope and provenance

The manifest is the explicit allowlist. Canonical source/helper files are byte copies from the maintained local tree, with source SHA-256 recorded per file. LICENSE and .gitattributes come from the prior curated snapshot. The exported sender module is a documented reduced derivative: only full-client JSON-wire/transport support remains. Its executable syntax trees are checked against the canonical implementations. Root review documents and .gitignore are new. The full-client native contract is structural reference data with capture represented by hash, not captured personal data.

The export contains no third-party source or binary distribution. Project code carries the existing MIT license and copyright attribution. Cherri and GitHub Actions are referenced by immutable commits for later workflow fetching; their respective upstream licenses govern them. Go is referenced as a build requirement. No attribution or binary license is transferred by claiming ownership of those tools.

## Destinations and privacy review

The preview origin `https://preview.winstitute-of-higher-thinking.pages.dev` appears in full-client source, inspector and native contract. The older curated snapshot intentionally omitted hosted origins: this additional public disclosure is approved for this publication. It is a public service hostname, not a credential. Preserving it keeps the source and strict inspector coherent with the locally verified client. Changing it would require source, contract and acceptance review.

`https://hubsign.routinehub.services/sign` remains only as signer support and historical lock provenance. The unsigned workflow never invokes send. The disabled workflow cannot execute because its permanent false condition and zero reviewed-commit sentinel remain intact. Public GitHub compiler/Action destinations are toolchain references. Loopback URLs and reserved example domains in synthetic probes/tests are deliberate fixtures; the scripts do not contact them during preparation. Runtime service responses can supply WHT and install URLs; completion opens the WHT URL on menu selection, while update branches open install URLs directly. Safari JavaScript reads the user-shared page. No new application request or live service call was made for this export.

Automated scans examine all final files for personal markers, private IPv4 destinations, credential-shaped strings, private keys, JWTs, active iCloud links, deployment config names and unexpected binary extensions. Literal synthetic mutation values and protocol header names are reviewed in their test context. The known preview hostname is an explicit exception. Manual review covered the source, native contract, all exported helpers, lock, workflows, tests and documentation. This is bounded review, not a security certification.

## Local verification

On the earlier export before the cosmetic refresh: toolchain/workflow lock verification passed; all 29 Node mutation tests passed; all 12 Python tests passed (nine full-client contract regressions and three focused offline sender tests). Source preparation passed for seven probes and thirteen synthetic runtime fixtures. One complete-client build using the existing pinned local Cherri compiler passed normalizer/native inspection and exact capture embedding. Generated output was kept outside the final inventory or removed from this directory after verification. Signing-package tests used synthetic payloads and injected fake transports only; no real signing package, signature, install link, WHT request, deployment, remote write or workflow execution was produced.

The reduced sender's executable definitions are compared to their maintained canonical counterparts. All required local build and workflow helper paths exist. Workflow static checks retain read-only permissions, Action/runner/compiler/Go pins, explicit unsigned flags, repeat full builds, strict contract comparison and fail-closed signing guards. These were local checks. The refreshed full-client name, icon and menu label were not rebuilt or retested, as requested. Updated unsigned CI has not yet run on GitHub.

## Publication scope

Publication of sanitized source to the existing public repository and unsigned CI is approved. The full client now has the cosmetic name `Upload To WHT`, icon color `431817727`, glyph `59742`, and `Submit Results` confirmation option. This refresh does not add a fresh verification claim. The public repository application and previously curated synthetic fixtures are preserved. Signing remains permanently disabled: the permanent false condition and all-zero trusted commit sentinel are unchanged. No signing dispatch, deployment, installation link or private Git history is included.

This published tree overlays the narrow source export onto public baseline `ab0a7f17f83c8ef49684b1d243a69cc2a6aaa972`. Unchanged public application code, synthetic fixtures, placeholder configuration and attribution remain prior-reviewed baseline input. This publication inventory covers the complete resulting public tree; the narrow local export and private audit material are not published. The root README and this review retain the earlier public context. The existing ignore rules are preserved, with temporary output excluded. Root `AGENTS.md` and the repository publication skill carry the rules for future changes.
