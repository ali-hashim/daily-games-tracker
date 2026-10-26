import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { createServer } from "vite";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const wranglerPath = path.join(projectRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const migrationsRoot = path.join(projectRoot, "migrations");

export const RECOVERY_CONTRACT = Object.freeze({
  database: "disposable local D1 via Wrangler",
  export_format: "SQL",
  external_restore: "pending",
});

const EXTERNAL_RESTORE_NOTE =
  "External D1 Time Travel and production restore remain pending; this rehearsal is local-only.";
const RECOVERY_INITIAL_SCORES = Object.freeze([0, 10, 15, 30, 60, 85, 100]);
const RECOVERY_CORRECTED_SCORES = Object.freeze([10, 10, 15, 30, 60, 85, 100]);
const RECOVERY_EMOJIS = Object.freeze(["⬛", "🫧", "🤡", "🐟", "🦑", "🏮", "🌟"]);
const FORCED_FAILURE_TRIGGER = "phase9_force_mid_batch_failure";
const ROUND_RESULT_COLUMNS =
  "id, submission_id, round_number, prompt, answer, raw_score, original_emoji";

function protectedPrompt(roundNumber) {
  return `phase9-protected-krillion-prompt-${roundNumber}`;
}

function protectedAnswer(roundNumber) {
  return `phase9-protected-krillion-answer-${roundNumber}`;
}

function runWrangler(cwd, args, options = {}) {
  const result = spawnSync(process.execPath, [wranglerPath, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    env: {
      ...process.env,
      DO_NOT_TRACK: "1",
      NO_COLOR: "1",
      WRANGLER_LOG: "log",
      WRANGLER_SEND_ERROR_REPORTS: "false",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_WRITE_LOGS: "false",
      ...(options.env ?? {}),
    },
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const succeeded = result.status === 0;
  if (options.expectFailure) {
    if (succeeded) {
      throw new Error(`Wrangler unexpectedly passed: ${args.join(" ")}\n${output}`);
    }
    return result;
  }
  if (!succeeded) {
    throw new Error(`Wrangler failed: ${args.join(" ")}\n${output}`);
  }
  return result;
}

function parseJsonResult(result, description) {
  const serialized = (result.stdout ?? "").trim() || (result.stderr ?? "").trim();
  try {
    return JSON.parse(serialized);
  } catch (error) {
    throw new Error(
      `Could not parse Wrangler JSON for ${description}: ${error.message}\nstdout: ${result.stdout ?? ""}\nstderr: ${result.stderr ?? ""}`,
    );
  }
}

function createConfig() {
  return JSON.stringify(
    {
      name: "phase9-recovery-rehearsal",
      compatibility_date: "2026-10-20",
      d1_databases: [
        {
          binding: "DB",
          database_name: "phase9-recovery-rehearsal",
          database_id: "00000000-0000-0000-0000-000000000000",
          migrations_dir: "./migrations",
        },
      ],
    },
    null,
    2,
  );
}

async function createDatabaseWorkspace(parent, name) {
  const directory = path.join(parent, name);
  await mkdir(directory, { recursive: true });
  await cp(migrationsRoot, path.join(directory, "migrations"), { recursive: true });
  const configPath = path.join(directory, "wrangler.jsonc");
  await writeFile(configPath, createConfig(), "utf8");
  return { directory, configPath };
}

function localArgs(configPath, ...args) {
  return [...args, "--local", "--config", configPath];
}

function applicationRestoreStatements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.replace(/^(?:\s*--[^\r\n]*(?:\r?\n|$))+/g, "").trim())
    .filter((statement) => statement.length > 0)
    .filter((statement) => !/^PRAGMA\b/i.test(statement))
    .filter((statement) => !/^(?:BEGIN|COMMIT|ROLLBACK)\b/i.test(statement))
    .filter((statement) => !/\bd1_migrations\b/i.test(statement))
    .filter((statement) => !/\bsqlite_sequence\b/i.test(statement));
}

function execute(workspace, sql, description) {
  return runWrangler(
    workspace.directory,
    localArgs(workspace.configPath, "d1", "execute", "DB", "--command", sql),
    { description },
  );
}

function executeJson(workspace, sql, description) {
  const result = runWrangler(
    workspace.directory,
    localArgs(workspace.configPath, "d1", "execute", "DB", "--command", sql, "--json"),
    { description },
  );
  return parseJsonResult(result, description);
}

function queryRows(workspace, sql, description) {
  const response = executeJson(workspace, sql, description);
  if (!Array.isArray(response) || !Array.isArray(response[0]?.results)) {
    throw new Error(`Unexpected Wrangler query response for ${description}`);
  }
  return response[0].results;
}

function roundResultSnapshot(round) {
  return {
    id: round.id,
    submission_id: round.submission_id,
    round_number: round.round_number,
    prompt: round.prompt,
    answer: round.answer,
    raw_score: round.raw_score,
    original_emoji: round.original_emoji,
  };
}

function applyMigrations(workspace) {
  runWrangler(
    workspace.directory,
    localArgs(workspace.configPath, "d1", "migrations", "apply", "DB"),
    { description: "apply local migrations" },
  );
}

function seedSource(workspace) {
  execute(
    workspace,
    [
      "INSERT INTO players(id, display_name) VALUES ('recovery-player', 'Recovery Player');",
      "INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES ('recovery-day', 'krillion', '2026-10-25', '2026-10-25');",
      "INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, parser_version, source_kind) VALUES ('recovery-submission', 'recovery-player', 'krillion', 'recovery-day', 300, 'krillion.v1', 'shared_text');",
      ...RECOVERY_INITIAL_SCORES.map(
        (rawScore, index) =>
          `INSERT INTO round_results(id, submission_id, round_number, prompt, answer, raw_score, original_emoji) VALUES ('recovery-round-${index + 1}', 'recovery-submission', ${index + 1}, '${protectedPrompt(index + 1)}', '${protectedAnswer(index + 1)}', ${rawScore}, '${RECOVERY_EMOJIS[index]}');`,
      ),
    ].join("\n"),
    "seed source database",
  );
}

function readKeyRows(workspace) {
  return {
    players: queryRows(
      workspace,
      "SELECT id, display_name, active FROM players ORDER BY id",
      "compare players",
    ),
    games: queryRows(
      workspace,
      "SELECT id, key, display_name, round_count FROM games ORDER BY id",
      "compare games",
    ),
    game_days: queryRows(
      workspace,
      "SELECT id, game_id, game_date, external_puzzle_key FROM game_days ORDER BY id",
      "compare game days",
    ),
    submissions: queryRows(
      workspace,
      "SELECT id, player_id, game_id, game_day_id, final_score, parser_version, source_kind FROM submissions ORDER BY id",
      "compare submissions",
    ),
    round_results: queryRows(
      workspace,
      "SELECT id, submission_id, round_number, prompt, answer, raw_score, original_emoji FROM round_results ORDER BY id",
      "compare round results",
    ),
  };
}

function readConstraints(workspace) {
  return {
    schema: queryRows(
      workspace,
      "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type, name",
      "compare schema constraints",
    ),
    submissionsForeignKeys: queryRows(
      workspace,
      "PRAGMA foreign_key_list(submissions)",
      "compare submission foreign keys",
    ),
    foreignKeyCheck: queryRows(workspace, "PRAGMA foreign_key_check", "check foreign keys"),
  };
}

function assertEqualJson(left, right, description) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(`${description} differed after restore`);
  }
}

