# Experimental Cherri migration

This demo includes credential-free source experiments and a local preparation/inspection harness for an eventual Apple Shortcut implementation. It is not a complete working Shortcut.

The candidate compiler, toolchain and immutable source commit are recorded in `toolchain.lock.json`; their presence does not establish a tested build. Run the harness with `--prepare` to generate the exact Safari capture embedding. `--check` requires an independently verified local compiler. No compiler is downloaded by the harness.

The GitHub Actions workflow builds the credential-free alert probe twice with signing explicitly skipped when its source, inspector, or workflow changes on `main`; it also supports manual runs. It structurally inspects both unsigned outputs, records whether their bytes and full property lists match, and publishes a one-day artifact. The first experiment found nondeterministic ordering in the default input-content metadata; this does not change the alert actions but means the files are not byte-reproducible. It does not run the five-probe harness, contact WHT, or use repository secrets. The alert experiment does not establish Safari Share Sheet behavior, dynamic JSON types, signed import, or iPhone runtime acceptance. `--sign` remains intentionally unavailable. See `source/EXPERIMENTS.md` for limitations.
