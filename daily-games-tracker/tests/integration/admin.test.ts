import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import {
  backfillSubmission,
  correctSubmission,
  deleteSubmission,
  listAdminAudits,
  listAdminDevices,
  listAdminInvitations,
  listAdminPlayers,
  listAdminSessions,
  listAdminSubmissions,
} from "../../functions/_lib/admin";
import type { AppData, AppEnv } from "../../functions/_lib/runtime";
import { onRequest as adminApi } from "../../functions/api/admin/[[path]]";
import { onRequest as adminPage } from "../../functions/admin";
import { onRequest as middleware } from "../../functions/_middleware";
import { readAllTimeLeaderboard } from "../../functions/_lib/leaderboards";

let runtime: Miniflare;
let env: AppEnv;
const admin = "admin@example.test";
const issuer = "https://wht-integration.cloudflareaccess.com";
const audience = "integration-admin";
let privateKey: CryptoKey;
let publicKey: CryptoKey;

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } };",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = {
    DB: (await runtime.getD1Database("DB")) as unknown as D1Database,
    CLOUDFLARE_ACCESS_DOMAIN: issuer,
    CLOUDFLARE_ACCESS_AUD: audience,
    ADMIN_EMAIL: admin,
  };
  const directory = new URL("../../migrations/", import.meta.url);
  const migration = readdirSync(directory)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, directory), "utf8"))
    .join("\n");
  const statements = migration
    .replace(/^--.*$/gm, "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
  ({ privateKey, publicKey } = await generateKeyPair("RS256"));
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    if (String(input) !== `${issuer}/cdn-cgi/access/certs`) throw new Error("unexpected fetch");
    return Response.json({
      keys: [{ ...(await exportJWK(publicKey)), kid: "integration", alg: "RS256" }],
    });
  });
});

beforeEach(async () => {
  for (const table of [
    "round_results",
    "submissions",
    "game_days",
    "admin_audit_log",
    "login_challenges",
    "web_sessions",
    "device_credentials",
    "registration_invites",
    "players",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
});

afterAll(async () => {
  vi.restoreAllMocks();
  await runtime?.dispose();
});

async function jwtFor(email = admin) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "RS256", kid: "integration" })
    .setSubject(`subject-${email}`)
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(privateKey);
}

async function invoke(path: string, init: RequestInit = {}, useMiddleware = true) {
  const request = new Request(`https://wht.test${path}`, {
    ...init,
    headers: {
      Origin: "https://wht.test",
      "Content-Type": "application/json",
      "Cf-Access-Jwt-Assertion": await jwtFor(),
      ...init.headers,
    },
  });
  const context = { request, env, data: { requestId: "admin-test" } } as Parameters<
    PagesFunction<AppEnv, string, AppData>
  >[0];
  context.next = async () => adminApi(context);
  return useMiddleware ? middleware(context) : adminApi(context);
}

async function insertPlayer(id = "player-1", name = "Alex") {
  await env.DB.prepare("INSERT INTO players(id, display_name) VALUES (?, ?)").bind(id, name).run();
  return id;
}

