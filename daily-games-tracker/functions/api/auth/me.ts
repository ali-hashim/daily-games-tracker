import { apiJson, requireMethod } from "../../_lib/http";
import type { AppData, AppEnv } from "../../_lib/runtime";
import { authenticateSession, refreshSession, sessionCookie } from "../../_lib/sessions";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const session = await authenticateSession(request, env);
  await refreshSession(env, session);
  return apiJson(
    data.requestId,
    { player: { id: session.player_id, display_name: session.display_name } },
    { headers: { "Set-Cookie": sessionCookie(session.token, session.absolute_expires_at) } },
  );
};
