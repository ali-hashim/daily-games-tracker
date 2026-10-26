import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { onRequest as statsApi } from "../../functions/api/user/stats";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppEnv } from "../../functions/_lib/runtime";

let runtime: Miniflare;
let env: AppEnv;
const origin = "https://wht.test";

interface InstallUrlResponse {
  install_url: string | null;
}

async function decode<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

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
  const directory = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    for (const statement of readFileSync(new URL(file, directory), "utf8")
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean))
      await env.DB.prepare(statement).run();
  }
}, 30_000);

beforeEach(async () => {
  env.SHORTCUT_INSTALL_URL = undefined;
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

afterAll(async () => {
  await runtime?.dispose();
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
): Promise<void> {
  const gameDayId = `${game}-${date}`;
  const submissionId = `${playerId}-${game}-${date}`;
  await env.DB.prepare(
    `INSERT INTO game_days(id, game_id, game_date, external_puzzle_key)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(game_id, game_date) DO NOTHING`,
  )
    .bind(gameDayId, game, date, `${game}-${date}`)
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
        `SECRET_PROMPT_${index + 1}`,
        `SECRET_ANSWER_${index + 1}`,
        score,
        `SECRET_EMOJI_${index + 1}`,
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

function context(token?: string): Parameters<typeof statsApi>[0] {
  const headers = token ? { Cookie: `dgt_session=${token}` } : undefined;
  return {
    request: new Request(`${origin}/api/user/stats`, { headers }),
    env,
    data: { requestId: "req_user_stats_test" },
  } as Parameters<typeof statsApi>[0];
}

describe("authenticated personal stats", () => {
  it("returns private all-time metrics in active-game order without round data", async () => {
    await addPlayer("alex", "Alex");
    await addPlayer("sam", "Sam");
    await addPlayer("inactive", "Hidden", false);
    await save("alex", "krillion", "2026-10-20", 100, [100, 0, 0, 0, 0, 0, 0]);
    await save("alex", "krillion", "2026-10-21", 200, [100, 100, 0, 0, 0, 0, 0]);
    await save("sam", "krillion", "2026-10-20", 500, [100, 100, 100, 100, 100, 0, 0]);
    await save("alex", "maptap", "2026-10-20", 820, [73, 99, 87, 78, 80]);
    const token = await createSession("alex");

    const response = await statsApi(context(token));
    const body = await decode<Record<string, unknown>>(response);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Set-Cookie")).toContain("dgt_session=");
    expect(body).toMatchObject({
      status: "ok",
      player: { id: "alex", display_name: "Alex" },
      install_url: null,
    });
    expect(body.games).toEqual([
      {
        key: "krillion",
        display_name: "Krillion",
        icon: "🦐",
        total: 300,
        games_played: 2,
        average: 150,
        rank: 2,
      },
      {
        key: "maptap",
        display_name: "MapTap",
        icon: "🌎",
        total: 820,
        games_played: 1,
        average: 820,
        rank: 1,
      },
    ]);
    expect(JSON.stringify(body)).not.toMatch(
      /SECRET_PROMPT|SECRET_ANSWER|SECRET_EMOJI|round_number|device_code|challenge/i,
    );
  });

  it("returns zero and null values for games the player has not played", async () => {
    await addPlayer("alex", "Alex");
    const token = await createSession("alex");

    const response = await statsApi(context(token));
    const body = await decode<{ games: Array<Record<string, unknown>> }>(response);
    expect(body.games).toEqual([
      expect.objectContaining({
        key: "krillion",
        total: 0,
        games_played: 0,
        average: null,
        rank: null,
      }),
      expect.objectContaining({
        key: "maptap",
        total: 0,
        games_played: 0,
        average: null,
        rank: null,
      }),
    ]);
  });

  it("requires an authenticated session and refreshes it", async () => {
    await addPlayer("alex", "Alex");
    await expect(statsApi(context())).rejects.toMatchObject({
      statusCode: 401,
      errorCode: "SESSION_REQUIRED",
    });

    const token = await createSession("alex");
    const before = await env.DB.prepare("SELECT last_activity_at FROM web_sessions").first(
      "last_activity_at",
    );
    const response = await statsApi(context(token));
    expect(response.headers.get("Set-Cookie")).toContain("dgt_session=");
    const after = await env.DB.prepare("SELECT last_activity_at FROM web_sessions").first(
      "last_activity_at",
    );
    expect(after).not.toBe(before);
  });

  it("returns only the supported configured iCloud install URL", async () => {
    await addPlayer("alex", "Alex");
    const token = await createSession("alex");
    const valid = "https://www.icloud.com/shortcuts/EXAMPLE_SHORTCUT";
    env.SHORTCUT_INSTALL_URL = valid;
    expect(await decode<InstallUrlResponse>(await statsApi(context(token)))).toMatchObject({
      install_url: valid,
    });

    for (const value of [
      undefined,
      "http://www.icloud.com/shortcuts/EXAMPLE_SHORTCUT",
      "https://www.icloud.com.attacker.test/shortcuts/0123456789abcdef0123456789abcdef",
      "https://www.icloud.com/shortcuts/EXAMPLE_SHORTCUT",
      `${valid}?secret=do-not-echo`,
    ]) {
      env.SHORTCUT_INSTALL_URL = value;
      expect(await decode<InstallUrlResponse>(await statsApi(context(token)))).toMatchObject({
        install_url: null,
      });
    }
  });
});
