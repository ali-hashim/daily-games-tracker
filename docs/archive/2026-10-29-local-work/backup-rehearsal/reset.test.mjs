import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
const reset = path.join(root, "backup-rehearsal/reset-schema3-synthetic.sql");

test("schema 3 reset replaces a populated local D1 and preserves exported migration ledger", async () => {
  const parent = await mkdtemp(path.join(tmpdir(), "wht-backup-rehearsal-"));
  const source = path.join(parent, "source");
  const target = path.join(parent, "target");
  const dump = path.join(parent, "source.sql");
  function run(state, args, fail = false) {
    const result = spawnSync(
      process.execPath,
      [wrangler, ...args, "--local", "--config", path.join(state, "wrangler.jsonc")],
      {
        cwd: state,
        encoding: "utf8",
        env: {
          ...process.env,
          NO_COLOR: "1",
          WRANGLER_SEND_METRICS: "false",
          WRANGLER_WRITE_LOGS: "false",
        },
      },
    );
    assert.equal(
      result.status === 0,
      !fail,
      `Wrangler: ${args.join(" ")}\n${result.stdout}\n${result.stderr}`,
    );
    return result.stdout;
  }
  function command(state, sql, fail = false) {
    return run(state, ["d1", "execute", "DB", "--command", sql, "--json"], fail);
  }
  try {
    await readFile(reset, "utf8");
    for (const state of [source, target]) {
      await mkdir(state);
      await cp(path.join(root, "wrangler.jsonc"), path.join(state, "wrangler.jsonc"));
      await cp(path.join(root, "migrations"), path.join(state, "migrations"), { recursive: true });
      run(state, ["d1", "migrations", "apply", "DB"]);
    }
    command(
      source,
      "INSERT INTO players(id,display_name) VALUES ('synthetic-new','New Player'); INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES ('synthetic-day','krillion','2026-10-26','123');",
    );
    command(target, "INSERT INTO players(id,display_name) VALUES ('synthetic-old','Old Player');");
    assert.match(
      command(target, "SELECT name FROM d1_migrations ORDER BY id;"),
      /0003_login_return_url.sql/,
    );
    run(source, ["d1", "export", "DB", "--output", dump]);
    const sql = await readFile(dump, "utf8");
    assert.match(sql, /d1_migrations/);
    run(target, ["d1", "execute", "DB", "--file", reset]);
    run(target, ["d1", "execute", "DB", "--file", dump]);
    const query =
      "SELECT (SELECT group_concat(name, '|') FROM (SELECT name FROM d1_migrations ORDER BY id)) AS ledger, (SELECT group_concat(id || ':' || display_name, '|') FROM (SELECT id, display_name FROM players ORDER BY id)) AS players, (SELECT group_concat(id || ':' || game_date || ':' || external_puzzle_key, '|') FROM (SELECT id,game_date,external_puzzle_key FROM game_days ORDER BY id)) AS days;";
    const rows = (state) => JSON.parse(command(state, query))[0].results;
    assert.deepEqual(rows(target), rows(source));
    assert.match(JSON.stringify(rows(target)), /synthetic-new/);
    assert.doesNotMatch(JSON.stringify(rows(target)), /synthetic-old/);
    assert.deepEqual(JSON.parse(command(target, "PRAGMA foreign_key_check;"))[0].results, []);
    command(
      target,
      "INSERT INTO players(id,display_name) VALUES ('duplicate','new player');",
      true,
    );
    const schema = (state) =>
      JSON.parse(
        command(
          state,
          "SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name;",
        ),
      )[0].results;
    assert.deepEqual(schema(target), schema(source));
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
});
