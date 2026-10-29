# Historical local work archive

This directory preserves a small set of source artifacts found in a retired local worktree during the October 29, 2026 portability audit. They are retained as historical records, not as production instructions or active application components.

The proposed second production D1 copy and nightly schedule were canceled before activation. The backup design, synthetic reset script, and reset test are retired. They do not describe an operating backup, authorize resource creation, or establish production recovery. There is no planned reactivation.

The maintenance worker is an undeployed candidate. Its test is historical source evidence only; neither file establishes coverage of production or every deployment alias. Do not deploy or run these files as part of this archive.

No production database, preview database, credentials, private resource identifiers, export data, or private evidence is included. Any future work must start from current approved requirements and the maintained application tree, not by reviving these artifacts.

`test_schema-foreign-key-rejection.patch` preserves an unshipped assertion against source base `328504dc7a02c2cad6d765809f9f2e070fdb922b`, original file blob `db974090f136375d48afdb55866ed6f266686a3b`. Its patch application was checked against that base; the maintained test was not modified or rerun. Review current requirements and test structure before adapting it to a later revision.

The archived patch uses zero context; validate or apply it with Git's --unidiff-zero option against the recorded base.
