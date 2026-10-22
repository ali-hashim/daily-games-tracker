# Credential-free experiment sources

These files are proposed Cherri v2.3.0 inputs. All seven probes compiled and passed their current structural checks in [GitHub Actions run 17](https://github.com/ali-hashim/daily-games-tracker/actions/runs/39805988409), for source commit `e82c5b2b60546d743db344a65deb51663e8b1aba`. The one-day artifact is `cherri-unsigned-probes-01-07` (SHA-256 `6f1d014bbe269125470745eea9109d92dc1b10e6c80ee84ab3f4749f9477d518`). The two harmless alert builds were not byte-identical; deterministic output remains unresolved. No probe has been signed, installed, or executed on iPhone. Probe 05 established that JSON body literals are parsed as static JSON and cannot contain a bare runtime variable. Its narrow custom action definitions emit native Shortcut variable attachments for the assembled request body and nested capture. That plist structure is verified; native iPhone JSON serialization is still unproven.

| Source                        | Purpose                                                                  | Evidence still required                                                             |
| ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `01-alert.cherri`             | Harmless compiler/signer sample; no input, credential, or network        | CI compile and structural checks passed; byte reproducibility unresolved; signing/import separate |
| `02-input.cherri`             | Safari/Text Share Sheet metadata, saved input and type detection         | CI structure passed; native Safari and text runs remain                             |
| `03-safari.cherri`             | Narrow custom JavaScript action with explicit saved webpage binding      | CI structure passed; correct behavior on iPhone remains                            |
| Generated `04-capture.cherri` | Embed the maintained capture source as a rawtext literal                 | CI confirms exact source bytes; native capture remains                             |
| `05-json.cherri`              | Numeric version, native variable body, nested dictionary and Import Question | CI structure passed; a disposable receiver on iPhone must confirm runtime JSON types |
| `06-routing.cherri`           | Synthetic validation/submit statuses, confirmation, shared completion routing | Run 17 compiled and inspected it; native execution is separate |
| `07-completion.cherri`        | Synthetic present/empty/null/missing scoreboard fixtures, guarded copy, shared menu | Run 17 compiled and inspected it; native JSON null/missing behavior is separate |

The JSON probe intentionally exercises a suspected limitation: a dynamic nested dictionary reference may not serialize as a JSON object. It creates a Text action containing synthetic JSON, parses the action result with `getDictionary`, adds the result to a body dictionary through a narrowly defined native Set Dictionary Value action, then supplies that body to a narrowly defined JSON request action. CI confirms the action-output and body variable attachment structure, but only a disposable receiver can prove the runtime JSON type. Loopback on an iPhone addresses the iPhone itself. This source does not provide a phone-reachable receiver; any later local-network receiver/address needs explicit setup, no WHT credentials, and no score endpoint. Never enter a real device code into the mock-code question.

Routing and completion sources contain only synthetic values. Probe 06 has no request or submission action; its submit marker is an inert Text variable. Probe 07 compiles four guarded clipboard branches and one shared Close/Open WHT menu; the destination is `example.invalid`. Compilation and plist inspection do not prove that Shortcuts treats parsed JSON null/missing fields as empty or that an iPhone performs the intended UI behavior. Neither probe is a complete application Shortcut.

The build script has no download/install/sign/network request implementation. Prepare local generated source with:

```text
node daily-games-tracker/shortcut/cherri-migration/build/build.mjs --prepare
```

When unsigned compilation has been authorized and a compiler has independently been built from the pinned source commit, its interface is:

```text
node daily-games-tracker/shortcut/cherri-migration/build/build.mjs --check --compiler /absolute/path/to/cherri
```

Use `--python /absolute/path/to/python` when Python is not on PATH. The caller is responsible for verifying compiler source commit, Go version, build settings and the application commit; the harness records the supplied compiler binary hash but cannot infer its provenance. Generated source/artifacts/reports stay under ignored `out/`. Each compiler invocation receives `--skip-sign --derive-uuids` and a fresh output directory. The supplied compiler is trusted executable code; this harness does not sandbox it.

Byte-reproducibility comparison remains a separate check because UUID derivation alone does not guarantee stable ordering of map-derived fields. This scaffold never produces an accepted complete `Upload to WHT` candidate. Routing/clipboard experiments follow the Safari and JSON compatibility proofs. `--sign` intentionally rejects every invocation until a signer and exact payload receive separate approval.

The first signer candidate is the harmless alert sample recorded in `toolchain.lock.json`, with no personal data, credentials, import question, network action, or WHT reference. The pinned Cherri v2.3.0 signing implementation sends the full serialized Shortcut and its name in a POST request to `https://hubsign.routinehub.services/sign`; private GitHub visibility does not cover that service. Sending even this credential-free sample requires explicit approval.

`inspect-shortcut.py --require-signed` checks only the `AEA1` container header. It does not decrypt the archive, validate an Apple signature, or establish iPhone acceptance.
