import { requireAdmin } from "../../_lib/access";
import { apiJson, ApiError, readJsonBody, requireMethod } from "../../_lib/http";
import { createInvite, createPlayer, revokeDevice, updatePlayer } from "../../_lib/onboarding";
import type { AppData, AppEnv } from "../../_lib/runtime";
import { invalid, objectBody, requireSameOrigin, textField } from "../../_lib/tokens";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  // Each admin API handler verifies identity independently of the global route middleware.
  const admin = await requireAdmin(request, env);
  const path = new URL(request.url).pathname.slice("/api/admin/".length);
  if (request.method !== "GET") requireSameOrigin(request);

  if (path === "me") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { admin: { email: admin.email } });
  }
  if (path === "players") {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "GET") {
      const players = await env.DB.prepare(
        "SELECT id, display_name, active FROM players ORDER BY display_name COLLATE NOCASE",
      ).all();
      const devices = await env.DB.prepare(
        "SELECT id, player_id, label, created_at, last_used_at, revoked_at FROM device_credentials ORDER BY created_at DESC",
      ).all();
      return apiJson(data.requestId, { players: players.results, devices: devices.results });
    }
    const body = objectBody(await readJsonBody(request, 4096), ["display_name"]);
    const name = textField(body.display_name, 80)!;
    return apiJson(
      data.requestId,
      { player: await createPlayer(env, name, admin.email) },
      { status: 201 },
    );
  }

  const inviteMatch = /^players\/([^/]+)\/devices\/invite$/.exec(path);
  if (inviteMatch) {
    requireMethod(request, ["POST"]);
    objectBody(await readJsonBody(request, 4096), []);
    const invite = await createInvite(env, inviteMatch[1], admin.email);
    const registrationUrl = new URL(`/register/${invite.token}`, request.url).href;
    return apiJson(
      data.requestId,
      { registration_url: registrationUrl, expires_at: invite.expires_at },
      { status: 201 },
    );
  }

  const revokeMatch = /^devices\/([^/]+)\/revoke$/.exec(path);
  if (revokeMatch) {
    requireMethod(request, ["POST"]);
    objectBody(await readJsonBody(request, 4096), []);
    await revokeDevice(env, revokeMatch[1], admin.email);
    return apiJson(data.requestId, { status: "revoked" });
  }

  const playerMatch = /^players\/([^/]+)$/.exec(path);
  if (playerMatch) {
    requireMethod(request, ["PATCH"]);
    const body = objectBody(await readJsonBody(request, 4096), ["display_name", "active"]);
    const fields: { display_name?: string; active?: boolean } = {};
    if ("display_name" in body) fields.display_name = textField(body.display_name, 80)!;
    if ("active" in body) {
      if (typeof body.active !== "boolean") throw invalid();
      fields.active = body.active;
    }
    if (!Object.keys(fields).length) throw invalid();
    await updatePlayer(env, playerMatch[1], fields, admin.email);
    return apiJson(data.requestId, { status: "updated" });
  }

  throw new ApiError(404, "NOT_FOUND", "The requested API endpoint does not exist.");
};
