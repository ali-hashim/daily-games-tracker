import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { onRequest as statsApi } from "../../functions/api/leaderboards/stats";
import { readStatsBoard } from "../../functions/_lib/leaderboards";
import { onRequest as dailyPage } from "../../functions/daily";
import type { AppEnv } from "../../functions/_lib/runtime";
import { latestWorldwideDay } from "../../shared/day";

let runtime: Miniflare;
let env: AppEnv;

const fixedNow = new Date("2026-10-23T20:00:00.000Z");

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch() { return new Response('test') }}",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = { DB: (await runtime.getD1Database("DB")) as unknown as D1Database };
  const sql = readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(`migrations/${name}`, "utf8"))
    .join("\n")
    .replace(/^--.*$/gm, "");
  for (const statement of sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean))
    await env.DB.prepare(statement).run();
}, 30_000);

afterAll(async () => {
  await runtime.dispose();
});

beforeEach(async () => {
  for (const table of [
    "round_results",
    "submissions",
    "game_days",
    "web_sessions",
    "login_challenges",
    "registration_invites",
    "device_credentials",
    "players",
  ])
    await env.DB.prepare(`DELETE FROM ${table}`).run();
});

async function addPlayer(id: string, displayName: string, active = true): Promise<void> {
  await env.DB.prepare("INSERT INTO players(id, display_name, active) VALUES (?, ?, ?)")
    .bind(id, displayName, active ? 1 : 0)
    .run();
}

async function save(
  playerId: string,
  game: "krillion" | "maptap",
  date: string,
  finalScore: number,
  roundScores: number[],
  externalPuzzleKey = game === "krillion" ? `puzzle-${date}` : date,
): Promise<void> {
  const gameDayId = `${game}-${date}`;
  const submissionId = `${playerId}-${game}-${date}`;
  await env.DB.prepare(
    `INSERT INTO game_days(id, game_id, game_date, external_puzzle_key)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, game_date) DO NOTHING`,
  )
    .bind(gameDayId, game, date, externalPuzzleKey)
    .run();
  await env.DB.prepare(
    `INSERT INTO submissions(
       id, player_id, game_id, game_day_id, final_score, parser_version, source_kind
     ) VALUES (?, ?, ?, ?, ?, ?, 'admin')`,
  )
    .bind(submissionId, playerId, game, gameDayId, finalScore, `${game}.v1`)
    .run();
  await env.DB.batch(
    roundScores.map((score, index) =>
      env.DB.prepare(
        `INSERT INTO round_results(
           id, submission_id, round_number, prompt, answer, raw_score, original_emoji
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        `${submissionId}-${index + 1}`,
        submissionId,
        index + 1,
        game === "krillion" ? `SECRET_PROMPT_${index + 1}` : null,
        game === "krillion" ? `SECRET_ANSWER_${index + 1}` : null,
        score,
        game === "maptap" ? `EMOJI_${index + 1}` : null,
      ),
    ),
  );
}

function context(request: Request) {
  return {
    request,
    env,
    data: { requestId: "req_stats" },
    next: async () => new Response("shell"),
  } as never;
}

describe("stats board", () => {
  it("combines active games per player without penalising pre-first-submission days", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await addPlayer("idle", "Idle");
    await addPlayer("gone", "Gone", false);
    await save("alex", "krillion", "2026-10-21", 100, [100, 0, 0, 0, 0, 0, 0], "97");
    await save("alex", "maptap", "2026-10-21", 500, [100, 100, 100, 100, 100]);
    await save("alex", "maptap", "2026-10-23", 300, [60, 60, 60, 60, 60]);
    await save("sam", "maptap", "2026-10-23", 900, [100, 100, 100, 100, 100]);
    await save("gone", "maptap", "2026-10-23", 999, [100, 100, 100, 100, 100]);
    await save("alex", "maptap", "2026-10-24", 777, [100, 100, 100, 100, 100]);

    const board = await readStatsBoard(env, "2026-10-23");
    expect(board.as_of_date).toBe("2026-10-23");
    expect(board.players.map((p) => [p.display_name, p.rank, p.total_points])).toEqual([
      ["Alex", 1, 900],
      ["Sam", 1, 900],
      ["Idle", null, 0],
    ]);
    const alex = board.players.find((p) => p.id === "alex")!;
    expect(alex).toMatchObject({
      days_played: 2,
      games_played: 3,
      average_per_day: 300,
      average_per_game: 300,
      current_streak: 1,
      longest_streak: 1,
      best_day: { date: "2026-10-21", points: 600 },
    });
    const sam = board.players.find((p) => p.id === "sam")!;
    expect(sam).toMatchObject({ average_per_day: 900, current_streak: 1 });
    expect(JSON.stringify(board)).not.toMatch(/SECRET_|prompt|answer|gone/i);
  });

  it("defaults to the latest worldwide day", async () => {
    await addPlayer("alex", "Alex");
    await save("alex", "maptap", "2026-10-24", 5, [1, 1, 1, 1, 1]);
    const board = await readStatsBoard(env, undefined, fixedNow);
    expect(board.as_of_date).toBe(latestWorldwideDay(fixedNow));
    expect(board.players[0].total_points).toBe(5);
  });

  it("serves a public no-store stats endpoint and rejects other methods", async () => {
    await addPlayer("alex", "Alex");
    const ok = await statsApi(context(new Request("https://wht.test/api/leaderboards/stats")));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ status: "ok", as_of_date: latestWorldwideDay() });
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    await expect(
      statsApi(context(new Request("https://wht.test/api/leaderboards/stats", { method: "POST" }))),
    ).rejects.toMatchObject({ statusCode: 405 });
  });
});

describe("multi-day browser route", () => {
  it("redirects legacy /daily?view=multi to /daily/multi, which Pages serves as the SPA shell", async () => {
    // Falling through to the static /daily rewrite makes Pages 308 to "/", losing the route.
    const response = await dailyPage({
      request: new Request("https://wht.test/daily?view=multi"),
      next: async () => new Response("shell"),
      env,
      data: {},
    } as never);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/daily/multi");
  });

  it("still redirects plain /daily to a dated page", async () => {
    const response = await dailyPage({
      request: new Request("https://wht.test/daily"),
      next: async () => new Response("shell"),
      env,
      data: {},
    } as never);
    expect(response.status).toBe(308);
  });
});
