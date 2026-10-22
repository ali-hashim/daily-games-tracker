# Experimental Cherri migration

This demo includes credential-free source experiments and a local preparation/inspection harness for an eventual Apple Shortcut implementation. It is not a complete working Shortcut.

The candidate compiler, toolchain and immutable source commit are recorded in `toolchain.lock.json`; their presence does not establish a tested build. Run the harness with `--prepare` to generate the exact Safari capture embedding. `--check` requires an independently verified local compiler. No compiler is downloaded by the harness.

Unsigned compilation, byte reproducibility, Safari Share Sheet behavior, dynamic JSON types, signed import and iPhone runtime acceptance remain unverified in this public candidate. `--sign` deliberately rejects requests. There are no hosted workflows, deployment scripts or distributed Shortcut artifacts. See `source/EXPERIMENTS.md` for experiment limitations.
