import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";

it("drops only the obsolete result hash while preserving populated scores, rounds and constraints", async () => {
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('test')}}",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = await runtime.getD1Database("DB");
    const run = async (file: string) => {
      const statements = readFileSync(`migrations/${file}`, "utf8")
        .replace(/^--.*$/gm, "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);
      await db.batch(statements.map((s) => db.prepare(s)));
    };
    await run("0001_initial.sql");
    await db.prepare("INSERT INTO players(id,display_name) VALUES ('p','Migration test')").run();
    await db
      .prepare(
        "INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES ('day','maptap','2026-10-21','2026-10-21')",
      )
      .run();
    await db
      .prepare(
        "INSERT INTO submissions(id,player_id,game_id,game_day_id,final_score,result_hash,parser_version,source_kind) VALUES ('s','p','maptap','day',810,'obsolete-hash','maptap.v1','shared_text')",
      )
      .run();
    await db.batch(
      [73, 99, 87, 78, 80].map((score, index) =>
        db
          .prepare(
            "INSERT INTO round_results(id,submission_id,round_number,raw_score,original_emoji) VALUES (?,'s',?,?,?)",
          )
          .bind(`r${index}`, index + 1, score, ["🫢", "🔥", "🎓", "😁", "👏"][index]),
      ),
    );
    const before = await db.prepare("SELECT * FROM submissions").first<Record<string, unknown>>();
    const rounds = (await db.prepare("SELECT * FROM round_results ORDER BY round_number").all())
      .results;
    const indexes = (
      await db
        .prepare(
          "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('submissions','round_results') ORDER BY name",
        )
        .all()
    ).results;
    const foreignKeys = (await db.prepare("PRAGMA foreign_key_list(submissions)").all()).results;
    await run("0002_remove_result_hash.sql");
    const after = await db.prepare("SELECT * FROM submissions").first();
    const expected = { ...before };
    delete expected.result_hash;
    expect(after).toEqual(expected);
    expect(
      (await db.prepare("SELECT * FROM round_results ORDER BY round_number").all()).results,
    ).toEqual(rounds);
    expect(
      (
        await db
          .prepare(
            "SELECT name,sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('submissions','round_results') ORDER BY name",
          )
          .all()
      ).results,
    ).toEqual(indexes);
    expect((await db.prepare("PRAGMA foreign_key_list(submissions)").all()).results).toEqual(
      foreignKeys,
    );
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
    expect(
      await db.prepare("SELECT value FROM app_meta WHERE key='schema_version'").first("value"),
    ).toBe("2");
    await expect(
      db
        .prepare(
          "INSERT INTO submissions(id,player_id,game_id,game_day_id,final_score,parser_version,source_kind) VALUES ('duplicate','p','maptap','day',811,'maptap.v1','shared_text')",
        )
        .run(),
    ).rejects.toThrow();
    await expect(
      db
        .prepare(
          "INSERT INTO round_results(id,submission_id,round_number,raw_score) VALUES ('orphan','missing',1,10)",
        )
        .run(),
    ).rejects.toThrow();
  } finally {
    await runtime.dispose();
  }
}, 30_000);
