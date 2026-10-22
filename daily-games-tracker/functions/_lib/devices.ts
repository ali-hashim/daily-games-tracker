import { ApiError } from "./http";
import type { AppEnv } from "./runtime";
import { hashToken, isToken } from "./tokens";

export interface DeviceIdentity {
  id: string;
  player_id: string;
  display_name: string;
  label: string | null;
}

export interface DeviceWithShortcutPolicy extends DeviceIdentity {
  minimum_shortcut_version: string | null;
  latest_shortcut_version: string | null;
}

export function authenticateDevice(request: Request, env: AppEnv): Promise<DeviceIdentity> {
  return readDevice<DeviceIdentity>(request, env);
}

/** Read fresh policy with authentication, avoiding a second D1 binding call. No caching. */
export function authenticateDeviceWithShortcutPolicy(
  request: Request,
  env: AppEnv,
): Promise<DeviceWithShortcutPolicy> {
  return readDevice<DeviceWithShortcutPolicy>(
    request,
    env,
    `,
    (SELECT value FROM app_meta WHERE key = 'minimum_shortcut_version') AS minimum_shortcut_version,
    (SELECT value FROM app_meta WHERE key = 'latest_shortcut_version') AS latest_shortcut_version`,
  );
}

async function readDevice<T extends DeviceIdentity>(
  request: Request,
  env: AppEnv,
  policyColumns = "",
): Promise<T> {
  const header = request.headers.get("Authorization") ?? "";
  const match = /^Device ([A-Za-z0-9_-]{43})$/.exec(header);
  if (!match || !isToken(match[1])) throw rejected();
  const hash = await hashToken(match[1]);
  const device = await env.DB.prepare(
    `
    SELECT d.id, d.player_id, p.display_name, d.label${policyColumns} FROM device_credentials d
    JOIN players p ON p.id = d.player_id
    WHERE d.credential_hash = ? AND d.revoked_at IS NULL AND p.active = 1
  `,
  )
    .bind(hash)
    .first<T>();
  if (!device) throw rejected();
  return device;
}

/** Call only after the operation has authenticated and validated successfully. */
export async function touchDevice(env: AppEnv, deviceId: string): Promise<void> {
  const result = await env.DB.prepare(
    `
    UPDATE device_credentials SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM players WHERE id = device_credentials.player_id AND active = 1)
  `,
  )
    .bind(new Date().toISOString(), deviceId)
    .run();
  if (!result.meta.changes) throw rejected();
}

function rejected() {
  return new ApiError(
    401,
    "DEVICE_UNAUTHORIZED",
    "This device is not authorized. Ask the administrator for a new device invitation.",
  );
}