function verifyConstraintFailures(workspace) {
  runWrangler(
    workspace.directory,
    localArgs(
      workspace.configPath,
      "d1",
      "execute",
      "DB",
      "--command",
      "INSERT INTO players(id, display_name) VALUES ('duplicate-player', 'recovery player');",
    ),
    { expectFailure: true, description: "duplicate active player constraint" },
  );
  runWrangler(
    workspace.directory,
    localArgs(
      workspace.configPath,
      "d1",
      "execute",
      "DB",
      "--command",
      "INSERT INTO round_results(id, submission_id, round_number, raw_score) VALUES ('orphan-round', 'missing-submission', 2, 10);",
    ),
    { expectFailure: true, description: "round-result foreign-key constraint" },
  );
}

async function exportSource(source, exportPath) {
  runWrangler(
    source.directory,
    [
      "d1",
      "export",
      "DB",
      "--local",
      "--output",
      exportPath,
      "--config",
      source.configPath,
      "--skip-confirmation",
    ],
    { description: "export local D1 SQL" },
  );
  const sql = await readFile(exportPath, "utf8");
  if (!sql.includes("recovery-submission") || !sql.includes("CREATE TABLE")) {
    throw new Error("local D1 export did not contain the expected schema and key rows");
  }
}

async function restoreExport(restore, exportPath) {
  runWrangler(
    restore.directory,
    localArgs(restore.configPath, "d1", "execute", "DB", "--file", exportPath),
    { description: "restore local D1 SQL" },
  );
}

