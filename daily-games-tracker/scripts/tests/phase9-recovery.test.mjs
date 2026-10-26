import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const rehearsalPath = resolve(repoRoot, "daily-games-tracker/scripts/phase9-rehearse-recovery.mjs");

test("recovery rollback verification rejects an emoji-only escaped mutation", async () => {
  const rehearsal = await readFile(rehearsalPath, "utf8");
  const anchor = "    const afterFailureRounds = await appRows(\n";
  const mutation =
    "    await db.prepare(\"UPDATE round_results SET original_emoji = '🚨' WHERE id = 'recovery-round-1'\").run();\n";
  assert.ok(rehearsal.includes(anchor));
  const mutantPath = resolve(
    repoRoot,
    `daily-games-tracker/scripts/.phase9-recovery-emoji-mutant-${process.pid}.mjs`,
  );
  await writeFile(mutantPath, rehearsal.replace(anchor, `${mutation}${anchor}`), "utf8");
  try {
    const result = spawnSync(process.execPath, [mutantPath], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 120_000,
    });
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

    assert.notEqual(result.status, 0, output);
    assert.match(output, /round contents|mid-batch failure/i);
    assert.doesNotMatch(
      output,
      /phase9-protected-krillion-(?:prompt|answer)/,
      "rollback failure output must not expose protected prompt/answer sentinels",
    );
  } finally {
    await rm(mutantPath, { force: true });
  }
});

test("recovery rehearsal contract exercises local export, restore, constraints, migration, and admin recovery", () => {
  const result = spawnSync(process.execPath, [rehearsalPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.equal(result.status, 0, output);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, "pass");
  assert.equal(report.contract.database, "disposable local D1 via Wrangler");
  assert.deepEqual(
    report.steps.map((step) => step.id),
    [
      "migrate-source",
      "seed-source",
      "export-sql",
      "restore-sql",
      "compare-key-rows",
      "compare-constraints",
      "forward-migration",
      "admin-recovery-mid-batch-rollback",
      "admin-recovery",
    ],
  );
  assert.ok(report.steps.every((step) => step.status === "pass"));
  assert.equal(report.recovery.path, "correctSubmission");
  assert.equal(report.recovery.fixture.game_key, "krillion");
  assert.equal(report.recovery.fixture.protected_values_present, true);
  assert.equal(report.recovery.atomic_round_replacement, true);
  assert.equal(report.recovery.submission.final_score, 310);
  assert.deepEqual(report.recovery.rounds.before_ids, [
    "recovery-round-1",
    "recovery-round-2",
    "recovery-round-3",
    "recovery-round-4",
    "recovery-round-5",
    "recovery-round-6",
    "recovery-round-7",
  ]);
  assert.deepEqual(report.recovery.rounds.after_scores, [10, 10, 15, 30, 60, 85, 100]);
  assert.equal(report.recovery.rounds.after_ids.length, 7);
  assert.ok(
    report.recovery.rounds.after_ids.every((id) => !report.recovery.rounds.before_ids.includes(id)),
  );
  assert.equal(report.recovery.atomic_failure_rollback.verified, true);
  assert.deepEqual(
    report.recovery.atomic_failure_rollback.before,
    report.recovery.atomic_failure_rollback.after,
  );
  assert.deepEqual(
    report.recovery.atomic_failure_rollback.before.rounds.scores,
    [0, 10, 15, 30, 60, 85, 100],
  );
  assert.equal(report.recovery.atomic_failure_rollback.before.submission_final_score, 300);
  assert.equal(report.recovery.atomic_failure_rollback.before.audit_count, 0);
  assert.equal(report.recovery.audit.action, "submission.correct");
  assert.equal(report.recovery.audit.redacted, true);
  assert.doesNotMatch(
    JSON.stringify(report.recovery.audit),
    /phase9-protected-krillion-(?:prompt|answer)/,
  );
  assert.equal(report.external_restore.status, "pending");
  assert.match(report.external_restore.note, /Time Travel.*production restore/i);
  assert.equal(report.cleaned_up, true);
});
