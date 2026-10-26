import { requireAdmin } from "../../_lib/access";
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
  type AdminBackfillInput,
  type AdminSubmissionInput,
} from "../../_lib/admin";
import { apiJson, ApiError, readJsonBody, requireMethod } from "../../_lib/http";
import { createInvite, createPlayer, revokeDevice, updatePlayer } from "../../_lib/onboarding";
import type { AppData, AppEnv } from "../../_lib/runtime";
import { invalid, objectBody, requireSameOrigin, textField } from "../../_lib/tokens";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  // Keep this check at the compatibility boundary even when Pages middleware also checks it.
  const admin = await requireAdmin(request, env, data.requestId);
  const path = new URL(request.url).pathname.replace(/^\/api\/admin\/?/, "");
  if (request.method !== "GET") requireSameOrigin(request);

  if (path === "me") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { admin: { email: admin.email } });
  }
  if (path === "players") {
    requireMethod(request, ["GET", "POST"]);
    if (request.method === "GET") {
      const [players, devices] = await Promise.all([listAdminPlayers(env), listAdminDevices(env)]);
      return apiJson(data.requestId, { players, devices });
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

  if (path === "" || path === "dashboard") {
    requireMethod(request, ["GET"]);
    const [players, invitations, devices, sessions, submissions, audits] = await Promise.all([
      listAdminPlayers(env),
      listAdminInvitations(env),
      listAdminDevices(env),
      listAdminSessions(env),
      listAdminSubmissions(env),
      listAdminAudits(env),
    ]);
    return apiJson(data.requestId, {
      players,
      invitations,
      devices,
      sessions,
      submissions,
      audits,
    });
  }

  if (path === "invitations") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { invitations: await listAdminInvitations(env) });
  }
  if (path === "devices") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { devices: await listAdminDevices(env) });
  }
  if (path === "sessions") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { sessions: await listAdminSessions(env) });
  }
  if (path === "submissions") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { submissions: await listAdminSubmissions(env) });
  }
  if (path === "audits" || path === "audit") {
    requireMethod(request, ["GET"]);
    return apiJson(data.requestId, { audits: await listAdminAudits(env) });
  }

  if (path === "submissions/manual") {
    requireMethod(request, ["POST"]);
    const body = objectBody(await readJsonBody(request, 32_768), [
      "player_id",
      "game_key",
      "game_date",
      "external_puzzle_key",
      "final_score",
      "rounds",
      "reason",
    ]);
    const input: AdminBackfillInput = {
      player_id: textField(body.player_id, 100)!,
      game_key: textField(body.game_key, 40)! as AdminBackfillInput["game_key"],
      game_date: textField(body.game_date, 10)!,
      external_puzzle_key: textField(body.external_puzzle_key, 100)!,
      final_score: body.final_score as number,
      rounds: body.rounds as AdminBackfillInput["rounds"],
      reason: body.reason as string,
    };
    return apiJson(
      data.requestId,
      { submission: await backfillSubmission(env, input, admin.email) },
      { status: 201 },
    );
  }

  const submissionMatch = /^submissions\/([^/]+)$/.exec(path);
  if (submissionMatch) {
    if (request.method === "PATCH") {
      const body = objectBody(await readJsonBody(request, 32_768), [
        "final_score",
        "rounds",
        "reason",
      ]);
      const input: AdminSubmissionInput = {
        final_score: body.final_score as number,
        rounds: body.rounds as AdminSubmissionInput["rounds"],
        reason: body.reason as string,
      };
      return apiJson(data.requestId, {
        submission: await correctSubmission(env, submissionMatch[1], input, admin.email),
      });
    }
    if (request.method === "DELETE") {
      const body = objectBody(await readJsonBody(request, 4096), ["reason"]);
      await deleteSubmission(env, submissionMatch[1], body.reason as string, admin.email);
      return apiJson(data.requestId, { status: "deleted" });
    }
    throw new ApiError(405, "METHOD_NOT_ALLOWED", "This request method is not supported.", {
      headers: { Allow: "PATCH, DELETE" },
    });
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