async function insertSubmission(
  game: "krillion" | "maptap" = "maptap",
  playerId = "player-1",
  submissionId = "submission-1",
  date = "2026-10-20",
) {
  const rounds =
    game === "maptap"
      ? [73, 99, 87, 78, 80].map((rawScore, index) => ({
          round_number: index + 1,
          raw_score: rawScore,
          original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
        }))
      : [100, 85, 60, 30, 15, 10, 0].map((rawScore, index) => ({
          round_number: index + 1,
          prompt: `NAME ${index + 1}`,
          answer: index === 6 ? null : `answer-${index + 1}`,
          raw_score: rawScore,
        }));
  const total = game === "maptap" ? 820 : 300;
  await env.DB.prepare(
    "INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES (?, ?, ?, ?)",
  )
    .bind(`day-${submissionId}`, game, date, game === "maptap" ? date : "98")
    .run();
  await env.DB.prepare(
    `INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, parser_version, source_kind)
     VALUES (?, ?, ?, ?, ?, ?, 'shared_text')`,
  )
    .bind(submissionId, playerId, game, `day-${submissionId}`, total, `${game}.v1`)
    .run();
  for (const round of rounds) {
    await env.DB.prepare(
      `INSERT INTO round_results(id, submission_id, round_number, prompt, answer, raw_score, original_emoji)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        `${submissionId}-round-${round.round_number}`,
        submissionId,
        round.round_number,
        "prompt" in round ? round.prompt : null,
        "answer" in round ? round.answer : null,
        round.raw_score,
        "original_emoji" in round ? round.original_emoji : null,
      )
      .run();
  }
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function gatedSubmissionBatch() {
  const reached = deferred<void>();
  const release = deferred<void>();
  const db = new Proxy(env.DB, {
    get(target, property, receiver) {
      if (property !== "batch") return Reflect.get(target, property, receiver);
      return async (statements: D1PreparedStatement[]) => {
        reached.resolve();
        await release.promise;
        return target.batch(statements);
      };
    },
  }) as unknown as D1Database;
  return { db, reached: reached.promise, release: release.resolve };
}

function mapTapBackfill(playerId: string, reason: string) {
  return {
    player_id: playerId,
    game_key: "maptap" as const,
    game_date: "2026-10-19",
    external_puzzle_key: "2026-10-19",
    final_score: 820,
    rounds: [73, 99, 87, 78, 80].map((raw_score, index) => ({
      round_number: index + 1,
      raw_score,
      original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
    })),
    reason,
  };
}

describe("Phase 8 admin read models and transactions", () => {
  it("lists protected admin models without hashes, tokens, credentials, or raw captures", async () => {
    const playerId = await insertPlayer();
    const invite = `invite-secret-${crypto.randomUUID()}`;
    const tokenHash = `token-hash-${crypto.randomUUID()}`;
    const sessionHash = `session-hash-${crypto.randomUUID()}`;
    const credentialHash = `credential-hash-${crypto.randomUUID()}`;
    await env.DB.prepare(
      `INSERT INTO registration_invites(id, player_id, token_hash, expires_at, created_by)
       VALUES ('invite-1', ?, ?, '2026-10-25T00:00:00.000Z', ?)`,
    )
      .bind(playerId, tokenHash, admin)
      .run();
    await env.DB.prepare(
      `INSERT INTO device_credentials(id, player_id, credential_hash, label)
       VALUES ('device-1', ?, ?, 'iPhone')`,
    )
      .bind(playerId, credentialHash)
      .run();
    await env.DB.prepare(
      `INSERT INTO web_sessions(id, player_id, session_hash, source_device_id, idle_expires_at, absolute_expires_at, last_activity_at)
       VALUES ('session-1', ?, ?, 'device-1', '2026-10-30T00:00:00.000Z', '2026-11-01T00:00:00.000Z', '2026-10-24T00:00:00.000Z')`,
    )
      .bind(playerId, sessionHash)
      .run();
    await insertSubmission("maptap", playerId);

    const models = await Promise.all([
      listAdminPlayers(env),
      listAdminInvitations(env),
      listAdminDevices(env),
      listAdminSessions(env),
      listAdminSubmissions(env),
      listAdminAudits(env),
    ]);
    const serialized = JSON.stringify(models);
    expect(serialized).not.toContain(invite);
    expect(serialized).not.toContain(tokenHash);
    expect(serialized).not.toContain(sessionHash);
    expect(serialized).not.toContain(credentialHash);
    expect(serialized).not.toContain("raw capture");
    expect(serialized).not.toContain("answer-1");
    expect(models[0]).toEqual(expect.arrayContaining([expect.objectContaining({ id: playerId })]));
    expect(models[1]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "invite-1" })]),
    );
    expect(models[2]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "device-1" })]),
    );
    expect(models[3]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "session-1" })]),
    );
    expect(models[4]).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "submission-1" })]),
    );
  });

  it("rejects direct and middleware admin handler calls without a verified administrator", async () => {
    const request = new Request("https://wht.test/api/admin/audits", {
      headers: { Origin: "https://wht.test", "Content-Type": "application/json" },
    });
    const context = { request, env, data: { requestId: "direct-handler" } } as Parameters<
      PagesFunction<AppEnv, string, AppData>
    >[0];
    await expect(adminApi(context)).rejects.toMatchObject({ errorCode: "ADMIN_ACCESS_DENIED" });
    const pageContext = { request, env, data: { requestId: "direct-page" } } as Parameters<
      PagesFunction<AppEnv, string, AppData>
    >[0];
    await expect(adminPage(pageContext)).rejects.toMatchObject({
      errorCode: "ADMIN_ACCESS_DENIED",
    });
    const response = await invoke(
      "/api/admin/audits",
      { headers: { "Cf-Access-Jwt-Assertion": "forged" } },
      true,
    );
    expect(response.status).toBe(403);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(0);
  });

  it("dispatches every protected read model and rejects cross-origin material writes", async () => {
    await insertPlayer();
    await insertSubmission();
    for (const [path, key] of [
      ["/api/admin/dashboard", "players"],
      ["/api/admin/invitations", "invitations"],
      ["/api/admin/devices", "devices"],
      ["/api/admin/sessions", "sessions"],
      ["/api/admin/submissions", "submissions"],
      ["/api/admin/audits", "audits"],
    ] as const) {
      const response = await invoke(path);
      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toHaveProperty(key);
      if (path === "/api/admin/dashboard") {
        expect(body).toEqual(
          expect.objectContaining({
            players: expect.any(Array),
            invitations: expect.any(Array),
            devices: expect.any(Array),
            sessions: expect.any(Array),
            submissions: expect.any(Array),
            audits: expect.any(Array),
          }),
        );
      }
    }
    const foreign = await invoke("/api/admin/submissions/submission-1", {
      method: "PATCH",
      headers: { Origin: "https://attacker.test" },
      body: JSON.stringify({
        final_score: 821,
        rounds: [74, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
        })),
        reason: "Cross-origin attempt",
      }),
    });
    expect(foreign.status).toBe(403);
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      820,
    );
  });

  it("accepts protected correction, deletion, and historical backfill commands", async () => {
    await insertPlayer();
    await insertSubmission();
    const corrected = await invoke("/api/admin/submissions/submission-1", {
      method: "PATCH",
      body: JSON.stringify({
        final_score: 821,
        rounds: [74, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
        })),
        reason: "Correct the saved total",
      }),
    });
    expect(corrected.status).toBe(200);
    expect(
      ((await corrected.json()) as { submission: { final_score: number } }).submission.final_score,
    ).toBe(821);

    const deleted = await invoke("/api/admin/submissions/submission-1", {
      method: "DELETE",
      body: JSON.stringify({ reason: "Remove the duplicate result" }),
    });
    expect(deleted.status).toBe(200);

    const backfilled = await invoke("/api/admin/submissions/manual", {
      method: "POST",
      body: JSON.stringify({
        player_id: "player-1",
        game_key: "maptap",
        game_date: "2026-10-19",
        external_puzzle_key: "2026-10-19",
        final_score: 820,
        rounds: [73, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
          original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
        })),
        reason: "Restore a historical result",
      }),
    });
    expect(backfilled.status).toBe(201);
    expect(
      ((await backfilled.json()) as { submission: { source_kind: string } }).submission.source_kind,
    ).toBe("admin");
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(3);
  });

  it("requires bounded non-empty reasons before correction or deletion", async () => {
    await insertPlayer();
    await insertSubmission();
    for (const reason of ["", "   ", "x".repeat(501)]) {
      await expect(
        correctSubmission(
          env,
          "submission-1",
          {
            final_score: 821,
            rounds: [73, 99, 87, 78, 80].map((raw_score, index) => ({
              round_number: index + 1,
              raw_score,
            })),
            reason,
          },
          admin,
        ),
      ).rejects.toMatchObject({ errorCode: "INVALID_REASON" });
      await expect(deleteSubmission(env, "submission-1", reason, admin)).rejects.toMatchObject({
        errorCode: "INVALID_REASON",
      });
    }
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      820,
    );
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(0);
  });

  it("rejects invalid configured rounds and totals without changing the submission", async () => {
    await insertPlayer();
    await insertSubmission();
    const invalidRounds = [73, 99, 87, 78].map((raw_score, index) => ({
      round_number: index + 1,
      raw_score,
    }));
    await expect(
      correctSubmission(
        env,
        "submission-1",
        { final_score: 337, rounds: invalidRounds, reason: "Fix a mistaken result" },
        admin,
      ),
    ).rejects.toMatchObject({ errorCode: "INVALID_RESULT" });
    await expect(
      correctSubmission(
        env,
        "submission-1",
        {
          final_score: 821,
          rounds: [73, 99, 87, 78, 81].map((raw_score, index) => ({
            round_number: index + 1,
            raw_score,
          })),
          reason: "Fix a mistaken result",
        },
        admin,
      ),
    ).rejects.toMatchObject({ errorCode: "INVALID_RESULT" });
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      820,
    );
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(0);
  });

  it("corrects rounds and totals atomically, audits redacted before/after state, and updates boards", async () => {
    await insertPlayer();
    await insertSubmission();
    const beforeUpdated = await env.DB.prepare(
      "SELECT updated_at FROM submissions WHERE id = 'submission-1'",
    ).first("updated_at");
    const corrected = await correctSubmission(
      env,
      "submission-1",
      {
        final_score: 821,
        rounds: [74, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
          original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
        })),
        reason: "Correct the first round score",
      },
      admin,
    );
    expect(corrected).toMatchObject({ id: "submission-1", final_score: 821 });
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      821,
    );
    expect(
      await env.DB.prepare("SELECT raw_score FROM round_results WHERE round_number = 1").first(
        "raw_score",
      ),
    ).toBe(74);
    expect(
      await env.DB.prepare("SELECT updated_at FROM submissions WHERE id = 'submission-1'").first(
        "updated_at",
      ),
    ).not.toBe(beforeUpdated);
    const audit = await env.DB.prepare(
      "SELECT action, before_json, after_json, reason FROM admin_audit_log WHERE action = 'submission.correct'",
    ).first<{ action: string; before_json: string; after_json: string; reason: string }>();
    expect(audit).toMatchObject({
      action: "submission.correct",
      reason: "Correct the first round score",
    });
    expect(JSON.parse(audit!.before_json)).toMatchObject({
      submission: { final_score: 820 },
      rounds: expect.any(Array),
    });
    expect(JSON.parse(audit!.after_json)).toMatchObject({
      submission: { final_score: 821 },
      rounds: expect.any(Array),
    });
    expect(audit!.before_json).not.toContain("credential_hash");
    expect(audit!.before_json).not.toContain("session_hash");
    const board = await readAllTimeLeaderboard(env, "2026-10-20");
    expect(board.games.find((game) => game.key === "maptap")?.players[0].total).toBe(821);
  });

  it("lists Krillion prompts for correction and persists edited prompts without auditing protected text", async () => {
    await insertPlayer();
    await insertSubmission("krillion", "player-1", "krillion-correction", "2026-10-21");
    const listed = await listAdminSubmissions(env);
    expect(listed[0].rounds[0]).toMatchObject({
      id: "krillion-correction-round-1",
      prompt: "NAME 1",
    });
    expect(listed[0].rounds[0]).not.toHaveProperty("answer");

    await correctSubmission(
      env,
      "krillion-correction",
      {
        final_score: 300,
        rounds: [100, 85, 60, 30, 15, 10, 0].map((raw_score, index) => ({
          round_number: index + 1,
          prompt: `UPDATED NAME ${index + 1}`,
          raw_score,
        })),
        reason: "Correct Krillion prompts",
      },
      admin,
    );
    const saved = await env.DB.prepare(
      "SELECT prompt, answer FROM round_results WHERE submission_id = 'krillion-correction' AND round_number = 1",
    ).first<{ prompt: string; answer: string }>();
    expect(saved).toMatchObject({ prompt: "UPDATED NAME 1", answer: "answer-1" });
    const audit = await env.DB.prepare(
      "SELECT after_json FROM admin_audit_log WHERE action = 'submission.correct'",
    ).first<{ after_json: string }>();
    expect(audit!.after_json).not.toContain("UPDATED NAME 1");
    expect(JSON.parse(audit!.after_json)).toMatchObject({
      submission: { final_score: 300 },
      rounds: expect.any(Array),
    });
  });

  it("rolls back normalized replacement when the audit append fails", async () => {
    await insertPlayer();
    await insertSubmission();
    await env.DB.prepare(
      "CREATE TRIGGER force_admin_audit_failure BEFORE INSERT ON admin_audit_log BEGIN SELECT RAISE(ABORT, 'test audit failure'); END",
    ).run();
    try {
      await expect(
        correctSubmission(
          env,
          "submission-1",
          {
            final_score: 821,
            rounds: [74, 99, 87, 78, 80].map((raw_score, index) => ({
              round_number: index + 1,
              raw_score,
            })),
            reason: "This should roll back",
          },
          admin,
        ),
      ).rejects.toThrow();
      expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
        820,
      );
      expect(
        await env.DB.prepare("SELECT raw_score FROM round_results WHERE round_number = 1").first(
          "raw_score",
        ),
      ).toBe(73);
      expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER force_admin_audit_failure").run();
    }
  });

  it("deletes with a full redacted before-state in the same transaction and leaves derived boards empty", async () => {
    await insertPlayer();
    await insertSubmission("krillion", "player-1", "krillion-submission", "2026-10-21");
    const original = await env.DB.prepare("SELECT * FROM admin_audit_log").all();
    await deleteSubmission(env, "krillion-submission", "Remove an invalid duplicate", admin);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM submissions").first("n")).toBe(0);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM round_results").first("n")).toBe(0);
    const audit = await env.DB.prepare(
      "SELECT action, before_json, after_json, reason FROM admin_audit_log ORDER BY created_at DESC LIMIT 1",
    ).first<{ action: string; before_json: string; after_json: string | null; reason: string }>();
    expect(audit).toMatchObject({
      action: "submission.delete",
      after_json: null,
      reason: "Remove an invalid duplicate",
    });
    const before = JSON.parse(audit!.before_json) as {
      submission: Record<string, unknown>;
      rounds: unknown[];
    };
    expect(before.submission).toMatchObject({
      id: "krillion-submission",
      final_score: 300,
      source_kind: "shared_text",
    });
    expect(before.rounds).toHaveLength(7);
    expect(before.rounds[0]).toMatchObject({
      id: "krillion-submission-round-1",
      round_number: 1,
      raw_score: 100,
    });
    expect(before.rounds[0]).not.toHaveProperty("prompt");
    expect(before.rounds[0]).not.toHaveProperty("answer");
    expect(audit!.before_json).not.toContain("answer-1");
    expect(audit!.before_json).not.toContain("credential_hash");
    expect(audit!.before_json).not.toContain("session_hash");
    expect((await env.DB.prepare("SELECT * FROM admin_audit_log").all()).results.length).toBe(
      original.results.length + 1,
    );
    const board = await readAllTimeLeaderboard(env, "2026-10-21");
    expect(board.games.find((game) => game.key === "krillion")?.players[0].games_played).toBe(0);
  });

  it("rejects a stale delete after a correction commits and preserves the committed audit state", async () => {
    await insertPlayer();
    await insertSubmission();
    const gate = gatedSubmissionBatch();
    const deleting = deleteSubmission(
      { ...env, DB: gate.db },
      "submission-1",
      "Remove the stale result",
      admin,
    );
    await gate.reached;
    await correctSubmission(
      env,
      "submission-1",
      {
        final_score: 821,
        rounds: [74, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
        })),
        reason: "Correct the saved result",
      },
      admin,
    );
    gate.release(undefined);
    await expect(deleting).rejects.toMatchObject({ errorCode: "SUBMISSION_CONFLICT" });
    expect(await env.DB.prepare("SELECT final_score FROM submissions").first("final_score")).toBe(
      821,
    );
    const audits = await env.DB.prepare(
      "SELECT action, before_json, after_json FROM admin_audit_log ORDER BY created_at, id",
    ).all<{ action: string; before_json: string; after_json: string }>();
    expect(audits.results).toHaveLength(1);
    expect(audits.results[0].action).toBe("submission.correct");
    expect(JSON.parse(audits.results[0].before_json)).toMatchObject({
      submission: { final_score: 820 },
    });
    expect(JSON.parse(audits.results[0].after_json)).toMatchObject({
      submission: { final_score: 821 },
    });
  });

  it("coalesces concurrent backfills for different players onto one canonical game day", async () => {
    await insertPlayer("player-1", "Alex");
    await insertPlayer("player-2", "Blair");
    const results = await Promise.all([
      backfillSubmission(env, mapTapBackfill("player-1", "Restore Alex history"), admin),
      backfillSubmission(env, mapTapBackfill("player-2", "Restore Blair history"), admin),
    ]);
    expect(results).toHaveLength(2);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM game_days").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM submissions").first("n")).toBe(2);
  });

  it("audits the canonical game-day ID when another creator wins before the backfill batch", async () => {
    await insertPlayer();
    const gate = gatedSubmissionBatch();
    const backfill = backfillSubmission(
      { ...env, DB: gate.db },
      mapTapBackfill("player-1", "Restore the canonical history"),
      admin,
    );
    await gate.reached;
    await env.DB.prepare(
      "INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES ('race-winner', 'maptap', '2026-10-19', '2026-10-19')",
    ).run();
    gate.release(undefined);
    await backfill;

    const stored = await env.DB.prepare(
      "SELECT game_day_id FROM submissions WHERE player_id = 'player-1'",
    ).first<{ game_day_id: string }>();
    const audit = await env.DB.prepare(
      "SELECT after_json FROM admin_audit_log WHERE action = 'submission.backfill'",
    ).first<{ after_json: string }>();
    expect(stored?.game_day_id).toBe("race-winner");
    expect(JSON.parse(audit!.after_json)).toMatchObject({
      submission: {
        game_day_id: "race-winner",
        game_date: "2026-10-19",
        external_puzzle_key: "2026-10-19",
      },
    });
  });

  it("reports a concurrent same-player backfill as an explicit conflict", async () => {
    await insertPlayer();
    const results = await Promise.allSettled([
      backfillSubmission(env, mapTapBackfill("player-1", "Restore one history"), admin),
      backfillSubmission(env, mapTapBackfill("player-1", "Restore duplicate history"), admin),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: { statusCode: 409, errorCode: "SUBMISSION_EXISTS" },
    });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM game_days").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM submissions").first("n")).toBe(1);
  });

  it("maps an existing date and puzzle mismatch to a game-day conflict", async () => {
    await insertPlayer();
    await env.DB.prepare(
      "INSERT INTO game_days(id, game_id, game_date, external_puzzle_key) VALUES ('existing-day', 'maptap', '2026-10-19', 'different-puzzle')",
    ).run();
    await expect(
      backfillSubmission(env, mapTapBackfill("player-1", "Try a conflicting history"), admin),
    ).rejects.toMatchObject({ statusCode: 409, errorCode: "GAME_DAY_CONFLICT" });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM submissions").first("n")).toBe(0);
  });

  it("backfills an explicit Pacific date as an admin submission and updates derived totals", async () => {
    await insertPlayer();
    const result = await backfillSubmission(
      env,
      {
        player_id: "player-1",
        game_key: "maptap",
        game_date: "2026-10-19",
        external_puzzle_key: "2026-10-19",
        final_score: 820,
        rounds: [73, 99, 87, 78, 80].map((raw_score, index) => ({
          round_number: index + 1,
          raw_score,
          original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
        })),
        reason: "Restore a missed historical result",
      },
      admin,
    );
    expect(result).toMatchObject({
      source_kind: "admin",
      game_date: "2026-10-19",
      final_score: 820,
    });
    expect(await env.DB.prepare("SELECT source_kind FROM submissions").first("source_kind")).toBe(
      "admin",
    );
    expect(await env.DB.prepare("SELECT game_date FROM game_days").first("game_date")).toBe(
      "2026-10-19",
    );
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(1);
    const board = await readAllTimeLeaderboard(env, "2026-10-19");
    expect(board.games.find((game) => game.key === "maptap")?.players[0].total).toBe(820);
  });
});
