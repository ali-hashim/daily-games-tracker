import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { importRequest } from "../../functions/_lib/import";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppEnv } from "../../functions/_lib/runtime";

let runtime: Miniflare;
let env: AppEnv;
let code: string;
const now = new Date("2026-11-12T18:00:00Z");
const configuredBucket = {} as R2Bucket;
// Synthetic, text-only Farflung done page (invented prompts and answers).
const farflung = (expedition = 39) => ({
  capture_schema: "dgt.capture.v1",
  source_kind: "safari_webpage",
  source_url: "https://farflung.game/",
  page_title: "Farflung Geography Game - Play the Daily Map Quiz",
  visible_nodes: [],
  visible_text: [
    "1",
    "2",
    "3",
    "4",
    "5",
    `Expedition #${expedition}`,
    "Complete",
    "Share",
    "The answers",
    "1",
    "Pin a country with a volcano island",
    "Elusive",
    "“Kiribati”",
    "+85 km",
    "Show answers",
    "2",
    "Pin a country crossed by the equator",
    "Miss",
    "“Peru”",
    "0 km",
    "Show answers",
    "3",
    "Pin a country with a fjord",
    "Rare",
    "“Chile”",
    "+70 km",
    "Show answers",
    "4",
    "Pin a country famous for tulips",
    "Common",
    "“Netherlands”",
    "+40 km",
    "Show answers",
    "5",
    "Pin a country on two continents",
    "Farflung",
    "“Kazakhstan”",
    "+100 km",
    "Show answers",
    "Other games",
    `Expedition #${expedition + 1} opens in 6 h 0 m`,
    "Return home",
  ].join("\n"),
});
async function call(
  mode: "validate" | "submit",
  capture: unknown = farflung(),
  extra: Record<string, unknown> = {},
  credential = code,
  date = now,
) {
  const response = await importRequest(
    new Request(`https://wht.test/api/import/${mode}`, {
      method: "POST",
      headers: { Authorization: `Device ${credential}`, "Content-Type": "application/json" },
      body: JSON.stringify({ shortcut_version: 1, capture, ...extra }),
    }),
    env,
    "req_import_test",
    mode,
    date,
  );
  return { response, body: (await response.json()) as Record<string, unknown> };
}
async function submit(capture: unknown = farflung()) {
  const { body } = await call("validate", capture);
  expect(body.status).toBe("valid");
  return call("submit", capture);
}
const count = (table: string) =>
  env.DB.prepare(`SELECT count(*) n FROM ${table}`).first<number>("n");

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch() { return new Response('test') }}",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = {
    DB: (await runtime.getD1Database("DB")) as unknown as D1Database,
    APP_ENV: "test",
    SHORTCUT_BUCKET: configuredBucket,
  };
  const sql = readdirSync("migrations")
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(`migrations/${name}`, "utf8"))
    .join("\n")
    .replace(/^--.*$/gm, "");
  for (const statement of sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean))
    await env.DB.prepare(statement).run();
}, 30_000);
afterAll(async () => {
  await runtime?.dispose();
});
beforeEach(async () => {
  env.SHORTCUT_BUCKET = configuredBucket;
  for (const table of [
    "round_results",
    "submissions",
    "game_days",
    "web_sessions",
    "device_credentials",
    "players",
  ])
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  await env.DB.prepare(
    "UPDATE app_meta SET value = '1' WHERE key IN ('minimum_shortcut_version', 'latest_shortcut_version')",
  ).run();
  await env.DB.prepare("UPDATE games SET active = 1").run();
  code = randomToken();
  await env.DB.prepare("INSERT INTO players(id,display_name) VALUES ('p','Alex')").run();
  await env.DB.prepare(
    "INSERT INTO device_credentials(id,player_id,credential_hash) VALUES ('d','p',?)",
  )
    .bind(await hashToken(code))
    .run();
});

describe("Farflung imports", () => {
  it("validates with a tier preview, saves all five rounds and returns Farflung copy text", async () => {
    const validation = await call("validate");
    expect(validation.body.status).toBe("valid");
    expect(String(validation.body.confirmation_text)).toContain("Farflung — 2026-11-12");
    expect(String(validation.body.confirmation_text)).toContain("3. Chile — Rare 70");
    expect(String(validation.body.confirmation_text)).toContain("Total: 295");

    const result = await call("submit");
    expect(result.body).toMatchObject({
      status: "submitted",
      game: "farflung",
      game_date: "2026-11-12",
    });
    expect(String(result.body.scoreboard_text)).toContain("🧭 FARFLUNG — #39");
    expect(String(result.body.scoreboard_text)).toContain(
      "ELU 85 · MISS 0 · RAR 70 · COM 40 · FAR 100",
    );
    expect(String(result.body.scoreboard_text)).not.toContain("KRILLION");

    const saved = await env.DB.prepare(
      `SELECT d.external_puzzle_key, s.final_score, s.parser_version,
              group_concat(r.raw_score, ',') AS scores, group_concat(r.answer, '|') AS answers
       FROM submissions s JOIN game_days d ON d.id = s.game_day_id
       JOIN round_results r ON r.submission_id = s.id
       WHERE s.game_id = 'farflung' GROUP BY s.id`,
    ).first<Record<string, unknown>>();
    expect(saved).toMatchObject({
      external_puzzle_key: "39",
      final_score: 295,
      parser_version: "farflung.v1",
      scores: "85,0,70,40,100",
    });
    expect(String(saved?.answers)).toContain("Kazakhstan");
  });

  it("does not overwrite a saved Farflung result", async () => {
    await submit();
    const again = await call("submit");
    expect(again.body.status).toBe("already_submitted");
    expect(await count("submissions")).toBe(1);
  });

  it("rejects an expedition outside its worldwide window without writing", async () => {
    const result = await call("validate", farflung(30));
    expect(result.body).toMatchObject({ status: "error", error_code: "WRONG_GAME_DAY" });
    expect(await count("game_days")).toBe(0);
  });
});
