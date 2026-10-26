import { authenticateDevice } from "./devices";
import { ApiError, apiJson, readJsonBody, requireMethod } from "./http";
import type { AppEnv } from "./runtime";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS, sessionCookie } from "./sessions";
import { hashToken, invalid, isToken, objectBody, randomToken, requireSameOrigin } from "./tokens";

export const LOGIN_TTL_MS = 120_000;
const FLOW_COOKIE = "dgt_login_flow";
const SHORTCUT_NAME = "Upload To WHT";
const DEFAULT_RETURN_URL = "/user";
const DAILY_RETURN_PATH = /^\/daily\/\d{4}-\d{2}-\d{2}$/;
const clearFlow = `${FLOW_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;

function shortcutLaunchUrl(challenge: string): string {
  // Shortcuts on iOS treats '+' in the name query value literally. Use the
  // exact installed name and percent-encode spaces instead of URLSearchParams,
  // whose form encoding emits '+'.
  return `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(`DGT_LOGIN_V1:${challenge}`)}`;
}

function unavailable() {
  return new ApiError(
    410,
    "LOGIN_UNAVAILABLE",
    "This login expired or was already used. Start Login with Device again.",
  );
}

function validCalendarDay(value: string): boolean {
  const date = new Date(`${value.slice("/daily/".length)}T12:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value.slice("/daily/".length)
  );
}

function normalizeReturnUrl(value: unknown, requestUrl: string): string {
  if (typeof value !== "string" || !value) return DEFAULT_RETURN_URL;

  let parsed: URL;
  try {
    parsed = new URL(value, requestUrl);
  } catch {
    return DEFAULT_RETURN_URL;
  }
  if (parsed.origin !== new URL(requestUrl).origin || parsed.search || parsed.hash) {
    return DEFAULT_RETURN_URL;
  }

  if (parsed.pathname === DEFAULT_RETURN_URL) return DEFAULT_RETURN_URL;
  if (DAILY_RETURN_PATH.test(parsed.pathname) && validCalendarDay(parsed.pathname)) {
    return parsed.pathname;
  }
  return DEFAULT_RETURN_URL;
}

