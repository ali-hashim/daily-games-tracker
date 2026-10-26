import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const state = await mkdtemp(path.join(os.tmpdir(), "daily-games-schema-"));

function runWrangler(args, { expectFailure = false } = {}) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });

  if (expectFailure) {
    assert.notEqual(result.status, 0, `Expected command to fail: ${args.join(" ")}`);
  } else {
    assert.equal(
      result.status,
      0,
      `Wrangler failed (${args.join(" ")}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

const localArgs = ["--local", "--persist-to", state, "--config", "wrangler.jsonc"];

try {
  runWrangler(["d1", "migrations", "apply", "DB", ...localArgs]);

  const tableCheck = runWrangler([
    "d1",
    "execute",
    "DB",
    ...localArgs,
    "--command",
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;",
    "--json",
  ]);
  for (const table of [
    "players",
    "device_credentials",
    "registration_invites",
    "web_sessions",
    "login_challenges",
    "games",
    "game_days",
    "submissions",
    "round_results",
    "admin_audit_log",
  ]) {
    assert.match(tableCheck.stdout, new RegExp(`\\b${table}\\b`));
  }

  const schemaColumns = runWrangler([
    "d1",
    "execute",
    "DB",
    ...localArgs,
    "--command",
    "PRAGMA table_info(submissions);",
    "--json",
  ]);
  assert.doesNotMatch(schemaColumns.stdout, /result_hash/);
  const seedCheck = runWrangler([
    "d1",
    "execute",
    "DB",
    ...localArgs,
    "--command",
    "SELECT key, round_count FROM games ORDER BY key;",
    "--json",
  ]);
  assert.match(seedCheck.stdout, /krillion/);
  assert.match(seedCheck.stdout, /maptap/);

  runWrangler([
    "d1",
    "execute",
    "DB",
    ...localArgs,
    "--command",
    "INSERT INTO players(id, display_name) VALUES('p1', 'Alex');",
  ]);
  runWrangler(
    [
      "d1",
      "execute",
      "DB",
      ...localArgs,
      "--command",
      "INSERT INTO players(id, display_name) VALUES('p2', 'alex');",
    ],
    { expectFailure: true },
  );

  runWrangler([
    "d1",
    "execute",
    "DB",
    ...localArgs,
    "--command",
    "INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES('krillion:2026-10-20', 'krillion', '2026-10-20', '97'); INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, parser_version, source_kind) VALUES('s1', 'p1', 'krillion', 'krillion:2026-10-20', 310, 'krillion.v1', 'admin'); INSERT INTO round_results(id, submission_id, round_number, prompt, answer, raw_score) VALUES('r1', 's1', 1, 'Prompt', 'Answer', 60);",
  ]);

  runWrangler(
    [
      "d1",
      "execute",
      "DB",
      ...localArgs,
      "--command",
      "INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, parser_version, source_kind) VALUES('s2', 'p1', 'krillion', 'krillion:2026-10-20', 0, 'krillion.v1', 'admin');",
    ],
    { expectFailure: true },
  );

console.log("PASS: current D1 schema (v3), seeds, foreign keys, and uniqueness constraints");
} finally {
  await rm(state, { recursive: true, force: true });
}