function verifyForwardMigration(workspace) {
  const initialMigration = path.join(workspace.directory, "migrations", "0001_initial.sql");
  const forwardMigration = path.join(
    workspace.directory,
    "migrations",
    "0002_remove_result_hash.sql",
  );
  runWrangler(
    workspace.directory,
    localArgs(workspace.configPath, "d1", "execute", "DB", "--file", initialMigration),
    { description: "apply initial schema for forward migration" },
  );
  execute(
    workspace,
    "INSERT INTO players(id, display_name) VALUES ('forward-player', 'Forward Player'); INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES ('forward-day', 'maptap', '2026-10-24', '2026-10-24'); INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, result_hash, parser_version, source_kind) VALUES ('forward-submission', 'forward-player', 'maptap', 'forward-day', 820, 'obsolete-result-hash', 'maptap.v1', 'shared_text');",
    "seed pre-migration database",
  );
  runWrangler(
    workspace.directory,
    localArgs(workspace.configPath, "d1", "execute", "DB", "--file", forwardMigration),
    { description: "apply forward migration" },
  );
  const columns = queryRows(
    workspace,
    "PRAGMA table_info(submissions)",
    "verify forward migration columns",
  );
  if (columns.some((column) => column.name === "result_hash")) {
    throw new Error("forward migration retained obsolete result_hash");
  }
  const rows = queryRows(
    workspace,
    "SELECT id, final_score FROM submissions WHERE id = 'forward-submission'",
    "verify forward migration row",
  );
  if (JSON.stringify(rows) !== JSON.stringify([{ id: "forward-submission", final_score: 820 }])) {
    throw new Error("forward migration did not preserve the populated submission");
  }
}