function flowToken(request: Request): string {
  const matches = (request.headers.get("Cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${FLOW_COOKIE}=`));
  const token = matches.length === 1 ? matches[0].slice(FLOW_COOKIE.length + 1) : "";
  if (!isToken(token)) throw unavailable();
  return token;
}

export async function deviceLoginRequest(
  request: Request,
  env: AppEnv,
  requestId: string,
  mode: "start" | "approve" | "complete",
): Promise<Response> {
  requireMethod(request, ["POST"]);
  if (mode !== "approve") requireSameOrigin(request);
  const device = mode === "approve" ? await authenticateDevice(request, env) : null;
  const body = objectBody(
    await readJsonBody(request, 2048),
    mode === "approve" ? ["challenge"] : mode === "start" ? ["return_url"] : [],
  );
  const now = new Date();
  const stamp = now.toISOString();

  if (mode === "start") {
    const challenge = randomToken();
    const flow = randomToken();
    const expires = new Date(now.getTime() + LOGIN_TTL_MS).toISOString();
    const returnUrl = normalizeReturnUrl(body.return_url, request.url);
    await env.DB.prepare(
      `INSERT INTO login_challenges
      (id, challenge_hash, browser_flow_hash, return_url, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        await hashToken(challenge),
        await hashToken(flow),
        returnUrl,
        expires,
        stamp,
      )
      .run();
    return apiJson(
      requestId,
      { status: "pending", shortcut_url: shortcutLaunchUrl(challenge), expires_at: expires },
      {
        status: 201,
        headers: {
          "Set-Cookie": `${FLOW_COOKIE}=${flow}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=120`,
        },
      },
    );
  }

  if (mode === "approve" && device) {
    if (!isToken(body.challenge)) throw invalid();
    const challengeHash = await hashToken(body.challenge);
    const results = await env.DB.batch([
      env.DB.prepare(
        `UPDATE login_challenges SET approved_player_id = ?, approved_device_id = ?
        WHERE challenge_hash = ? AND approved_player_id IS NULL AND approved_device_id IS NULL
        AND consumed_at IS NULL AND expires_at > ?
        AND EXISTS (SELECT 1 FROM device_credentials d JOIN players p ON p.id = d.player_id
          WHERE d.id = ? AND d.player_id = ? AND d.revoked_at IS NULL AND p.active = 1)`,
      ).bind(device.player_id, device.id, challengeHash, stamp, device.id, device.player_id),
      env.DB.prepare(
        `UPDATE device_credentials SET last_used_at = ? WHERE id = ? AND changes() = 1 AND EXISTS
        (SELECT 1 FROM login_challenges WHERE challenge_hash = ? AND approved_device_id = ?
          AND consumed_at IS NULL AND expires_at > ?)`,
      ).bind(stamp, device.id, await hashToken(body.challenge), device.id, stamp),
    ]);
    if (results[0].meta.changes !== 1) throw unavailable();
    const challenge = await env.DB.prepare(
      "SELECT return_url FROM login_challenges WHERE challenge_hash = ?",
    )
      .bind(challengeHash)
      .first<{ return_url: string }>();
    // Return no flow cookie, challenge, identity, or reusable browser credential to Shortcuts.
    return apiJson(requestId, {
      status: "approved",
      return_url: new URL(challenge?.return_url ?? DEFAULT_RETURN_URL, request.url).href,
      message:
        "Login approved. Return to the Safari page or WHT Home Screen window where you started, then tap Check login.",
    });
  }

  const flowHash = await hashToken(flowToken(request));
  const token = randomToken();
  const sessionId = crypto.randomUUID();
  const absoluteExpiry = new Date(now.getTime() + SESSION_ABSOLUTE_MS).toISOString();
  const idleExpiry = new Date(now.getTime() + SESSION_IDLE_MS).toISOString();
  // D1 batch is a transaction: only an unconsumed approval can insert a session;
  // consumption is conditional on this attempt's unique session ID. A failed insert rolls back.
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO web_sessions
      (id, player_id, session_hash, source_device_id, idle_expires_at, absolute_expires_at, last_activity_at, created_at)
      SELECT ?, c.approved_player_id, ?, c.approved_device_id, ?, ?, ?, ?
      FROM login_challenges c JOIN players p ON p.id = c.approved_player_id
      JOIN device_credentials d ON d.id = c.approved_device_id AND d.player_id = p.id
      WHERE c.browser_flow_hash = ? AND c.consumed_at IS NULL AND c.expires_at > ?
        AND p.active = 1 AND d.revoked_at IS NULL`,
    ).bind(
      sessionId,
      await hashToken(token),
      idleExpiry,
      absoluteExpiry,
      stamp,
      stamp,
      flowHash,
      stamp,
    ),
    env.DB.prepare(
      `UPDATE login_challenges SET consumed_at = ? WHERE browser_flow_hash = ?
      AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM web_sessions WHERE id = ?)`,
    ).bind(stamp, flowHash, sessionId),
  ]);
  if (results[0].meta.changes !== 1) {
    const pending = await env.DB.prepare(
      `SELECT id FROM login_challenges WHERE browser_flow_hash = ?
      AND consumed_at IS NULL AND expires_at > ? AND approved_player_id IS NULL AND approved_device_id IS NULL`,
    )
      .bind(flowHash, stamp)
      .first();
    if (pending) return apiJson(requestId, { status: "pending" }, { status: 202 });
    throw unavailable();
  }
  const headers = new Headers();
  headers.append("Set-Cookie", sessionCookie(token, absoluteExpiry, now));
  headers.append("Set-Cookie", clearFlow);
  return apiJson(requestId, { status: "authenticated" }, { headers });
}
