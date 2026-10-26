import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { authenticateDevice, touchDevice } from "../../functions/_lib/devices";
import {
  createInvite,
  createPlayer,
  getInvite,
  redeemInvite,
  revokeDevice,
  updatePlayer,
} from "../../functions/_lib/onboarding";
import type { AppEnv } from "../../functions/_lib/runtime";
import { onRequest as middleware } from "../../functions/_middleware";
import { onRequest as adminApi } from "../../functions/api/admin/[[path]]";
import { onRequest as redeemApi } from "../../functions/api/register/[inviteToken]/redeem";
import { onRequest as meApi } from "../../functions/api/auth/me";
import { onRequest as logoutApi } from "../../functions/api/auth/logout";
import type { AppData } from "../../functions/_lib/runtime";
import { authenticateSession, refreshSession, sessionCookie } from "../../functions/_lib/sessions";

let runtime: Miniflare;
let env: AppEnv;
const admin = "admin@example.test";

beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default { fetch() { return new Response('test'); } };",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = { DB: (await runtime.getD1Database("DB")) as unknown as D1Database };
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
}, 30_000);

beforeEach(async () => {
  for (const table of [
    "admin_audit_log",
    "web_sessions",
    "device_credentials",
    "registration_invites",
    "players",
  ]) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
});

afterAll(async () => {
  await runtime?.dispose();
});

async function registered(name = "Alex") {
  const player = await createPlayer(env, name, admin);
  const invite = await createInvite(env, player.id, admin);
  const result = await redeemInvite(env, invite.token, "iPhone");
  return { ...result, invite };
}

function deviceRequest(code: string) {
  return new Request("https://wht.test/api/auth/device/status", {
    headers: { Authorization: `Device ${code}` },
  });
}
function sessionRequest(token: string) {
  return new Request("https://wht.test/api/auth/me", {
    headers: { Cookie: `dgt_session=${token}` },
  });
}

