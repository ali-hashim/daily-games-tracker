import { ApiError } from "./http";
import type { AppEnv } from "./runtime";
import { hashToken, isToken } from "./tokens";

export const DAY_MS = 86_400_000;
export const SESSION_IDLE_MS = 7 * DAY_MS;
export const SESSION_ABSOLUTE_MS = 400 * DAY_MS;

export function sessionCookie(token: string, absoluteExpiry: string, now = new Date()): string {
  const maxAge = Math.max(0, Math.floor((Date.parse(absoluteExpiry) - now.getTime()) / 1000));
  return `dgt_session=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export const CLEAR_SESSION_COOKIE =
  "dgt_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0";

export interface SessionIdentity {
  id: string;
  player_id: string;
  display_name: string;
  absolute_expires_at: string;
  token: string;
}

export async function authenticateSession(request: Request, env: AppEnv): Promise<SessionIdentity> {
  const values = (request.headers.get("Cookie") ?? "").split(";").map((part) => part.trim());
  const cookies = values.filter((part) => part.startsWith("dgt_session="));
  const token = cookies.length === 1 ? cookies[0].slice("dgt_session=".length) : "";
  if (!isToken(token)) throw sessionRequired();
  const hash = await hashToken(token);
  const now = new Date().toISOString();
  const identity = await env.DB.prepare(
    `
    SELECT s.id, s.player_id, p.display_name, s.absolute_expires_at
    FROM web_sessions s JOIN players p ON p.id = s.player_id
    LEFT JOIN device_credentials d ON d.id = s.source_device_id
    WHERE s.session_hash = ? AND s.revoked_at IS NULL AND p.active = 1
      AND s.idle_expires_at > ? AND s.absolute_expires_at > ?
      AND (s.source_device_id IS NULL OR (d.id IS NOT NULL AND d.revoked_at IS NULL))
  `,
  )
    .bind(hash, now, now)
    .first<Omit<SessionIdentity, "token">>();
  if (!identity) throw sessionRequired();
  return { ...identity, token };
}

export async function refreshSession(env: AppEnv, session: SessionIdentity): Promise<void> {
  const now = new Date();
  const nextIdle = new Date(
    Math.min(now.getTime() + SESSION_IDLE_MS, Date.parse(session.absolute_expires_at)),
  ).toISOString();
  const result = await env.DB.prepare(
    `
    UPDATE web_sessions SET last_activity_at = ?, idle_expires_at = ?
    WHERE id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?
      AND EXISTS (SELECT 1 FROM players WHERE id = web_sessions.player_id AND active = 1)
      AND (source_device_id IS NULL OR EXISTS (
        SELECT 1 FROM device_credentials WHERE id = source_device_id AND revoked_at IS NULL
      ))
  `,
  )
    .bind(now.toISOString(), nextIdle, session.id, now.toISOString(), now.toISOString())
    .run();
  if (!result.meta.changes) throw sessionRequired();
}

function sessionRequired() {
  return new ApiError(401, "SESSION_REQUIRED", "Use Login with Device to sign in again.");
}
