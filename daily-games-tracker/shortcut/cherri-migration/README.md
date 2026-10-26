# Experimental Cherri migration

This directory contains maintained credential-free Cherri source, pinned CI
build/inspection, synthetic fixtures, and offline preparation helpers. The
complete upload/login source is retained in
`source/upload-to-wht.cherri`; static checks do not prove native iPhone
execution, Apple signature validity, transport behavior, or production use.

The compiler revision, toolchain, runner, flags, and action pins are recorded
in `toolchain.lock.json`. Run `--prepare` to generate source and synthetic
fixtures under ignored `out/`; the local harness does not download a compiler,
contact WHT, sign a payload, or use credentials. Compile new or modified
Shortcuts only through `.github/workflows/cherri-alert-experiment.yml`.

The workflow compiles the alert, Share Sheet, Safari binding, capture,
JSON/Import Question, routing, and completion probes with signing skipped. It
structurally inspects unsigned outputs and retains short-lived CI artifacts.
Probe values and destinations are synthetic; no device code, player capture,
configured Shortcut, or database evidence is tracked. See
`source/EXPERIMENTS.md` for the bounded evidence and remaining native gates.
