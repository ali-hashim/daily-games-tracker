import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { deviceLoginRequest } from "../../functions/_lib/device-login";
import {
  createInvite,
  createPlayer,
  redeemInvite,
  revokeDevice,
  updatePlayer,
} from "../../functions/_lib/onboarding";
import {
  authenticateSession,
  refreshSession,
  sessionCookie,
  SESSION_ABSOLUTE_MS,
} from "../../functions/_lib/sessions";
import { hashToken, randomToken } from "../../functions/_lib/tokens";
import type { AppEnv } from "../../functions/_lib/runtime";
import { onRequest as middleware } from "../../functions/_middleware";
import { onRequest as startApi } from "../../functions/api/auth/device/start";
import { onRequest as approveApi } from "../../functions/api/auth/device/approve";
import { onRequest as completeApi } from "../../functions/api/auth/device/complete";

let runtime: Miniflare;
let env: AppEnv;
const origin = "https://wht.test";
beforeAll(async () => {
  runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: "export default {fetch(){return new Response('test')}}",
      compatibilityDate: "2026-10-20",
      d1Databases: ["DB"],
    }),
  );
  env = { DB: (await runtime.getD1Database("DB")) as unknown as D1Database };
  const directory = new URL("../../migrations/", import.meta.url);
  for (const file of readdirSync(directory)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    for (const sql of readFileSync(new URL(file, directory), "utf8")
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean))
      await env.DB.prepare(sql).run();
  }
}, 30_000);
beforeEach(async () => {
  for (const table of [
    "login_challenges",
    "admin_audit_log",
    "web_sessions",
    "device_credentials",
    "registration_invites",
    "players",
  ])
    await env.DB.prepare(`DELETE FROM ${table}`).run();
});
afterAll(async () => {
  await runtime?.dispose();
});

async function registered(name = "Alex") {
  const player = await createPlayer(env, name, "admin@example.test");
  const invite = await createInvite(env, player.id, "admin@example.test");
  return redeemInvite(env, invite.token, "test phone");
}
function request(mode: string, body = {}, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/auth/device/${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: JSON.stringify(body),
  });
}
async function start() {
  const response = await deviceLoginRequest(request("start"), env, "req_test", "start");
  const body = (await response.json()) as { shortcut_url: string; expires_at: string };
  const url = new URL(body.shortcut_url);
  const challenge = url.searchParams.get("text")!.slice("DGT_LOGIN_V1:".length);
  return { response, body, challenge, cookie: response.headers.get("Set-Cookie")!.split(";")[0] };
}
function approve(challenge: string, code: string) {
  return deviceLoginRequest(
    request("approve", { challenge }, { Authorization: `Device ${code}` }),
    env,
    "req_test",
    "approve",
  );
}
function complete(cookie: string) {
  return deviceLoginRequest(
    request("complete", {}, { Cookie: cookie }),
    env,
    "req_test",
    "complete",
  );
}
function sessionRequest(cookie: string) {
  return new Request(`${origin}/api/auth/me`, { headers: { Cookie: cookie } });
}

