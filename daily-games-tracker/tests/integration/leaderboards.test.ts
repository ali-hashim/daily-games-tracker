import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { onRequest as allTimeApi } from "../../functions/api/leaderboards/all-time";
import { onRequest as copyApi } from "../../functions/api/leaderboards/copy";
import { onRequest as dailyApi } from "../../functions/api/leaderboards/daily";
import { readAllTimeLeaderboard, readDailyLeaderboard } from "../../functions/_lib/leaderboards";
import { onRequest as dailyPage } from "../../functions/daily";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppData, AppEnv } from "../../functions/_lib/runtime";
import { latestWorldwideDay, pacificDay } from "../../shared/day";

let runtime: Miniflare;
let env: AppEnv;

const today = "2026-10-23";
const yesterday = "2026-10-22";
const tomorrow = "2026-10-24";
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

async function createSession(playerId: string): Promise<string> {
  const token = randomToken();
  const now = new Date();
  await env.DB.prepare(
    `INSERT INTO web_sessions(
       id, player_id, session_hash, idle_expires_at, absolute_expires_at, last_activity_at
     ) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      `session-${playerId}`,
      playerId,
      await hashToken(token),
      new Date(now.getTime() + 86_400_000).toISOString(),
      new Date(now.getTime() + 86_400_000 * 30).toISOString(),
      now.toISOString(),
    )
    .run();
  return token;
}

function context(request: Request): Parameters<typeof dailyApi>[0] {
  return { request, env, data: { requestId: "req_leaderboard_test" } } as Parameters<
    typeof dailyApi
  >[0];
}

describe("Phase 6 leaderboard read models", () => {
  it("returns unlocked daily details with competition ranks, badges, and zero/null separation", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await addPlayer("zoe", "Zoe");
    await addPlayer("inactive", "Hidden", false);
    await save("alex", "krillion", today, 0, [0, 0, 0, 0, 0, 0, 0], "98");
    await save("sam", "krillion", today, 100, [100, 0, 0, 0, 0, 0, 0], "98");

    const result = await readDailyLeaderboard(
      env,
      { id: "alex", display_name: "Alex" },
      today,
      fixedNow,
    );
    const krillion = result.games.find((game) => game.key === "krillion");
    const maptap = result.games.find((game) => game.key === "maptap");

    expect(result).toMatchObject({
      status: "ok",
      date: today,
      current_day: today,
      player: { id: "alex", display_name: "Alex" },
    });
    expect(krillion).toMatchObject({
      key: "krillion",
      external_puzzle_key: "98",
      locked: false,
    });
    expect(
      krillion?.players?.map(({ display_name, daily_score, rank, badge }) => ({
        display_name,
        daily_score,
        rank,
        badge,
      })),
    ).toEqual([
      { display_name: "Sam", daily_score: 100, rank: 1, badge: "🌟" },
      { display_name: "Alex", daily_score: 0, rank: 2, badge: "⬛" },
      { display_name: "Zoe", daily_score: null, rank: null, badge: "⬛" },
    ]);
    expect(krillion?.players?.[1].rounds[0]).toEqual({
      round_number: 1,
      prompt: "SECRET_PROMPT_1",
      answer: "SECRET_ANSWER_1",
      raw_score: 0,
      original_emoji: null,
    });
    expect(maptap).toMatchObject({
      key: "maptap",
      external_puzzle_key: null,
      locked: true,
      lock_reason: "Play and submit the 2026-10-23 MapTap result to unlock this table.",
    });
    expect(maptap && "players" in maptap).toBe(false);
    expect(JSON.stringify(maptap)).not.toMatch(/SECRET_|prompt|answer/i);
  });

  it("does not select protected detail columns while both current-day games are locked", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
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

    const result = await readDailyLeaderboard(
      { ...env, DB: db },
      { id: "alex", display_name: "Alex" },
      today,
      fixedNow,
    );
    expect(result.games.every((game) => game.locked && !("players" in game))).toBe(true);
    expect(statements.join("\n")).not.toMatch(/\b(prompt|answer|original_emoji|round_results)\b/i);
  });

  it("opens both games for historical dates without requiring the requesting player to have played", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await save("sam", "krillion", yesterday, 60, [60, 0, 0, 0, 0, 0, 0], "97");
    await save("sam", "maptap", yesterday, 820, [73, 99, 87, 78, 80]);

    const result = await readDailyLeaderboard(
      env,
      { id: "alex", display_name: "Alex" },
      yesterday,
      fixedNow,
    );
    expect(result.games.every((game) => !game.locked && "players" in game)).toBe(true);
    const krillion = result.games.find((game) => game.key === "krillion");
    expect(krillion?.players?.map((player) => [player.display_name, player.daily_score])).toEqual([
      ["Sam", 60],
      ["Alex", null],
    ]);
    expect(krillion?.players?.[1].rounds).toEqual([]);
  });

  it("allows the latest worldwide date ahead of Pacific while protecting open details", async () => {
    await addPlayer("alex", "Alex");
    const result = await readDailyLeaderboard(
      env,
      { id: "alex", display_name: "Alex" },
      tomorrow,
      fixedNow,
    );
    expect(result).toMatchObject({
      date: tomorrow,
      current_day: today,
      latest_available_day: tomorrow,
    });
    expect(result.games.every((game) => game.locked && !("players" in game))).toBe(true);
    await expect(
      readDailyLeaderboard(env, { id: "alex", display_name: "Alex" }, "2026-10-25", fixedNow),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "DATE_IN_FUTURE" });
  });

  it("includes the latest worldwide date in public all-time totals", async () => {
    await addPlayer("alex", "Alex");
    await save("alex", "maptap", tomorrow, 999, [100, 100, 100, 100, 100]);

    const result = await readAllTimeLeaderboard(env, undefined, fixedNow);
    const maptap = result.games.find((game) => game.key === "maptap")!;
    expect(result.as_of_date).toBe(tomorrow);
    expect(maptap.players[0]).toMatchObject({
      id: "alex",
      total: 999,
      games_played: 1,
    });
    expect(maptap.days.map((day) => day.date)).toEqual([tomorrow]);
  });

  it("computes public all-time totals, averages, movement, active filtering, and score-only days", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await addPlayer("zoe", "Zoe");
    await addPlayer("new", "New player");
    await addPlayer("inactive", "Hidden", false);
    await save("alex", "krillion", yesterday, 100, [100, 0, 0, 0, 0, 0, 0], "97");
    await save("sam", "krillion", yesterday, 100, [100, 0, 0, 0, 0, 0, 0], "97");
    await save("alex", "krillion", today, 0, [0, 0, 0, 0, 0, 0, 0], "98");
    await save("sam", "krillion", today, 200, [100, 100, 0, 0, 0, 0, 0], "98");
    await save("zoe", "krillion", today, 300, [100, 100, 100, 0, 0, 0, 0], "98");
    await save("alex", "maptap", yesterday, 1000, [100, 100, 100, 100, 100]);
    await save("sam", "maptap", today, 0, [0, 0, 0, 0, 0]);
    await save("alex", "maptap", tomorrow, 999, [100, 100, 100, 100, 100]);

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
    const result = await readAllTimeLeaderboard({ ...env, DB: db }, today);
    expect(statements.join("\n")).not.toMatch(/\b(prompt|answer|original_emoji|round_results)\b/i);
    expect(JSON.stringify(result)).not.toMatch(/SECRET_|EMOJI_/);

    const krillion = result.games.find((game) => game.key === "krillion")!;
    expect(krillion.players).toEqual([
      {
        id: "sam",
        display_name: "Sam",
        total: 300,
        games_played: 2,
        average: 150,
        rank: 1,
        badge: "🌟",
        movement: "➖",
      },
      {
        id: "zoe",
        display_name: "Zoe",
        total: 300,
        games_played: 1,
        average: 300,
        rank: 1,
        badge: "🌟",
        movement: "NEW",
      },
      {
        id: "alex",
        display_name: "Alex",
        total: 100,
        games_played: 2,
        average: 50,
        rank: 3,
        badge: "🦑",
        movement: "📉",
      },
      {
        id: "new",
        display_name: "New player",
        total: 0,
        games_played: 0,
        average: null,
        rank: null,
        badge: "⬛",
        movement: "NEW",
      },
    ]);
    expect(krillion.days.map((day) => day.date)).toEqual([today, yesterday]);
    expect(krillion.days[0].scores).toEqual({ alex: 0, sam: 200, zoe: 300, new: null });

    const maptap = result.games.find((game) => game.key === "maptap")!;
    expect(maptap.players[1]).toMatchObject({
      id: "sam",
      total: 0,
      games_played: 1,
      average: 0,
      rank: 2,
      movement: "NEW",
    });
    expect(maptap.days[0].scores).toEqual({ alex: null, sam: 0, zoe: null, new: null });
    expect(result.games.every((game) => !("rounds" in game) && !("answer" in game))).toBe(true);
  });

  it("serves the daily API only with a session and keeps the all-time API public", async () => {
    const currentDay = pacificDay();
    await addPlayer("alex", "Alex");
    await save("alex", "krillion", currentDay, 60, [60, 0, 0, 0, 0, 0, 0], "98");
    const token = await createSession("alex");

    await expect(
      dailyApi(context(new Request(`https://wht.test/api/leaderboards/daily?date=${currentDay}`))),
    ).rejects.toMatchObject({ statusCode: 401 });

    const daily = await dailyApi(
      context(
        new Request(`https://wht.test/api/leaderboards/daily?date=${currentDay}`, {
          headers: { Cookie: `dgt_session=${token}` },
        }),
      ),
    );
    const dailyBody = (await daily.json()) as Record<string, unknown>;
    expect(daily.status).toBe(200);
    expect(dailyBody).toMatchObject({ status: "ok", date: currentDay, current_day: currentDay });
    expect(daily.headers.get("Cache-Control")).toBe("no-store");
    expect(daily.headers.get("Set-Cookie")).toContain("dgt_session=");

    const allTime = await allTimeApi(
      context(new Request("https://wht.test/api/leaderboards/all-time")),
    );
    const allTimeBody = (await allTime.json()) as Record<string, unknown>;
    expect(allTime.status).toBe(200);
    expect(allTimeBody).toMatchObject({ status: "ok", as_of_date: latestWorldwideDay() });
    expect(JSON.stringify(allTimeBody)).not.toMatch(/SECRET_|prompt|answer/i);
  });
});

