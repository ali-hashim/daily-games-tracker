# Experimental Cherri migration

This demo includes credential-free source experiments and a local preparation/inspection harness for an eventual Apple Shortcut implementation. It is not a complete working Shortcut.

The candidate compiler, toolchain and immutable source commit are recorded in `toolchain.lock.json`; their presence does not establish a tested build. Run the harness with `--prepare` to generate the exact Safari capture embedding. `--check` requires an independently verified local compiler. No compiler is downloaded by the harness.

The GitHub Actions workflow builds the credential-free alert probe twice and compiles the Share Sheet, Safari binding, and exact capture probes with signing skipped when their sources, inspector, or workflow change on `main`; it also supports manual runs. It structurally inspects the unsigned outputs and publishes a one-day artifact. The two alert builds differed in the order of default input-content metadata. Probes 01–04 compile and pass their current structural checks, but none has been signed, installed, or executed on iPhone. Probe 05 tests serialized JSON and an Import Question and uses only an unevaluated loopback URL. The workflow does not contact WHT or use repository secrets. `--sign` remains intentionally unavailable. See `source/EXPERIMENTS.md` for limitations.
