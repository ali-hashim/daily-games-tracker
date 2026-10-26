import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { importRequest } from "../../functions/_lib/import";
import * as tokenHelpers from "../../functions/_lib/tokens";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppEnv } from "../../functions/_lib/runtime";
import { parseCapture } from "../../parsers";
import { onRequest as middleware } from "../../functions/_middleware";

let runtime: Miniflare;
let env: AppEnv;
let code: string;
const now = new Date("2026-10-21T20:00:00Z");
const fixture = (name: string) =>
  JSON.parse(readFileSync(`tests/fixtures/capture/${name}.json`, "utf8"));
const map = () => fixture("2026-10-21-maptap-810.iphone");
const krill = () => fixture("2026-10-21-dive-98-285.refreshed.iphone");
async function call(
  mode: "validate" | "submit",
  capture: unknown = map(),
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
async function submit(capture: unknown = map()) {
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
      SHORTCUT_INSTALL_URL: "https://example.invalid/shortcuts/EXAMPLE_SHORTCUT",
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
  env.SHORTCUT_INSTALL_URL = "https://example.invalid/shortcuts/EXAMPLE_SHORTCUT";
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

describe("device authenticated D1 imports", () => {
  it("keeps auth, method, origin and body limits on the middleware import dispatch", async () => {
    for (const mode of ["validate", "submit"] as const) {
      for (const [method, headers, body, expected, status] of [
        ["POST", { "Content-Type": "application/json" }, "{}", "DEVICE_NOT_AUTHORIZED", 401],
        ["GET", {}, undefined, "METHOD_NOT_ALLOWED", 405],
        ["POST", { Origin: "https://other.test" }, "{}", "ORIGIN_REJECTED", 403],
        ["POST", { "Content-Length": String(384 * 1024 + 1) }, "{}", "PAYLOAD_TOO_LARGE", 413],
      ] as const) {
        const response = await middleware({
          request: new Request(`https://wht.test/api/import/${mode}`, { method, headers, body }),
          env,
          data: {},
          next: () => {
            throw new Error("Import dispatch unexpectedly reached the remaining router");
          },
        } as unknown as Parameters<typeof middleware>[0]);
        const result = (await response.json()) as Record<string, unknown>;
        expect(response.status).toBe(status);
        expect(result.error_code).toBe(expected);
        expect(response.headers.get("X-Request-ID")).toBe(result.request_id);
        expect(response.headers.get("Cache-Control")).toBe("no-store");
        expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
        if (status === 405) expect(response.headers.get("Allow")).toBe("POST");
      }
    }
    const next = vi.fn(async () => new Response("existing route"));
    const response = await middleware({
      request: new Request("https://wht.test/api/import/validate-extra"),
      env,
      data: {},
      next,
    } as unknown as Parameters<typeof middleware>[0]);
    expect(await response.text()).toBe("existing route");
    expect(next).toHaveBeenCalledOnce();
    expect(await count("submissions")).toBe(0);
  });
  it("returns unambiguous server directions for both wrong Share methods", async () => {
    const wrongKrillion = {
      capture_schema: "dgt.capture.v1",
      source_kind: "shared_text",
      shared_text: "KRILLION DIVE #98 COMPLETE 285",
    };
    const wrongMap = {
      ...krill(),
      source_url: "https://www.maptap.gg/",
      page_title: "MapTap",
      visible_text: "MapTap",
    };
    for (const mode of ["validate", "submit"] as const) {
      const krillion = await call(mode, wrongKrillion);
      expect(krillion.body.error_code).toBe("INCOMPLETE_KRILLION_SHARE");
      expect(krillion.body.error_message).toContain("Safari browser’s Share Website menu");
      expect(krillion.body.error_message).toContain(
        'Do NOT use the "SHARE..." button inside the Krillion website',
      );
      const maptap = await call(mode, wrongMap);
      expect(maptap.body.error_code).toBe("INCOMPLETE_MAPTAP_SHARE");
      expect(maptap.body.error_message).toContain(
        'blue "Share your score" button inside the MapTap website',
      );
      expect(maptap.body.error_message).toContain(
        "Do NOT use the Safari browser’s Share Website menu",
      );
      expect(maptap.body.error_message).toContain("Nothing was submitted.");
    }
    expect(await count("submissions")).toBe(0);
  });
  it("returns clipboard-ready server text and completion-menu values after a new save", async () => {
    const result = await submit();
    expect(result.body.status).toBe("submitted");
    expect(result.body.scoreboard_text).toContain("MAPTAP");
    expect(result.body.scoreboard_text).not.toContain("KRILLION");
    expect(result.body.scoreboard_text).toContain("72 · 98 · 86 · 77 · 79");
    expect(result.body.scoreboard_text).not.toContain("🎓");
    expect(result.body.wht_url).toBe("https://wht.test/daily/2026-10-21");
    expect(result.body.completion_message).toBe(
      "Upload successful. Scoreboard copied to clipboard.",
    );
    expect((await call("submit")).body.scoreboard_text).toBe(result.body.scoreboard_text);
  });
  it("keeps a committed upload successful when scoreboard preparation fails", async () => {
    const original = env.DB;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            if (sql.includes("WITH totals AS")) throw new Error("forced scoreboard read failure");
            return target.prepare(sql);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const result = await submit();
      expect(result.body.status).toBe("submitted");
      expect(result.body.scoreboard_text).toBeNull();
      expect(result.body.completion_message).toBe(
        "Upload successful. Scoreboard copying is unavailable right now.",
      );
      expect(await count("submissions")).toBe(1);
      expect(await count("round_results")).toBe(5);
      for (const mode of ["validate", "submit"] as const) {
        const repeated = await call(mode);
        expect(repeated.response.status).toBe(200);
        expect(repeated.body.status).toBe("already_submitted");
        expect(repeated.body.scoreboard_text).toBeNull();
        expect(repeated.body.completion_message).toBe(
          "You already have a result saved for this game today. Scoreboard copying is unavailable right now.",
        );
      }
    } finally {
      env.DB = original;
    }
  });
  it("returns the already-saved notice after a lost post-commit response", async () => {
    const original = env.DB;
    let lost = false;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            const result = await target.batch(statements);
            if (!lost) {
              lost = true;
              throw new Error("simulated response loss after commit");
            }
            return result;
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      expect((await call("submit", map())).body).toMatchObject({
        status: "already_submitted",
        message: "You already have a result saved for this game today.",
      });
      expect(await count("submissions")).toBe(1);
      expect(await count("round_results")).toBe(5);
    } finally {
      env.DB = original;
    }
  });
  it("returns competition rank using active players and excludes inactive higher scores", async () => {
    const first = await submit();
    for (const [id, score, active] of [
      ["a", 900, 1],
      ["b", 900, 1],
      ["c", 810, 1],
      ["inactive", 1000, 0],
    ] as const) {
      await env.DB.prepare("INSERT INTO players(id,display_name,active) VALUES (?,?,?)")
        .bind(id, id, active)
        .run();
      await env.DB.prepare(
        `INSERT INTO submissions(id,player_id,game_id,game_day_id,final_score,parser_version,source_kind)
        SELECT ?,?,'maptap',game_day_id,?,'maptap.v1','admin' FROM submissions WHERE id = ?`,
      )
        .bind(id, id, score, first.body.submission_id)
        .run();
      const rounds = score === 810 ? [72, 98, 86, 77, 79] : Array(5).fill(score / 10);
      await env.DB.batch(
        rounds.map((raw: number, i: number) =>
          env.DB.prepare(
            "INSERT INTO round_results(id,submission_id,round_number,raw_score,original_emoji) VALUES (?,?,?,?,?)",
          ).bind(`${id}-${i}`, id, i + 1, raw, "🔥"),
        ),
      );
    }
    code = randomToken();
    await env.DB.prepare(
      "INSERT INTO players(id,display_name) VALUES ('new-player','New player')",
    ).run();
    await env.DB.prepare(
      "INSERT INTO device_credentials(id,player_id,credential_hash) VALUES ('new-device','new-player',?)",
    )
      .bind(await hashToken(code))
      .run();
    const ranked = await submit();
    expect(ranked.body.daily_rank).toBe(3);
    expect(ranked.body.submission_id).not.toBe(first.body.submission_id);
  });
  it("refreshes the leaderboard on either repeat endpoint without attempting a write", async () => {
    const first = await submit();
    const savedCode = code;
    code = randomToken();
    await env.DB.prepare("INSERT INTO players(id,display_name) VALUES ('sam','Sam')").run();
    await env.DB.prepare(
      "INSERT INTO device_credentials(id,player_id,credential_hash) VALUES ('sam-device','sam',?)",
    )
      .bind(await hashToken(code))
      .run();
    const higher = map();
    higher.shared_text = higher.shared_text.replace("72", "73").replace("810", "811");
    await submit(higher);
    code = savedCode;
    const original = env.DB;
    let readCalls = 0;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "prepare")
          return (sql: string) => {
            readCalls++;
            return target.prepare(sql);
          };
        if (key === "batch")
          return () => {
            throw new Error("repeat must not write");
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      for (const mode of ["validate", "submit"] as const) {
        readCalls = 0;
        const repeat = await call(mode);
        expect(repeat.body.status).toBe("already_submitted");
        expect(repeat.body.submission_id).toBe(first.body.submission_id);
        expect(repeat.body.daily_rank).toBe(2);
        expect(repeat.body.scoreboard_text).toContain("#1 · 811 — Sam");
        expect(repeat.body.scoreboard_text).toContain("#2 · 810 — Alex");
        expect(repeat.body.scoreboard_text).not.toBe(first.body.scoreboard_text);
        expect(readCalls).toBeLessThanOrEqual(3);
      }
      expect(await count("submissions")).toBe(2);
      expect(await count("round_results")).toBe(10);
    } finally {
      env.DB = original;
    }
  });
  it("rejects method/cross-origin/body errors with safe messages and preserves Allow", async () => {
    for (const [method, headers, body, expected] of [
      ["GET", {}, undefined, "METHOD_NOT_ALLOWED"],
      ["POST", { Origin: "https://other.test" }, "{}", "ORIGIN_REJECTED"],
      ["POST", { "Sec-Fetch-Site": "cross-site" }, "{}", "ORIGIN_REJECTED"],
      ["POST", {}, "bad", "UNSUPPORTED_MEDIA_TYPE"],
      ["POST", { "Content-Type": "application/json" }, "bad", "INVALID_JSON"],
      [
        "POST",
        { "Content-Type": "application/json" },
        "x".repeat(384 * 1024 + 1),
        "PAYLOAD_TOO_LARGE",
      ],
    ] as const) {
      const response = await importRequest(
        new Request("https://wht.test/api/import/validate", {
          method,
          headers: { Authorization: `Device ${code}`, ...headers },
          body,
        }),
        env,
        "req_safe",
        "validate",
        now,
      );
      const result = (await response.json()) as Record<string, unknown>;
      expect(result.error_code).toBe(expected);
      expect(result.error_message).toContain("Nothing was submitted");
      if (method === "GET") expect(response.headers.get("Allow")).toBe("POST");
      expect(JSON.stringify(result)).not.toContain(code);
    }
  });
  it("rolls back if a competing player establishes a different puzzle after precheck", async () => {
    const original = env.DB;
    let intercepted = false;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!intercepted) {
              intercepted = true;
              await original
                .prepare(
                  "INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES ('winner','krillion','2026-10-21','other-puzzle')",
                )
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const capture = krill();
      expect((await call("submit", capture)).body.error_code).toBe("IDENTITY_CONFLICT");
      expect(await count("submissions")).toBe(0);
      expect(await count("round_results")).toBe(0);
      expect(await count("game_days")).toBe(1);
    } finally {
      env.DB = original;
    }
  });
  it("rejects a conflicting recovered duplicate instead of returning already submitted", async () => {
    const original = env.DB;
    let intercepted = false;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!intercepted) {
              intercepted = true;
              await original
                .prepare(
                  "INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES ('conflict','maptap','2026-10-21','other-puzzle')",
                )
                .run();
              await original
                .prepare(
                  "INSERT INTO submissions(id,player_id,game_id,game_day_id,final_score,parser_version,source_kind) VALUES ('conflict-submission','p','maptap','conflict',999,'maptap.v1','admin')",
                )
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      const result = await call("submit", map());
      expect(result.response.status).toBe(409);
      expect(result.body.error_code).toBe("IDENTITY_CONFLICT");
      expect(result.body.status).toBe("error");
      expect(await count("submissions")).toBe(1);
    } finally {
      env.DB = original;
    }
  });
  it("does not save if the authenticated device is revoked before the write batch", async () => {
    const original = env.DB;
    let intercepted = false;
    env.DB = new Proxy(original, {
      get(target, key) {
        if (key === "batch")
          return async (statements: D1PreparedStatement[]) => {
            if (!intercepted) {
              intercepted = true;
              await original
                .prepare("UPDATE device_credentials SET revoked_at = ? WHERE id = 'd'")
                .bind(now.toISOString())
                .run();
            }
            return target.batch(statements);
          };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    try {
      expect((await call("submit", map())).body.status).toBe("error");
      for (const table of ["game_days", "submissions", "round_results"])
        expect(await count(table)).toBe(0);
    } finally {
      env.DB = original;
    }
  });
  it("validates/cancels without creating a game day, submission or rounds", async () => {
    for (const capture of [map(), krill()]) {
      const { response, body } = await call("validate", capture);
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(body.confirmation_text).toContain("Player: Alex");
      expect(body.confirmation_text).toContain("Validation passed");
      expect(body).not.toHaveProperty("confirmed_result_hash");
      expect(body).not.toHaveProperty("scoreboard_text");
      expect(body.request_id).toBe("req_import_test");
    }
    for (const table of ["game_days", "submissions", "round_results"])
      expect(await count(table)).toBe(0);
  });
  it.each([
    [map, 810, 5],
    [krill, 285, 7],
  ] as const)("stores complete normalized results once (%s)", async (capture, total, rounds) => {
    const original = capture();
    const first = await submit(original);
    expect(first.body).toMatchObject({ status: "submitted", final_score: total, daily_rank: 1 });
    expect(await count("submissions")).toBe(1);
    expect(await count("round_results")).toBe(rounds);
    const retry = await call("submit", original);
    expect(retry.body).toMatchObject({
      status: "already_submitted",
      message: "You already have a result saved for this game today.",
    });
    expect(await count("submissions")).toBe(1);
    const saved = await env.DB.prepare("SELECT * FROM round_results ORDER BY round_number").all();
    const expected = parseCapture(original, now);
    for (const [i, row] of saved.results.entries())
      expect(row).toMatchObject({
        round_number: i + 1,
        prompt: expected.rounds[i].prompt ?? null,
        answer: expected.rounds[i].answer ?? null,
        raw_score: expected.rounds[i].rawScore,
        original_emoji: expected.rounds[i].originalEmoji ?? null,
      });
    const allSaved = JSON.stringify(saved.results);
    expect(allSaved).not.toContain(code);
    expect(allSaved).not.toContain("visible_nodes");
  });
  it("returns the same notice for all repeated valid results and preserves the saved content", async () => {
    await submit();
    const before = await env.DB.prepare("SELECT * FROM round_results ORDER BY round_number").all();
    const originalRows = await env.DB.prepare("SELECT * FROM submissions").all();
    const changed = map();
    changed.shared_text = changed.shared_text.replace("72", "73").replace("810", "811");
    const emoji = map();
    emoji.shared_text = emoji.shared_text.replace("🫢", "🔥");
    for (const capture of [map(), changed, emoji])
      for (const mode of ["validate", "submit"] as const) {
        const duplicate = await call(mode, capture);
        expect(duplicate.response.status).toBe(200);
        expect(duplicate.body).toMatchObject({
          status: "already_submitted",
          message: "You already have a result saved for this game today.",
        });
        expect(duplicate.body).not.toHaveProperty("success_message");
        expect(duplicate.body).not.toHaveProperty("final_score");
        expect(duplicate.body.scoreboard_text).toContain("#1 · 810 — Alex");
        expect(duplicate.body.scoreboard_text).not.toContain("811 — Alex");
        expect(duplicate.body.completion_message).toBe(
          "You already have a result saved for this game today. Scoreboard copied to clipboard.",
        );
        expect(duplicate.body.wht_url).toBe("https://wht.test/daily/2026-10-21");
      }
    expect(
      (await env.DB.prepare("SELECT * FROM round_results ORDER BY round_number").all()).results,
    ).toEqual(before.results);
    expect((await env.DB.prepare("SELECT * FROM submissions").all()).results).toEqual(
      originalRows.results,
    );
    expect(await count("submissions")).toBe(1);
  });
  it("returns a scoreboard for a different repeat without modifying saved rounds", async () => {
    await submit();
    const changed = map();
    changed.shared_text = changed.shared_text.replace("72", "73").replace("810", "811");
    for (const mode of ["validate", "submit"] as const)
      expect((await call(mode, changed)).body.status).toBe("already_submitted");
    expect(await count("submissions")).toBe(1);
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      810,
    );
  });
  it("revalidates submit and accepts a changed valid capture without a confirmation proof", async () => {
    expect((await call("validate")).body.status).toBe("valid");
    const bad = map();
    bad.shared_text = bad.shared_text.replace("810", "999");
    expect((await call("submit", bad)).body.error_code).toBe("SCORE_MISMATCH");
    expect(await count("submissions")).toBe(0);
    const changed = map();
    changed.shared_text = changed.shared_text.replace("72", "73").replace("810", "811");
    expect((await call("submit", changed)).body).toMatchObject({
      status: "submitted",
      final_score: 811,
    });
  });
  it("accepts a dated MapTap result after Pacific midnight while its worldwide window is open", async () => {
    const capture = map();
    expect((await call("validate", capture)).body.status).toBe("valid");
    const next = await call("submit", capture, {}, code, new Date("2026-10-22T07:00:00Z"));
    expect(next.body).toMatchObject({ status: "submitted", game_date: "2026-10-21" });
    expect(await count("submissions")).toBe(1);
  });
  it("does not save a result validated before the worldwide close when submit crosses it", async () => {
    const capture = map();
    expect((await call("validate", capture)).body.status).toBe("valid");
    const next = await call("submit", capture, {}, code, new Date("2026-10-22T12:00:00Z"));
    expect(next.body.error_code).toBe("WRONG_GAME_DAY");
    expect(await count("submissions")).toBe(0);
  });
  it.each([
    [new Date("2026-10-20T09:59:59.999Z"), "before opening"],
    [new Date("2026-10-22T12:00:00.000Z"), "after closing"],
  ])("rejects a MapTap capture with no pre-existing row %s", async (date) => {
    const result = await call("submit", map(), {}, code, date);
    expect(result.body.error_code).toBe("WRONG_GAME_DAY");
    expect(await count("game_days")).toBe(0);
    expect(await count("submissions")).toBe(0);
  });
  it("hashes only device credentials, never game results, through validation, save and repeats", async () => {
    const spy = vi.spyOn(tokenHelpers, "hashToken");
    try {
      expect((await call("validate")).body.status).toBe("valid");
      expect((await call("submit")).body.status).toBe("submitted");
      expect((await call("validate")).body.status).toBe("already_submitted");
      expect((await call("submit")).body.status).toBe("already_submitted");
      expect(spy.mock.calls.map(([value]) => value)).toEqual([code, code, code, code]);
      const columns = await env.DB.prepare("PRAGMA table_info(submissions)").all<{
        name: string;
      }>();
      expect(columns.results.map((column) => column.name)).not.toContain("result_hash");
    } finally {
      spy.mockRestore();
    }
  });
  it("rejects the removed confirmation field under the strict two-field request contract", async () => {
    for (const mode of ["validate", "submit"] as const)
      expect((await call(mode, map(), { confirmed_result_hash: "obsolete" })).body.error_code).toBe(
        "INVALID_REQUEST",
      );
    expect(await count("submissions")).toBe(0);
  });
  it("saves one concurrent identical submission and reports all others already saved", async () => {
    const results = await Promise.all(Array.from({ length: 4 }, () => call("submit", map())));
    expect(results.filter((r) => r.body.status === "submitted")).toHaveLength(1);
    expect(results.filter((r) => r.body.status === "already_submitted")).toHaveLength(3);
    expect(
      results
        .filter((r) => r.body.status === "already_submitted")
        .every(
          (r) =>
            r.body.message === "You already have a result saved for this game today." &&
            typeof r.body.scoreboard_text === "string",
        ),
    ).toBe(true);
    expect(await count("submissions")).toBe(1);
    expect(await count("round_results")).toBe(5);
  });
  it("permits one winner for concurrent different results", async () => {
    const a = map(),
      b = map();
      b.shared_text = b.shared_text.replace("72", "73").replace("810", "811");
    const results = await Promise.all([a, b].map((capture) => call("submit", capture)));
    expect(results.map((r) => r.body.status).sort()).toEqual(["already_submitted", "submitted"]);
    expect(
      results.find((r) => r.body.status === "already_submitted")?.body.scoreboard_text,
    ).toEqual(expect.any(String));
    expect(await count("submissions")).toBe(1);
    expect(await count("round_results")).toBe(5);
  });
  it("rolls back new game-day, submission, rounds and activity when round insertion fails", async () => {
    await env.DB.prepare(
      "CREATE TRIGGER fail_round BEFORE INSERT ON round_results WHEN NEW.round_number = 3 BEGIN SELECT RAISE(ABORT, 'forced'); END",
    ).run();
    try {
      expect((await call("submit", map())).body.error_code).toBe("IMPORT_UNAVAILABLE");
      for (const table of ["game_days", "submissions", "round_results"])
        expect(await count(table)).toBe(0);
      expect(
        await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
      ).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_round").run();
    }
  });
  it("rejects established puzzle mismatch and historical reuse across players", async () => {
    const r = parseCapture(krill(), now);
    await env.DB.prepare(
      "INSERT INTO game_days(id,game_id,game_date,external_puzzle_key) VALUES ('old','krillion',?,?)",
    )
      .bind(r.gameDate, "different")
      .run();
    expect((await call("validate", krill())).body.error_code).toBe("IDENTITY_CONFLICT");
    await env.DB.prepare("UPDATE game_days SET game_date = '2026-10-20', external_puzzle_key = ?")
      .bind(r.externalPuzzleKey)
      .run();
    expect((await call("validate", krill())).body.error_code).toBe("IDENTITY_CONFLICT");
    expect(await count("submissions")).toBe(0);
  });
  it("reads game and version policy freshly on repeat requests", async () => {
    await submit();
    await env.DB.prepare("UPDATE games SET active = 0 WHERE id = 'maptap'").run();
    for (const mode of ["validate", "submit"] as const)
      expect((await call(mode)).body.error_code).toBe("PARSER_UNSUPPORTED");
    await env.DB.prepare("UPDATE games SET active = 1 WHERE id = 'maptap'").run();
    await env.DB.prepare(
      "UPDATE app_meta SET value = '2' WHERE key IN ('minimum_shortcut_version','latest_shortcut_version')",
    ).run();
    for (const mode of ["validate", "submit"] as const)
      expect((await call(mode)).body.status).toBe("update_required");
    expect(await count("submissions")).toBe(1);
    expect(await count("round_results")).toBe(5);
  });
  it.each(["minimum_shortcut_version", "latest_shortcut_version"])(
    "fails closed with missing policy %s in the combined authentication read",
    async (key) => {
      await env.DB.prepare("DELETE FROM app_meta WHERE key = ?").bind(key).run();
      try {
        for (const mode of ["validate", "submit"] as const) {
          const result = await call(mode);
          expect(result.response.status).toBe(503);
          expect(result.body.error_code).toBe("IMPORT_UNAVAILABLE");
        }
        expect(await count("submissions")).toBe(0);
        expect(
          await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
        ).toBeNull();
      } finally {
        await env.DB.prepare(
          "INSERT INTO app_meta(key,value) VALUES (?, '1') ON CONFLICT(key) DO UPDATE SET value = '1'",
        )
          .bind(key)
          .run();
      }
    },
  );
  it("rejects unauthorized, revoked and inactive devices without activity", async () => {
    expect((await call("validate", map(), {}, randomToken())).body.error_code).toBe(
      "DEVICE_NOT_AUTHORIZED",
    );
    await env.DB.prepare("UPDATE players SET active = 0").run();
    expect((await call("validate")).response.status).toBe(401);
    await env.DB.prepare("UPDATE players SET active = 1").run();
    await env.DB.prepare("UPDATE device_credentials SET revoked_at = ?")
      .bind(now.toISOString())
      .run();
    expect((await call("validate")).body.error_code).toBe("DEVICE_NOT_AUTHORIZED");
    expect(
      await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
    ).toBeNull();
  });
  it("refreshes only live sessions, caps absolute expiry and excludes revoked source devices", async () => {
    const stamp = now.toISOString();
    for (const [id, idle, absolute, revoked, source] of [
      ["live", "2026-10-22T20:00:00Z", "2027-01-01T00:00:00Z", null, "d"],
      ["cap", "2026-10-22T00:00:00Z", "2026-10-23T00:00:00Z", null, "d"],
      ["expired", stamp, "2027-01-01T00:00:00Z", null, "d"],
      ["revoked", "2026-10-22T20:00:00Z", "2027-01-01T00:00:00Z", stamp, "d"],
      ["other-device", "2026-10-22T20:00:00Z", "2027-01-01T00:00:00Z", null, "revoked-device"],
    ]) {
      if (source === "revoked-device")
        await env.DB.prepare(
          "INSERT INTO device_credentials(id,player_id,credential_hash,revoked_at) VALUES ('revoked-device','p','other',?)",
        )
          .bind(stamp)
          .run();
      await env.DB.prepare(
        "INSERT INTO web_sessions(id,player_id,session_hash,source_device_id,idle_expires_at,absolute_expires_at,last_activity_at,revoked_at) VALUES (?,'p',?,?,?,?,?,?)",
      )
        .bind(id, id, source, idle, absolute, "2026-10-20T00:00:00Z", revoked)
        .run();
    }
    await call("validate");
    const sessions = (
      await env.DB.prepare("SELECT id,idle_expires_at,last_activity_at FROM web_sessions").all<{
        id: string;
        idle_expires_at: string;
        last_activity_at: string;
      }>()
    ).results;
    expect(sessions.find((s) => s.id === "live")?.idle_expires_at).toBe("2026-10-28T20:00:00.000Z");
    expect(sessions.find((s) => s.id === "cap")?.idle_expires_at).toBe("2026-10-23T00:00:00Z");
    for (const id of ["expired", "revoked", "other-device"])
      expect(sessions.find((s) => s.id === id)?.last_activity_at).toBe("2026-10-20T00:00:00Z");
  });
  it("blocks required updates before parsing, permits optional updates and rejects invalid fields", async () => {
    await env.DB.prepare(
      "UPDATE app_meta SET value = '2' WHERE key IN ('minimum_shortcut_version','latest_shortcut_version')",
    ).run();
    const required = await call("validate", null);
    expect(required.body).toMatchObject({
      status: "update_required",
      latest_version: 2,
      install_url: env.SHORTCUT_INSTALL_URL,
    });
    expect(required.body.error_message).toContain("Nothing was submitted");
    await env.DB.prepare(
      "UPDATE app_meta SET value = '1' WHERE key = 'minimum_shortcut_version'",
    ).run();
    expect((await call("validate")).body.shortcut_support).toBe("update_available");
    for (const extra of [
      { shortcut_version: "1" },
      { shortcut_version: 0 },
      { normalized_result: { finalScore: 1000 } },
    ])
      expect((await call("validate", map(), extra)).body.error_code).toBe("INVALID_REQUEST");
    expect(await count("submissions")).toBe(0);
  });
  it.each([
    undefined,
    "",
    "not a URL",
    "http://example.invalid/shortcuts/0123456789abcdef0123456789abcdef",
    "https://example.invalid.attacker.test/shortcuts/0123456789abcdef0123456789abcdef",
    "https://example.invalid/shortcuts/not-a-shortcut",
    "https://example.invalid/shortcuts/0123456789abcdef0123456789abcdef?secret=do-not-echo",
    "https://user:do-not-echo@example.invalid/shortcuts/0123456789abcdef0123456789abcdef",
  ])(
    "returns safe update recovery without writes for an unusable install link (%s)",
    async (url) => {
      env.SHORTCUT_INSTALL_URL = url;
      await env.DB.prepare(
        "UPDATE app_meta SET value = '2' WHERE key IN ('minimum_shortcut_version','latest_shortcut_version')",
      ).run();
      for (const mode of ["validate", "submit"] as const) {
        // Null capture proves this branch runs before parsing or any score write.
        const result = await call(mode, null);
        expect(result.response.status).toBe(503);
        expect(result.body).toMatchObject({
          status: "error",
          error_code: "SHORTCUT_UPDATE_UNAVAILABLE",
          request_id: "req_import_test",
        });
        expect(result.body.error_message).toContain("Contact the administrator");
        expect(result.body.error_message).toContain("Nothing was submitted.");
        expect(result.body).not.toHaveProperty("install_url");
        expect(result.body).not.toHaveProperty("scoreboard_text");
        expect(JSON.stringify(result.body)).not.toContain("do-not-echo");
        expect(JSON.stringify(result.body)).not.toContain(code);
        expect(result.response.headers.get("Cache-Control")).toBe("no-store");
      }
      for (const table of ["game_days", "submissions", "round_results"])
        expect(await count(table)).toBe(0);
      expect(
        await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
      ).toBeNull();
    },
  );
  it("does not block supported or optional-update imports when the install link is unavailable", async () => {
    env.SHORTCUT_INSTALL_URL = undefined;
    expect((await call("validate")).body).toMatchObject({ status: "valid", install_url: null });
    await env.DB.prepare(
      "UPDATE app_meta SET value = '2' WHERE key = 'latest_shortcut_version'",
    ).run();
    const optional = await call("validate");
    expect(optional.body).toMatchObject({
      status: "valid",
      shortcut_support: "update_available",
      install_url: null,
    });
    expect((await call("submit")).body.status).toBe("submitted");
    expect(await count("submissions")).toBe(1);
    expect(await count("round_results")).toBe(5);
  });
  it("returns a usable required-update URL from either endpoint before parsing without activity writes", async () => {
    await env.DB.prepare(
      "UPDATE app_meta SET value = '2' WHERE key IN ('minimum_shortcut_version','latest_shortcut_version')",
    ).run();
    for (const mode of ["validate", "submit"] as const) {
      const result = await call(mode, null);
      expect(result.response.status).toBe(426);
      expect(result.body).toMatchObject({
        status: "update_required",
        install_url: env.SHORTCUT_INSTALL_URL,
      });
      expect(result.body.error_message).toContain("Nothing was submitted.");
    }
    for (const table of ["game_days", "submissions", "round_results"])
      expect(await count(table)).toBe(0);
    expect(
      await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
    ).toBeNull();
  });
  it("rejects the Phase 5A synthetic compatibility sentinel before score or activity writes", async () => {
    const sentinel = {
      capture_schema: "dgt.capture.v1",
      source_kind: "shared_text",
      shared_text: "WHT compatibility test",
    };
    const result = await call("validate", sentinel);
    expect(result.response.status).toBe(422);
    expect(result.body).toMatchObject({ status: "error", error_code: "PARSER_UNSUPPORTED" });
    expect(result.body.error_message).toContain("Nothing was submitted");
    for (const table of ["game_days", "submissions", "round_results"])
      expect(await count(table)).toBe(0);
    expect(
      await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
    ).toBeNull();
  });
  it("keeps failed validation from refreshing device activity", async () => {
    const bad = map();
    bad.shared_text = bad.shared_text.replace("810", "999");
    expect((await call("validate", bad)).body.error_code).toBe("SCORE_MISMATCH");
    expect(
      await env.DB.prepare("SELECT last_used_at FROM device_credentials").first("last_used_at"),
    ).toBeNull();
  });
});
