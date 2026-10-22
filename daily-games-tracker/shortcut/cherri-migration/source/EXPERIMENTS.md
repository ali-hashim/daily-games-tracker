# Credential-free experiment sources

These files are proposed Cherri v2.3.0 inputs. Probes 01–05 compiled and passed their current structural checks in GitHub Actions run 10. The two alert builds differed in the ordering of default input-content metadata. No probe has been signed, installed, or executed on iPhone. Probe 05 established that JSON body literals are parsed as static JSON and cannot contain a bare runtime variable. Its narrow custom action definitions emit native Shortcut variable attachments for the assembled request body and nested capture. That plist structure is verified; native iPhone JSON serialization is still unproven.

| Source                        | Purpose                                                                  | Evidence still required                                                             |
| ----------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `01-alert.cherri`             | Harmless compiler/signer sample; no input, credential, or network        | CI compile and structural checks passed; byte reproducibility unresolved; signing/import separate |
| `02-input.cherri`             | Safari/Text Share Sheet metadata, saved input and type detection         | CI structure passed; native Safari and text runs remain                             |
| `03-safari.cherri`             | Narrow custom JavaScript action with explicit saved webpage binding      | CI structure passed; correct behavior on iPhone remains                            |
| Generated `04-capture.cherri` | Embed the maintained capture source as a rawtext literal                 | CI confirms exact source bytes; native capture remains                             |
| `05-json.cherri`              | Numeric version, native variable body, nested dictionary and Import Question | CI structure passed; a disposable receiver on iPhone must confirm runtime JSON types |

The JSON probe intentionally exercises a suspected limitation: a dynamic nested dictionary reference may not serialize as a JSON object. It creates a Text action containing synthetic JSON, parses the action result with `getDictionary`, adds the result to a body dictionary through a narrowly defined native Set Dictionary Value action, then supplies that body to a narrowly defined JSON request action. CI confirms the action-output and body variable attachment structure, but only a disposable receiver can prove the runtime JSON type. Loopback on an iPhone addresses the iPhone itself. This source does not provide a phone-reachable receiver; any later local-network receiver/address needs explicit setup, no WHT credentials, and no score endpoint. Never enter a real device code into the mock-code question.

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

`inspect-shortcut.py --require-signed` checks only the `AEA1` container header. It does not decrypt the archive, validate an Apple signature, or establish iPhone acceptance.