describe("Phase 7 authenticated leaderboard copy", () => {
  it("reports copy eligibility only after any selected-day game submission", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await save("sam", "krillion", yesterday, 60, [60, 0, 0, 0, 0, 0, 0], "97");

    const withoutSubmission = await readDailyLeaderboard(
      env,
      { id: "alex", display_name: "Alex" },
      yesterday,
      fixedNow,
    );
    expect(withoutSubmission.copy_eligible).toBe(false);

    await save("alex", "maptap", yesterday, 820, [73, 99, 87, 78, 80]);
    const withOneSubmission = await readDailyLeaderboard(
      env,
      { id: "alex", display_name: "Alex" },
      yesterday,
      fixedNow,
    );
    expect(withOneSubmission.copy_eligible).toBe(true);
  });

  it("requires a session and rejects a signed-in player with no selected-day submission", async () => {
    await addPlayer("alex", "Alex");
    const token = await createSession("alex");

    await expect(
      copyApi(context(new Request(`https://wht.test/api/leaderboards/copy?date=${yesterday}`))),
    ).rejects.toMatchObject({ statusCode: 401 });

    await expect(
      copyApi(
        context(
          new Request(`https://wht.test/api/leaderboards/copy?date=${yesterday}`, {
            headers: { Cookie: `dgt_session=${token}` },
          }),
        ),
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: "COPY_NOT_ELIGIBLE",
    });
  });

  it("copies submitted players and omits unsubmitted game sections", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await save("sam", "krillion", yesterday, 60, [60, 0, 0, 0, 0, 0, 0], "97");
    await save("alex", "maptap", yesterday, 820, [73, 99, 87, 78, 80]);
    await save("alex", "krillion", today, 100, [100, 0, 0, 0, 0, 0, 0], "98");
    const token = await createSession("alex");

    for (const date of [yesterday, today]) {
      const response = await copyApi(
        context(
          new Request(`https://wht.test/api/leaderboards/copy?date=${date}`, {
            headers: { Cookie: `dgt_session=${token}` },
          }),
        ),
      );
      const body = (await response.json()) as Record<string, unknown>;
      expect(response.status).toBe(200);
      expect(body).toMatchObject({ status: "ok", date });
      expect(body.scoreboard_text).toEqual(expect.any(String));
      if (date === yesterday) {
        expect(body.scoreboard_text).toContain("KRILLION");
        expect(body.scoreboard_text).toContain("MAPTAP");
      } else {
        expect(body.scoreboard_text).toContain("KRILLION");
        expect(body.scoreboard_text).not.toContain("MAPTAP");
      }
      expect(body.scoreboard_text).not.toContain("Not played");
      expect(body.scoreboard_text).not.toContain("🔗 FULL DAILY LEADERBOARDS");
      expect(body.scoreboard_text).not.toContain(`/daily/${date}`);
      expect(body.scoreboard_text).not.toMatch(/SECRET_|EMOJI_|prompt|answer/i);
    }
  });

  it("validates the method and exactly one calendar date", async () => {
    await addPlayer("alex", "Alex");
    await save("alex", "krillion", yesterday, 60, [60, 0, 0, 0, 0, 0, 0], "97");
    const token = await createSession("alex");
    const headers = { Cookie: `dgt_session=${token}` };

    await expect(
      copyApi(
        context(
          new Request(`https://wht.test/api/leaderboards/copy?date=${yesterday}`, {
            method: "POST",
            headers,
          }),
        ),
      ),
    ).rejects.toMatchObject({ statusCode: 405 });

    for (const query of ["", "date=not-a-date", "date=2026-10-22&date=2026-10-23"]) {
      await expect(
        copyApi(
          context(new Request(`https://wht.test/api/leaderboards/copy?${query}`, { headers })),
        ),
      ).rejects.toMatchObject({ statusCode: 400, errorCode: "INVALID_DATE" });
    }
  });

  it("does not mutate submissions or read protected answer/prompt fields", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await save("alex", "krillion", yesterday, 60, [60, 0, 0, 0, 0, 0, 0], "97");
    await save("sam", "maptap", yesterday, 820, [73, 99, 87, 78, 80]);
    const token = await createSession("alex");
    const beforeSubmissions = await env.DB.prepare(
      `SELECT id, player_id, game_id, game_day_id, final_score, parser_version,
              source_kind, submitted_via_device_id, submitted_at, updated_at
       FROM submissions
       ORDER BY id`,
    ).all();
    const beforeRounds = await env.DB.prepare(
      `SELECT id, submission_id, round_number, prompt, answer, raw_score, original_emoji
       FROM round_results
       ORDER BY id`,
    ).all();
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
    const response = await copyApi({
      ...context(
        new Request(`https://wht.test/api/leaderboards/copy?date=${yesterday}`, {
          headers: { Cookie: `dgt_session=${token}` },
        }),
      ),
      env: { ...env, DB: db },
    } as Parameters<typeof copyApi>[0]);
    const afterSubmissions = await env.DB.prepare(
      `SELECT id, player_id, game_id, game_day_id, final_score, parser_version,
              source_kind, submitted_via_device_id, submitted_at, updated_at
       FROM submissions
       ORDER BY id`,
    ).all();
    const afterRounds = await env.DB.prepare(
      `SELECT id, submission_id, round_number, prompt, answer, raw_score, original_emoji
       FROM round_results
       ORDER BY id`,
    ).all();

    expect(response.status).toBe(200);
    expect(afterSubmissions.results).toEqual(beforeSubmissions.results);
    expect(afterRounds.results).toEqual(beforeRounds.results);
    expect(statements.join("\n")).not.toMatch(/\b(prompt|answer|original_emoji)\b/i);
    expect(await response.text()).not.toMatch(/SECRET_|EMOJI_/);
  });
});