async function verifyAdminRecovery(workspace, exportPath) {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('recovery'); } };",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
      resourcePersistencePath: path.join(workspace.directory, "application-state"),
    }),
  );
  const vite = await createServer({
    root: projectRoot,
    appType: "custom",
    logLevel: "error",
    server: { middlewareMode: true },
  });

  try {
    const { correctSubmission } = await vite.ssrLoadModule(
      path.join(projectRoot, "functions", "_lib", "admin.ts"),
    );
    const db = await runtime.getD1Database("DB");
    const exportedSql = await readFile(exportPath, "utf8");
    for (const statement of applicationRestoreStatements(exportedSql)) {
      try {
        await db.prepare(statement).run();
      } catch (error) {
        throw new Error(
          `application restore statement failed: ${statement.slice(0, 240)}\n${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    const appRows = async (sql, description) => {
      const response = await db.prepare(sql).all();
      if (!Array.isArray(response.results)) {
        throw new Error(`Unexpected application D1 query response for ${description}`);
      }
      return response.results;
    };
    const storedBeforeRounds = await appRows(
      `SELECT ${ROUND_RESULT_COLUMNS} FROM round_results WHERE submission_id = 'recovery-submission' ORDER BY round_number`,
      "verify protected Krillion fixture",
    );
    const protectedValues = storedBeforeRounds.flatMap((round) => [round.prompt, round.answer]);
    const protectedValuesPresent =
      storedBeforeRounds.length === RECOVERY_INITIAL_SCORES.length &&
      storedBeforeRounds.every(
        (round, index) =>
          round.prompt === protectedPrompt(index + 1) &&
          round.answer === protectedAnswer(index + 1) &&
          round.raw_score === RECOVERY_INITIAL_SCORES[index],
      );
    if (!protectedValuesPresent || protectedValues.length !== RECOVERY_INITIAL_SCORES.length * 2) {
      throw new Error(
        "restored application fixture did not contain protected Krillion prompt/answer values",
      );
    }

    const correctionInput = {
      final_score: 310,
      rounds: RECOVERY_CORRECTED_SCORES.map((raw_score, index) => ({
        round_number: index + 1,
        prompt: protectedPrompt(index + 1),
        raw_score,
        original_emoji: RECOVERY_EMOJIS[index],
      })),
      reason: "Rehearse administrator correction after restore",
    };
    const beforeFailureSubmission = (
      await appRows(
        "SELECT final_score FROM submissions WHERE id = 'recovery-submission'",
        "capture pre-failure submission",
      )
    ).at(0);
    const beforeFailureAuditCount = (
      await appRows(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE entity_id = 'recovery-submission'",
        "capture pre-failure audit count",
      )
    ).at(0)?.count;
    const beforeFailure = {
      rounds: {
        ids: storedBeforeRounds.map((round) => round.id),
        scores: storedBeforeRounds.map((round) => round.raw_score),
      },
      submission_final_score: beforeFailureSubmission?.final_score,
      audit_count: beforeFailureAuditCount,
    };

    await db
      .prepare(
        `CREATE TRIGGER ${FORCED_FAILURE_TRIGGER}
         AFTER INSERT ON round_results
         WHEN NEW.submission_id = 'recovery-submission' AND NEW.round_number = 4
         BEGIN
           SELECT RAISE(ABORT, 'phase9 forced mid-batch failure');
         END`,
      )
      .run();
    let forcedFailureMessage;
    try {
      await correctSubmission(
        { DB: db },
        "recovery-submission",
        correctionInput,
        "phase9-rehearsal@example.test",
      );
    } catch (error) {
      forcedFailureMessage = error instanceof Error ? error.message : String(error);
    } finally {
      await db.prepare(`DROP TRIGGER IF EXISTS ${FORCED_FAILURE_TRIGGER}`).run();
    }
    const beforeFailureRoundRows = storedBeforeRounds.map(roundResultSnapshot);
    if (!forcedFailureMessage || !/phase9 forced mid-batch failure/i.test(forcedFailureMessage)) {
      throw new Error(
        `correctSubmission did not expose the forced mid-batch failure: ${forcedFailureMessage ?? "no error"}`,
      );
    }
    const afterFailureRounds = await appRows(
      `SELECT ${ROUND_RESULT_COLUMNS} FROM round_results WHERE submission_id = 'recovery-submission' ORDER BY round_number`,
      "verify mid-batch failure round rollback",
    );
    const afterFailureSubmission = (
      await appRows(
        "SELECT final_score FROM submissions WHERE id = 'recovery-submission'",
        "verify mid-batch failure submission rollback",
      )
    ).at(0);
    const afterFailureAuditCount = (
      await appRows(
        "SELECT COUNT(*) AS count FROM admin_audit_log WHERE entity_id = 'recovery-submission'",
        "verify mid-batch failure audit rollback",
      )
    ).at(0)?.count;
    const afterFailure = {
      rounds: {
        ids: afterFailureRounds.map((round) => round.id),
        scores: afterFailureRounds.map((round) => round.raw_score),
      },
      submission_final_score: afterFailureSubmission?.final_score,
      audit_count: afterFailureAuditCount,
    };
    if (JSON.stringify(beforeFailure) !== JSON.stringify(afterFailure)) {
      throw new Error(
        `correctSubmission mid-batch failure changed restored state: before=${JSON.stringify(beforeFailure)} after=${JSON.stringify(afterFailure)}`,
      );
    }
    const afterFailureRoundRows = afterFailureRounds.map(roundResultSnapshot);
    assertEqualJson(
      beforeFailureRoundRows,
      afterFailureRoundRows,
      "correctSubmission mid-batch failure round contents",
    );

    let corrected;
    try {
      corrected = await correctSubmission(
        { DB: db },
        "recovery-submission",
        correctionInput,
        "phase9-rehearsal@example.test",
      );
    } catch (error) {
      const diagnostics = await appRows(
        "SELECT key, round_count, config_json FROM games WHERE key = 'krillion'",
        "diagnose restored Krillion configuration",
      );
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}; restored configuration=${JSON.stringify(diagnostics)}`,
      );
    }
    const beforeIds = storedBeforeRounds.map((round) => round.id);
    const afterRounds = await appRows(
      "SELECT id, round_number, raw_score FROM round_results WHERE submission_id = 'recovery-submission' ORDER BY round_number",
      "verify application round replacement",
    );
    const submission = await appRows(
      "SELECT s.id, g.key AS game_key, s.final_score, s.source_kind FROM submissions s JOIN games g ON g.id = s.game_id WHERE s.id = 'recovery-submission'",
      "verify restored submission correctness",
    );
    const audits = await appRows(
      "SELECT action, before_json, after_json, reason FROM admin_audit_log WHERE entity_id = 'recovery-submission' ORDER BY created_at, id",
      "verify generated redacted administrator audit",
    );
    const audit = audits.at(-1);
    if (
      afterRounds.length !== RECOVERY_INITIAL_SCORES.length ||
      afterRounds.some((round) => beforeIds.includes(round.id))
    ) {
      throw new Error(
        `administrator recovery did not atomically replace all rounds: before=${JSON.stringify(beforeIds)} after=${JSON.stringify(afterRounds)}`,
      );
    }
    if (
      submission.length !== 1 ||
      submission[0].final_score !== 310 ||
      corrected.final_score !== 310
    ) {
      throw new Error("administrator correction did not restore the expected submission");
    }
    if (!audit || audit.action !== "submission.correct") {
      throw new Error("administrator correction audit was not generated");
    }
    const before = JSON.parse(audit.before_json);
    const after = JSON.parse(audit.after_json);
    const redacted = [audit.before_json, audit.after_json].every(
      (value) => !protectedValues.some((sentinel) => value.includes(sentinel)),
    );
    if (
      !redacted ||
      before.submission.final_score !== 300 ||
      after.submission.final_score !== 310
    ) {
      throw new Error("administrator recovery audit was not redacted correctly");
    }
    return {
      path: "correctSubmission",
      fixture: {
        game_key: submission[0].game_key,
        protected_values_present: protectedValuesPresent,
      },
      atomic_failure_rollback: {
        verified: true,
        before: beforeFailure,
        after: afterFailure,
      },
      atomic_round_replacement: true,
      submission: {
        id: submission[0].id,
        game_key: submission[0].game_key,
        final_score: submission[0].final_score,
        source_kind: submission[0].source_kind,
      },
      rounds: {
        before_ids: beforeIds,
        after_ids: afterRounds.map((round) => round.id),
        after_scores: afterRounds.map((round) => round.raw_score),
      },
      audit: {
        action: audit.action,
        reason: audit.reason,
        before,
        after,
        redacted,
      },
    };
  } finally {
    await vite.close();
    await runtime.dispose();
  }
}

