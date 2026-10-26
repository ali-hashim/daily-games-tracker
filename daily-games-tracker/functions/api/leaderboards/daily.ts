import { apiJson, requireMethod } from "../../_lib/http";
import { parseDailyDate, readDailyLeaderboard } from "../../_lib/leaderboards";
import { authenticateSession, refreshSession, sessionCookie } from "../../_lib/sessions";
import type { AppData, AppEnv } from "../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const session = await authenticateSession(request, env);
  await refreshSession(env, session);
  const date = parseDailyDate(request.url);
  const model = await readDailyLeaderboard(
    env,
    { id: session.player_id, display_name: session.display_name },
    date,
  );
  return apiJson(
    data.requestId,
    { ...model },
    {
      headers: { "Set-Cookie": sessionCookie(session.token, session.absolute_expires_at) },
    },
  );
};
