import { ApiError } from "./http";
import type { AppEnv } from "./runtime";
import { DAY_MS, SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "./sessions";
import { hashToken, isToken, randomToken } from "./tokens";

interface Invite {
  id: string;
  player_id: string;
  display_name: string;
  expires_at: string;
}

export async function createPlayer(env: AppEnv, displayName: string, admin: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  // The unique active-name index resolves concurrent case-insensitive duplicates.
  try {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO players (id, display_name, active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)",
      ).bind(id, displayName, now, now),
      audit(
        env,
        admin,
        "player.create",
        "player",
        id,
        { display_name: displayName, active: true },
        now,
      ),
    ]);
  } catch (error) {
    if (
      await env.DB.prepare(
        "SELECT 1 FROM players WHERE display_name = ? COLLATE NOCASE AND active = 1",
      )
        .bind(displayName)
        .first()
    ) {
      throw new ApiError(
        409,
        "PLAYER_NAME_EXISTS",
        "An active player already has that display name.",
      );
    }
    throw error;
  }
  return { id, display_name: displayName, active: true };
}

export async function createInvite(env: AppEnv, playerId: string, admin: string) {
  const token = randomToken();
  const hash = await hashToken(token);
  const id = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DAY_MS).toISOString();
  const results = await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO registration_invites (id, player_id, token_hash, expires_at, created_by, created_at)
      SELECT ?, id, ?, ?, ?, ? FROM players WHERE id = ? AND active = 1`,
    ).bind(id, hash, expiresAt, admin, now.toISOString(), playerId),
    env.DB.prepare(
      `INSERT INTO admin_audit_log (id, admin_identity, action, entity_type, entity_id, after_json, created_at)
      SELECT ?, ?, 'device.invite', 'player', ?, ?, ? WHERE EXISTS (SELECT 1 FROM registration_invites WHERE id = ?)`,
    ).bind(
      crypto.randomUUID(),
      admin,
      playerId,
      JSON.stringify({ expires_at: expiresAt }),
      now.toISOString(),
      id,
    ),
  ]);
  if (results[0].meta.changes !== 1)
    throw new ApiError(404, "PLAYER_NOT_FOUND", "Choose an active player before adding a device.");
  return { token, expires_at: expiresAt };
}

export async function getInvite(env: AppEnv, token: string): Promise<Invite> {
  if (!isToken(token)) throw invalidInvite();
  const invite = await env.DB.prepare(
    `
    SELECT i.id, i.player_id, p.display_name, i.expires_at FROM registration_invites i
    JOIN players p ON p.id = i.player_id
    WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.expires_at > ? AND p.active = 1
  `,
  )
    .bind(await hashToken(token), new Date().toISOString())
    .first<Invite>();
  if (!invite) throw invalidInvite();
  return invite;
}

export async function redeemInvite(env: AppEnv, token: string, label: string | null) {
  const invite = await getInvite(env, token);
  const credential = randomToken();
  const sessionToken = randomToken();
  const [credentialHash, sessionHash, inviteHash] = await Promise.all([
    hashToken(credential),
    hashToken(sessionToken),
    hashToken(token),
  ]);
  const deviceId = crypto.randomUUID();
  const now = new Date();
  const timestamp = now.toISOString();
  const idleExpiry = new Date(now.getTime() + SESSION_IDLE_MS).toISOString();
  const absoluteExpiry = new Date(now.getTime() + SESSION_ABSOLUTE_MS).toISOString();

  // D1 executes this batch transactionally. A competing redemption cannot pass the same
  // unconsumed-invite predicate; later statements depend on this batch's fresh device UUID.
  const results = await env.DB.batch([
    env.DB.prepare(
      `
      INSERT INTO device_credentials (id, player_id, credential_hash, label, created_at)
      SELECT ?, i.player_id, ?, ?, ? FROM registration_invites i JOIN players p ON p.id = i.player_id
      WHERE i.token_hash = ? AND i.consumed_at IS NULL AND i.expires_at > ? AND p.active = 1
    `,
    ).bind(deviceId, credentialHash, label, timestamp, inviteHash, timestamp),
    env.DB.prepare(
      `
      INSERT INTO web_sessions (id, player_id, session_hash, source_device_id, idle_expires_at,
        absolute_expires_at, last_activity_at, created_at)
      SELECT ?, player_id, ?, id, ?, ?, ?, ? FROM device_credentials WHERE id = ?
    `,
    ).bind(
      crypto.randomUUID(),
      sessionHash,
      idleExpiry,
      absoluteExpiry,
      timestamp,
      timestamp,
      deviceId,
    ),
    env.DB.prepare(
      `UPDATE registration_invites SET consumed_at = ? WHERE token_hash = ?
      AND consumed_at IS NULL AND EXISTS (SELECT 1 FROM device_credentials WHERE id = ?)`,
    ).bind(timestamp, inviteHash, deviceId),
  ]);
  if (results[0].meta.changes !== 1) throw invalidInvite();
  return {
    player: { id: invite.player_id, display_name: invite.display_name },
    device_id: deviceId,
    device_code: credential,
    sessionToken,
    absoluteExpiry,
  };
}

export async function revokeDevice(env: AppEnv, deviceId: string, admin: string) {
  const device = await env.DB.prepare("SELECT id, player_id FROM device_credentials WHERE id = ?")
    .bind(deviceId)
    .first<{ id: string; player_id: string }>();
  if (!device) throw new ApiError(404, "DEVICE_NOT_FOUND", "The selected device does not exist.");
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE device_credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE id = ?",
    ).bind(now, deviceId),
    env.DB.prepare(
      "UPDATE web_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE source_device_id = ?",
    ).bind(now, deviceId),
    audit(
      env,
      admin,
      "device.revoke",
      "device",
      deviceId,
      { player_id: device.player_id, revoked: true },
      now,
    ),
  ]);
}

export async function updatePlayer(
  env: AppEnv,
  playerId: string,
  fields: { display_name?: string; active?: boolean },
  admin: string,
) {
  const existing = await env.DB.prepare("SELECT id FROM players WHERE id = ?")
    .bind(playerId)
    .first();
  if (!existing) throw new ApiError(404, "PLAYER_NOT_FOUND", "The selected player does not exist.");
  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(
      `UPDATE players SET display_name = COALESCE(?, display_name),
    active = COALESCE(?, active), updated_at = ? WHERE id = ?`,
    ).bind(
      fields.display_name ?? null,
      fields.active === undefined ? null : Number(fields.active),
      now,
      playerId,
    ),
  ];
  if (fields.active === false) {
    // Re-activation never restores old credentials, invites, or sessions.
    statements.push(
      env.DB.prepare(
        "UPDATE device_credentials SET revoked_at = COALESCE(revoked_at, ?) WHERE player_id = ?",
      ).bind(now, playerId),
      env.DB.prepare(
        "UPDATE web_sessions SET revoked_at = COALESCE(revoked_at, ?) WHERE player_id = ?",
      ).bind(now, playerId),
      env.DB.prepare(
        "UPDATE registration_invites SET consumed_at = COALESCE(consumed_at, ?) WHERE player_id = ?",
      ).bind(now, playerId),
    );
  }
  statements.push(audit(env, admin, "player.update", "player", playerId, fields, now));
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (
      fields.display_name &&
      (await env.DB.prepare(
        "SELECT id FROM players WHERE display_name = ? COLLATE NOCASE AND active = 1 AND id <> ?",
      )
        .bind(fields.display_name, playerId)
        .first())
    ) {
      throw new ApiError(
        409,
        "PLAYER_NAME_EXISTS",
        "An active player already has that display name.",
      );
    }
    throw error;
  }
}

function audit(
  env: AppEnv,
  admin: string,
  action: string,
  entityType: string,
  entityId: string,
  after: unknown,
  now: string,
) {
  return env.DB.prepare(
    `INSERT INTO admin_audit_log (id, admin_identity, action, entity_type, entity_id, after_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(crypto.randomUUID(), admin, action, entityType, entityId, JSON.stringify(after), now);
}

function invalidInvite() {
  return new ApiError(
    410,
    "INVITE_UNAVAILABLE",
    "This invitation is invalid, expired, or already used. Ask the administrator for a new invitation.",
  );
}