export async function runRecoveryRehearsal() {
  let temporaryRoot;
  let cleanedUp = false;
  const steps = [];
  try {
    temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "wht-phase9-recovery-"));
    const source = await createDatabaseWorkspace(temporaryRoot, "source");
    const restore = await createDatabaseWorkspace(temporaryRoot, "restore");
    const forward = await createDatabaseWorkspace(temporaryRoot, "forward");
    const exportPath = path.join(temporaryRoot, "phase9-recovery-export.sql");

    applyMigrations(source);
    steps.push({
      id: "migrate-source",
      status: "pass",
      detail: "Applied all local D1 migrations.",
    });
    seedSource(source);
    steps.push({
      id: "seed-source",
      status: "pass",
      detail: "Seeded representative player, game day, submission, and round rows.",
    });

    await exportSource(source, exportPath);
    steps.push({
      id: "export-sql",
      status: "pass",
      detail: "Exported local D1 schema and data to SQL.",
    });
    await restoreExport(restore, exportPath);
    steps.push({
      id: "restore-sql",
      status: "pass",
      detail: "Restored the SQL export into a separate disposable local D1 state.",
    });

    assertEqualJson(readKeyRows(source), readKeyRows(restore), "key rows");
    steps.push({
      id: "compare-key-rows",
      status: "pass",
      detail: "Key game, player, submission, and round rows matched after restore.",
    });
    const sourceConstraints = readConstraints(source);
    const restoredConstraints = readConstraints(restore);
    assertEqualJson(sourceConstraints.schema, restoredConstraints.schema, "schema constraints");
    assertEqualJson(
      sourceConstraints.submissionsForeignKeys,
      restoredConstraints.submissionsForeignKeys,
      "foreign-key constraints",
    );
    if (
      sourceConstraints.foreignKeyCheck.length !== 0 ||
      restoredConstraints.foreignKeyCheck.length !== 0
    ) {
      throw new Error("foreign-key check returned violations");
    }
    verifyConstraintFailures(restore);
    steps.push({
      id: "compare-constraints",
      status: "pass",
      detail:
        "Schema, foreign keys, foreign-key checks, and duplicate/orphan constraint probes matched.",
    });

    verifyForwardMigration(forward);
    steps.push({
      id: "forward-migration",
      status: "pass",
      detail:
        "Applied the v2 forward migration and preserved the populated submission while dropping result_hash.",
    });
    const recovery = await verifyAdminRecovery(restore, exportPath);
    steps.push({
      id: "admin-recovery-mid-batch-rollback",
      status: "pass",
      detail:
        "Forced a mid-batch failure through correctSubmission on the restored D1 binding and verified rounds, submission score, and audit count were unchanged.",
    });
    steps.push({
      id: "admin-recovery",
      status: "pass",
      detail:
        "Ran correctSubmission against the restored D1 binding for a Krillion submission, replaced all rounds, and persisted a redacted administrator audit row.",
    });

    return {
      status: "pass",
      contract: RECOVERY_CONTRACT,
      steps,
      recovery,
      external_restore: { status: "pending", note: EXTERNAL_RESTORE_NOTE },
      cleaned_up: true,
    };
  } catch (error) {
    return {
      status: "fail",
      contract: RECOVERY_CONTRACT,
      steps,
      external_restore: { status: "pending", note: EXTERNAL_RESTORE_NOTE },
      cleaned_up: cleanedUp,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (temporaryRoot) {
      await rm(temporaryRoot, { recursive: true, force: true });
      cleanedUp = true;
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await runRecoveryRehearsal();
  if (report.status !== "pass") process.exitCode = 1;
  console.log(JSON.stringify({ ...report, cleaned_up: true }, null, 2));
}
