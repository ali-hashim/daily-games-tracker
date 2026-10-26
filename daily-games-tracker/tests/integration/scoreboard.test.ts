import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { submissionScoreboard } from "../../functions/_lib/scoreboard";
import type { AppEnv } from "../../functions/_lib/runtime";
import type { GameKey } from "../../shared/types";
let runtime: Miniflare;
let env: AppEnv;
const date = "2026-10-21";
beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default{fetch(){return new Response('test')}}",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = { DB: (await runtime.getD1Database("DB")) as unknown as D1Database };
  for (const name of readdirSync("migrations")
    .filter((n) => n.endsWith(".sql"))
    .sort())
    for (const sql of readFileSync(`migrations/${name}`, "utf8")
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await env.DB.prepare(sql).run();
}, 30_000);
afterAll(async () => {
  await runtime.dispose();
});
beforeEach(async () => {
  for (const table of ["round_results", "submissions", "game_days", "players"])
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  for (const [id, name, active] of [
    ["alex", "Alex", 1],
    ["sam", "Sam", 1],
    ["zoe", "Zoe", 1],
    ["new", "New", 1],
    ["inactive", "Hidden player", 0],
  ] as const)
    await env.DB.prepare("INSERT INTO players(id,display_name,active) VALUES (?,?,?)")
      .bind(id, name, active)
      .run();
});
async function save(player: string, game: GameKey, day: string, total: number, scores: number[]) {
  const id = `${player}-${game}-${day}`;
  await env.DB.prepare(
    "INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES (?,?,?,?) ON CONFLICT(game_id,game_date) DO NOTHING",
  )
    .bind(
      `${game}-${day}`,
      game,
      day,
      game === "krillion"
        ? String(98 + Math.round((Date.parse(day) - Date.parse("2026-10-21")) / 86400000))
        : day,
    )
    .run();
  await env.DB.prepare(
    "INSERT INTO submissions(id,player_id,game_id,game_day_id,final_score,parser_version,source_kind) VALUES (?,?,?,?,?,'test','admin')",
  )
    .bind(id, player, game, `${game}-${day}`, total)
    .run();
  await env.DB.batch(
    scores.map((score, i) =>
      env.DB.prepare(
        "INSERT INTO round_results(id,submission_id,round_number,prompt,answer,raw_score,original_emoji) VALUES (?,?,?,?,?,?,?)",
      ).bind(`${id}-${i}`, id, i + 1, "SECRET_PROMPT", "SECRET_ANSWER", score, "🎓"),
    ),
  );
}
it("renders the canonical score-only combined board from one consistent read, with prior-day movement", async () => {
  await save("alex", "krillion", "2026-10-20", 100, [100, 0, 0, 0, 0, 0, 0]);
  await save("sam", "krillion", "2026-10-20", 200, [100, 100, 0, 0, 0, 0, 0]);
  await save("zoe", "krillion", "2026-10-20", 100, [100, 0, 0, 0, 0, 0, 0]);
  await save("alex", "krillion", date, 200, [100, 100, 0, 0, 0, 0, 0]);
  await save("sam", "krillion", date, 60, [60, 0, 0, 0, 0, 0, 0]);
  await save("alex", "maptap", "2026-10-20", 1000, [100, 100, 100, 100, 100]);
  await save("sam", "maptap", "2026-10-20", 500, [50, 50, 50, 50, 50]);
  await save("zoe", "maptap", "2026-10-20", 500, [50, 50, 50, 50, 50]);
  await save("alex", "maptap", date, 0, [0, 0, 0, 0, 0]);
  await save("zoe", "maptap", date, 500, [50, 50, 50, 50, 50]);
  await save("sam", "maptap", "2026-10-22", 1000, [100, 100, 100, 100, 100]);
  await save("inactive", "maptap", date, 1000, [100, 100, 100, 100, 100]);
  const statements: string[] = [];
  const original = env.DB;
  const db = new Proxy(original, {
    get(target, key) {
      if (key === "prepare")
        return (sql: string) => {
          statements.push(sql);
          return target.prepare(sql);
        };
      const value = Reflect.get(target, key);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  const result = await submissionScoreboard({ ...env, DB: db }, date, "alex", "krillion");
  expect(statements).toHaveLength(1);
  expect(statements[0]).not.toMatch(/\b(prompt|answer|original_emoji|credential_hash)\b/);
  expect(result.daily_rank).toBe(1);
  expect(result.scoreboard_text).toBe(`📊 WHT Leaderboard — OCT 21, 2026

🦐 KRILLION — #98

#1 · 200 — Alex [#1 · 300 📈]
🌟 🌟 ⬛ ⬛ ⬛ ⬛ ⬛

#2 · 60 — Sam [#2 · 260 📉]
🦑 ⬛ ⬛ ⬛ ⬛ ⬛ ⬛

━━━━━━━━━━━━━━━━━━━━

🌎 MAPTAP — OCT 21

#1 · 500 — Zoe [#1 · 1,000 📈]
50 · 50 · 50 · 50 · 50

#2 · 0 — Alex [#1 · 1,000 ➖]
0 · 0 · 0 · 0 · 0`);
  expect(result.scoreboard_text).not.toMatch(/SECRET_|🎓|Hidden player/);
  expect(result.scoreboard_text).not.toContain("🔗 FULL DAILY LEADERBOARDS");
  expect(result.scoreboard_text).not.toContain("https://wht.test/daily/2026-10-21");
  await env.DB.prepare(
    "UPDATE submissions SET final_score=0 WHERE id='sam-krillion-2026-10-20'",
  ).run();
  const corrected = await submissionScoreboard(env, date, "sam", "krillion");
  expect(corrected.scoreboard_text).toContain("#2 · 60 — Sam [#3 · 60 ➖]");
});
it("keeps zero-score ties played, alphabetical, and ranked ahead of never-played users", async () => {
  await save("sam", "maptap", date, 0, [0, 0, 0, 0, 0]);
  await save("alex", "maptap", date, 0, [0, 0, 0, 0, 0]);
  const board = await submissionScoreboard(env, date, "alex", "maptap");
  expect(board.daily_rank).toBe(1);
  expect(board.scoreboard_text).toContain("#1 · 0 — Alex [#1 · 0 NEW]");
  expect(board.scoreboard_text).toContain("#1 · 0 — Sam [#1 · 0 NEW]");
  expect(board.scoreboard_text.indexOf("#1 · 0 — Alex")).toBeLessThan(
    board.scoreboard_text.indexOf("#1 · 0 — Sam"),
  );
});
it("includes only submitted players and omits games with no submissions", async () => {
  await save("alex", "maptap", date, 0, [0, 0, 0, 0, 0]);

  const board = await submissionScoreboard(env, date, "alex", "maptap");

  expect(board.scoreboard_text).toBe(`📊 WHT Leaderboard — OCT 21, 2026

🌎 MAPTAP — OCT 21

#1 · 0 — Alex [#1 · 0 NEW]
0 · 0 · 0 · 0 · 0`);
  expect(board.scoreboard_text).not.toContain("KRILLION");
  expect(board.scoreboard_text).not.toContain("Not played");
  expect(board.scoreboard_text).not.toContain("━━━━━━━━━━━━━━━━━━━━");
});
it("does not label an incomplete round set as a ready-to-copy scoreboard", async () => {
  await save("alex", "krillion", date, 60, [60]);
  await expect(submissionScoreboard(env, date, "alex", "krillion")).rejects.toThrow(
    "Scoreboard round set incomplete",
  );
});