describe("D1 player and invitation onboarding", () => {
  it("creates an audited player and enforces case-insensitive active names", async () => {
    await createPlayer(env, "Alex", admin);
    await expect(createPlayer(env, "alex", admin)).rejects.toMatchObject({
      errorCode: "PLAYER_NAME_EXISTS",
    });
    expect(await env.DB.prepare("SELECT count(*) AS n FROM players").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM admin_audit_log").first("n")).toBe(1);
  });

  it("creates 24-hour one-use invites and stores only credential, invite, and session hashes", async () => {
    const result = await registered();
    expect(result.device_code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.sessionToken).not.toBe(result.device_code);
    expect(Date.parse(result.invite.expires_at) - Date.now()).toBeGreaterThan(86_390_000);
    const tables = [
      "registration_invites",
      "device_credentials",
      "web_sessions",
      "admin_audit_log",
    ];
    for (const table of tables) {
      const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const persisted = JSON.stringify(rows.results);
      for (const secret of [result.device_code, result.sessionToken, result.invite.token])
        expect(persisted).not.toContain(secret);
    }
    await expect(getInvite(env, result.invite.token)).rejects.toMatchObject({
      errorCode: "INVITE_UNAVAILABLE",
    });
    await expect(redeemInvite(env, result.invite.token, null)).rejects.toMatchObject({
      errorCode: "INVITE_UNAVAILABLE",
    });
  });

  it("permits exactly one winner when two clients redeem the same invite concurrently", async () => {
    const player = await createPlayer(env, "Alex", admin);
    const invite = await createInvite(env, player.id, admin);
    const attempts = await Promise.allSettled([
      redeemInvite(env, invite.token, "A"),
      redeemInvite(env, invite.token, "B"),
    ]);
    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM device_credentials").first("n")).toBe(1);
    expect(await env.DB.prepare("SELECT count(*) AS n FROM web_sessions").first("n")).toBe(1);
  });

  it("rejects expired and malformed invitations without creating devices", async () => {
    const player = await createPlayer(env, "Alex", admin);
    const invite = await createInvite(env, player.id, admin);
    await env.DB.prepare("UPDATE registration_invites SET expires_at = ?")
      .bind(new Date(Date.now() - 1_000).toISOString())
      .run();
    for (const token of [invite.token, "not-a-token"]) {
      await expect(redeemInvite(env, token, null)).rejects.toMatchObject({
        errorCode: "INVITE_UNAVAILABLE",
      });
    }
    expect(await env.DB.prepare("SELECT count(*) AS n FROM device_credentials").first("n")).toBe(0);
  });

  it("rolls back the device and invitation consumption if session creation fails", async () => {
    const player = await createPlayer(env, "Alex", admin);
    const invite = await createInvite(env, player.id, admin);
    await env.DB.prepare(
      "CREATE TRIGGER force_session_failure BEFORE INSERT ON web_sessions BEGIN SELECT RAISE(ABORT, 'test session failure'); END",
    ).run();
    try {
      await expect(redeemInvite(env, invite.token, null)).rejects.toThrow();
      expect(await env.DB.prepare("SELECT count(*) AS n FROM device_credentials").first("n")).toBe(
        0,
      );
      await expect(getInvite(env, invite.token)).resolves.toMatchObject({ player_id: player.id });
    } finally {
      await env.DB.prepare("DROP TRIGGER force_session_failure").run();
    }
  });

  it("revokes only the chosen device and its sessions immediately", async () => {
    const first = await registered();
    const invite = await createInvite(env, first.player.id, admin);
    const second = await redeemInvite(env, invite.token, "second device");
    const device = await authenticateDevice(deviceRequest(first.device_code), env);
    await touchDevice(env, device.id);
    expect(
      await env.DB.prepare("SELECT last_used_at FROM device_credentials WHERE id = ?")
        .bind(device.id)
        .first("last_used_at"),
    ).not.toBeNull();
    await revokeDevice(env, first.device_id, admin);
    await expect(authenticateDevice(deviceRequest(first.device_code), env)).rejects.toMatchObject({
      errorCode: "DEVICE_UNAUTHORIZED",
    });
    await expect(
      authenticateSession(sessionRequest(first.sessionToken), env),
    ).rejects.toMatchObject({ errorCode: "SESSION_REQUIRED" });
    await expect(authenticateDevice(deviceRequest(second.device_code), env)).resolves.toMatchObject(
      { player_id: first.player.id },
    );
    await expect(
      authenticateSession(sessionRequest(second.sessionToken), env),
    ).resolves.toMatchObject({ player_id: first.player.id });
  });

  it("deactivation invalidates devices, sessions and invites; reactivation restores none", async () => {
    const result = await registered();
    const pending = await createInvite(env, result.player.id, admin);
    await updatePlayer(env, result.player.id, { active: false }, admin);
    await expect(authenticateDevice(deviceRequest(result.device_code), env)).rejects.toMatchObject({
      errorCode: "DEVICE_UNAUTHORIZED",
    });
    await expect(
      authenticateSession(sessionRequest(result.sessionToken), env),
    ).rejects.toMatchObject({ errorCode: "SESSION_REQUIRED" });
    await updatePlayer(env, result.player.id, { active: true }, admin);
    await expect(authenticateDevice(deviceRequest(result.device_code), env)).rejects.toMatchObject({
      errorCode: "DEVICE_UNAUTHORIZED",
    });
    await expect(getInvite(env, pending.token)).rejects.toMatchObject({
      errorCode: "INVITE_UNAVAILABLE",
    });
  });

  it("creates secure cookies and never refreshes an expired or revoked session", async () => {
    const result = await registered();
    const cookie = sessionCookie(result.sessionToken, result.absoluteExpiry);
    expect(cookie).toMatch(/; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=345[0-9]+/);
    const session = await authenticateSession(sessionRequest(result.sessionToken), env);
    await refreshSession(env, session);
    await env.DB.prepare("UPDATE web_sessions SET idle_expires_at = ?")
      .bind(new Date(Date.now() - 1_000).toISOString())
      .run();
    await expect(refreshSession(env, session)).rejects.toMatchObject({
      errorCode: "SESSION_REQUIRED",
    });
    await expect(
      authenticateSession(sessionRequest(result.sessionToken), env),
    ).rejects.toMatchObject({ errorCode: "SESSION_REQUIRED" });
  });

  it("enforces cookie, origin, replay, and logout policies through actual API handlers", async () => {
    const player = await createPlayer(env, "Alex", admin);
    const invite = await createInvite(env, player.id, admin);
    const redeemPath = `/api/register/${invite.token}/redeem`;
    const foreign = await invoke(
      redeemApi as Handler,
      redeemPath,
      { method: "POST", headers: { Origin: "https://attacker.test" }, body: "{}" },
      { inviteToken: invite.token },
    );
    expect(foreign.status).toBe(403);
    const response = await invoke(
      redeemApi as Handler,
      redeemPath,
      { method: "POST", body: JSON.stringify({ label: "phone" }) },
      { inviteToken: invite.token },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    const body = (await response.json()) as { device_code: string; sessionToken?: string };
    expect(body.device_code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.sessionToken).toBeUndefined();
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("Secure; HttpOnly; SameSite=Lax");
    const retry = await invoke(
      redeemApi as Handler,
      redeemPath,
      { method: "POST", body: "{}" },
      { inviteToken: invite.token },
    );
    expect(retry.status).toBe(410);
    const me = await invoke(meApi, "/api/auth/me", { headers: { Cookie: cookie.split(";")[0] } });
    expect(me.status).toBe(200);
    const logout = await invoke(logoutApi, "/api/auth/logout", {
      method: "POST",
      headers: { Cookie: cookie.split(";")[0] },
    });
    expect(logout.status).toBe(200);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(
      (await invoke(meApi, "/api/auth/me", { headers: { Cookie: cookie.split(";")[0] } })).status,
    ).toBe(401);
  });

  it("requires a signed Access identity for admin mutations and rejects cross-origin writes", async () => {
    const pair = await generateKeyPair("RS256");
    const issuer = "https://integration.test.invalid";
    const jwks = {
      keys: [{ ...(await exportJWK(pair.publicKey)), kid: "integration", alg: "RS256" }],
    };
    const fetchStub = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      expect(String(input)).toBe(`${issuer}/cdn-cgi/access/certs`);
      return Response.json(jwks);
    });
    const savedEnv = env;
    env = {
      ...env,
      APP_ENV: "test",
      CLOUDFLARE_ACCESS_DOMAIN: issuer,
      CLOUDFLARE_ACCESS_AUD: "integration-admin",
      ADMIN_EMAIL: admin,
    };
    try {
      const jwt = await new SignJWT({ email: admin })
        .setProtectedHeader({ alg: "RS256", kid: "integration" })
        .setSubject("integration-admin")
        .setIssuer(issuer)
        .setAudience("integration-admin")
        .setIssuedAt()
        .setExpirationTime("10m")
        .sign(pair.privateKey);
      expect(
        (
          await invoke(adminApi, "/api/admin/players", {
            method: "POST",
            body: JSON.stringify({ display_name: "Alex" }),
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await invoke(adminApi, "/api/admin/players", {
            method: "POST",
            headers: { Authorization: `Device ${"a".repeat(43)}` },
            body: "{}",
          })
        ).status,
      ).toBe(403);
      const foreign = await invoke(adminApi, "/api/admin/players", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": jwt, Origin: "https://attacker.test" },
        body: JSON.stringify({ display_name: "Alex" }),
      });
      expect(foreign.status).toBe(403);
      expect(await env.DB.prepare("SELECT count(*) AS n FROM players").first("n")).toBe(0);
      const created = await invoke(adminApi, "/api/admin/players", {
        method: "POST",
        headers: { "Cf-Access-Jwt-Assertion": jwt },
        body: JSON.stringify({ display_name: "Alex" }),
      });
      expect(created.status).toBe(201);
      expect(created.headers.get("Cache-Control")).toBe("no-store");
      expect(await env.DB.prepare("SELECT count(*) AS n FROM players").first("n")).toBe(1);
    } finally {
      env = savedEnv;
      fetchStub.mockRestore();
    }
  });
});

type Handler = PagesFunction<AppEnv, string, AppData>;

async function invoke(
  handler: Handler,
  path: string,
  init: RequestInit = {},
  params: Record<string, string> = {},
) {
  const request = new Request(`https://wht.test${path}`, {
    ...init,
    headers: { Origin: "https://wht.test", "Content-Type": "application/json", ...init.headers },
  });
  const context = { request, env, data: { requestId: "" }, params } as Parameters<Handler>[0];
  context.next = async () => handler(context);
  return middleware(context);
}