describe("canonical daily browser route", () => {
  it("redirects legacy query-string daily links to the dated path", async () => {
    const response = await dailyPage({
      request: new Request("https://wht.test/daily?date=2026-10-23"),
      next: async () => new Response("shell"),
      env,
      data: {} as AppData,
    } as Parameters<typeof dailyPage>[0]);
    expect(response.status).toBe(308);
    expect(response.headers.get("Location")).toBe("/daily/2026-10-23");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("delegates non-daily paths to next unchanged", async () => {
    const nextResponse = new Response("shell", { status: 201 });
    let nextCalls = 0;
    const response = await dailyPage({
      request: new Request("https://wht.test/daily/2026-10-23"),
      next: async () => {
        nextCalls += 1;
        return nextResponse;
      },
      env,
      data: {} as AppData,
    } as Parameters<typeof dailyPage>[0]);

    expect(nextCalls).toBe(1);
    expect(response).toBe(nextResponse);
  });

  it.each([
    ["empty", "date="],
    ["invalid", "date=not-a-date"],
    ["duplicate", "date=2026-10-23&date=2026-10-24"],
  ])("rejects %s date query values with INVALID_DATE", async (_kind, query) => {
    await expect(
      dailyPage({
        request: new Request(`https://wht.test/daily?${query}`),
        next: async () => new Response("shell"),
        env,
        data: {} as AppData,
      } as Parameters<typeof dailyPage>[0]),
    ).rejects.toMatchObject({ statusCode: 400, errorCode: "INVALID_DATE" });
  });

  it("redirects the plain daily route to the current Pacific dated path", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-24T06:30:00.000Z") });
    try {
      const response = await dailyPage({
        request: new Request("https://wht.test/daily"),
        next: async () => new Response("shell"),
        env,
        data: {} as AppData,
      } as Parameters<typeof dailyPage>[0]);
      expect(response.status).toBe(308);
      expect(response.headers.get("Location")).toBe("/daily/2026-10-23");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    } finally {
      vi.useRealTimers();
    }
  });
});
