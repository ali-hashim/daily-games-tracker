import { apiJson, ApiError, requireMethod } from "../../_lib/http";
import { parseDailyDate, playerSubmissionGameOnDate } from "../../_lib/leaderboards";
import { submissionScoreboard } from "../../_lib/scoreboard";
import { authenticateSession, refreshSession, sessionCookie } from "../../_lib/sessions";
import type { AppData, AppEnv } from "../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const session = await authenticateSession(request, env);
  await refreshSession(env, session);
  const date = parseDailyDate(request.url);
  const submittedGame = await playerSubmissionGameOnDate(env, session.player_id, date);
  if (!submittedGame) {
    throw new ApiError(
      403,
      "COPY_NOT_ELIGIBLE",
      "Submit at least one game for this date to copy the leaderboard.",
    );
  }

  const scoreboard = await submissionScoreboard(
    env,
    date,
    session.player_id,
    submittedGame,
  );
  return apiJson(
    data.requestId,
    { status: "ok", date, scoreboard_text: scoreboard.scoreboard_text },
    {
      headers: { "Set-Cookie": sessionCookie(session.token, session.absolute_expires_at) },
    },
  );
};