describe("browser-bound device login", () => {
  it("keeps both secrets hashed, configures the named Shortcut and two-minute secure flow cookie", async () => {
    const flow = await start();
    const url = new URL(flow.body.shortcut_url);
    expect(url.protocol).toBe("shortcuts:");
    expect(url.searchParams.get("name")).toBe("Upload to WHT");
    expect(url.searchParams.get("input")).toBe("text");
    expect(url.searchParams.get("text")).toBe(`DGT_LOGIN_V1:${flow.challenge}`);
    expect(flow.response.headers.get("Set-Cookie")).toContain(
      "Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=120",
    );
    expect(Date.parse(flow.body.expires_at) - Date.now()).toBeGreaterThan(118_000);
    expect(Date.parse(flow.body.expires_at) - Date.now()).toBeLessThanOrEqual(120_000);
    const stored = JSON.stringify(
      (await env.DB.prepare("SELECT * FROM login_challenges").all()).results,
    );
    expect(stored).not.toContain(flow.challenge);
    expect(stored).not.toContain(flow.cookie.split("=")[1]);
    expect(stored).toContain(await hashToken(flow.challenge));
    expect((await complete(flow.cookie)).status).toBe(202);
  });

  it("issues exactly one hashed session only to the initiating browser and blocks replay", async () => {
    const device = await registered();
    const flow = await start();
    const approval = await approve(flow.challenge, device.device_code);
    expect(approval.headers.get("Set-Cookie")).toBeNull();
    expect(await approval.json()).toMatchObject({
      status: "approved",
      return_url: `${origin}/login`,
    });
    await expect(approve(flow.challenge, device.device_code)).rejects.toMatchObject({
      errorCode: "LOGIN_UNAVAILABLE",
    });
    for (const cookie of ["", `dgt_login_flow=${randomToken()}`, `${flow.cookie}; ${flow.cookie}`])
      await expect(complete(cookie)).rejects.toMatchObject({ errorCode: "LOGIN_UNAVAILABLE" });
    const response = await complete(flow.cookie);
    expect(await response.json()).toMatchObject({ status: "authenticated" });
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith("dgt_session="))!;
    expect(session).toContain("Secure; HttpOnly; SameSite=Lax; Max-Age=34560000");
    expect(cookies.find((c) => c.startsWith("dgt_login_flow="))).toContain("Max-Age=0");
    const identity = await authenticateSession(sessionRequest(session.split(";")[0]), env);
    expect(identity.player_id).toBe(device.player.id);
    const row = await env.DB.prepare("SELECT * FROM web_sessions WHERE id = ?")
      .bind(identity.id)
      .first();
    expect(row!.session_hash).toBe(await hashToken(identity.token));
    expect(JSON.stringify(row)).not.toContain(identity.token);
    await expect(complete(flow.cookie)).rejects.toMatchObject({ errorCode: "LOGIN_UNAVAILABLE" });
    await revokeDevice(env, device.device_id, "admin@example.test");
    await expect(
      authenticateSession(sessionRequest(session.split(";")[0]), env),
    ).rejects.toMatchObject({ errorCode: "SESSION_REQUIRED" });
  });

  it("allows only one concurrent approval, even from different players, and one completion", async () => {
    const a = await registered("Alex");
    const b = await registered("Blair");
    const flow = await start();
    const approvals = await Promise.allSettled([
      approve(flow.challenge, a.device_code),
      approve(flow.challenge, b.device_code),
    ]);
    expect(approvals.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const completions = await Promise.allSettled([complete(flow.cookie), complete(flow.cookie)]);
    expect(completions.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await env.DB.prepare("SELECT count(*) FROM web_sessions").first("count(*)")).toBe(3);
  });

  it("rolls session creation and consumption back together", async () => {
    const device = await registered();
    const flow = await start();
    await approve(flow.challenge, device.device_code);
    await env.DB.prepare(
      "CREATE TRIGGER fail_login BEFORE INSERT ON web_sessions BEGIN SELECT RAISE(ABORT, 'test'); END",
    ).run();
    try {
      await expect(complete(flow.cookie)).rejects.toThrow();
      expect(
        await env.DB.prepare("SELECT consumed_at FROM login_challenges").first("consumed_at"),
      ).toBeNull();
    } finally {
      await env.DB.prepare("DROP TRIGGER fail_login").run();
    }
    expect((await complete(flow.cookie)).status).toBe(200);
  });

  it("rejects expiry before approval and completion, and revoked/deactivated approval identities", async () => {
    const device = await registered();
    const flow = await start();
    await env.DB.prepare("UPDATE login_challenges SET expires_at = ?")
      .bind(new Date(Date.now() - 1).toISOString())
      .run();
    await expect(approve(flow.challenge, device.device_code)).rejects.toMatchObject({
      errorCode: "LOGIN_UNAVAILABLE",
    });
    await expect(complete(flow.cookie)).rejects.toMatchObject({ errorCode: "LOGIN_UNAVAILABLE" });
    const expiredApproval = await start();
    await approve(expiredApproval.challenge, device.device_code);
    await env.DB.prepare("UPDATE login_challenges SET expires_at = ?")
      .bind(new Date(Date.now() - 1).toISOString())
      .run();
    await expect(complete(expiredApproval.cookie)).rejects.toMatchObject({
      errorCode: "LOGIN_UNAVAILABLE",
    });
    const revoked = await start();
    await approve(revoked.challenge, device.device_code);
    await revokeDevice(env, device.device_id, "admin@example.test");
    await expect(complete(revoked.cookie)).rejects.toMatchObject({
      errorCode: "LOGIN_UNAVAILABLE",
    });
    await expect(approve(revoked.challenge, device.device_code)).rejects.toMatchObject({
      errorCode: "DEVICE_UNAUTHORIZED",
    });
    const other = await registered("Blair");
    const deactivated = await start();
    await approve(deactivated.challenge, other.device_code);
    await updatePlayer(env, other.player.id, { active: false }, "admin@example.test");
    await expect(complete(deactivated.cookie)).rejects.toMatchObject({
      errorCode: "LOGIN_UNAVAILABLE",
    });
  });

  it("caps renewal at the original absolute expiry and rejects stale identities after revocation", async () => {
    const device = await registered();
    const identity = await authenticateSession(
      sessionRequest(`dgt_session=${device.sessionToken}`),
      env,
    );
    const expires = new Date(Date.now() + 60_000).toISOString();
    await env.DB.prepare(
      "UPDATE web_sessions SET absolute_expires_at = ?, idle_expires_at = ? WHERE id = ?",
    )
      .bind(expires, expires, identity.id)
      .run();
    identity.absolute_expires_at = expires;
    await refreshSession(env, identity);
    expect(
      await env.DB.prepare("SELECT idle_expires_at FROM web_sessions WHERE id = ?")
        .bind(identity.id)
        .first("idle_expires_at"),
    ).toBe(expires);
    expect(sessionCookie(identity.token, expires)).toMatch(/Max-Age=\d{1,2}$/);
    expect(SESSION_ABSOLUTE_MS).toBe(400 * 86_400_000);
    await revokeDevice(env, device.device_id, "admin@example.test");
    await expect(refreshSession(env, identity)).rejects.toMatchObject({
      errorCode: "SESSION_REQUIRED",
    });
  });

  it("enforces method, origin, body, and device authentication through routed middleware", async () => {
    async function invoke(handler: typeof startApi, req: Request) {
      const context = { request: req, env, data: { requestId: "" } } as Parameters<
        typeof middleware
      >[0];
      context.next = async () => handler(context);
      return middleware(context);
    }
    expect(
      (await invoke(startApi, request("start", {}, { Origin: "https://evil.test" }))).status,
    ).toBe(403);
    expect(
      (await invoke(completeApi, request("complete", {}, { Origin: "https://evil.test" }))).status,
    ).toBe(403);
    expect(
      (await invoke(startApi, request("start", {}, { "Sec-Fetch-Site": "cross-site" }))).status,
    ).toBe(403);
    expect((await invoke(startApi, new Request(`${origin}/api/auth/device/start`))).status).toBe(
      405,
    );
    expect(
      (await invoke(approveApi, request("approve", { challenge: randomToken() }))).status,
    ).toBe(401);
    const device = await registered();
    expect(
      (
        await invoke(
          approveApi,
          request(
            "approve",
            { challenge: "bad" },
            { Authorization: `Device ${device.device_code}` },
          ),
        )
      ).status,
    ).toBe(400);
    expect(
      (await invoke(startApi, request("start", { return_url: "https://evil.test" }))).status,
    ).toBe(400);
    const response = await invoke(startApi, request("start"));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.status).toBe(201);
  });
});
