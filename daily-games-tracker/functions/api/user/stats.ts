import { latestWorldwideDay } from "../../../shared/day";
import { apiJson, requireMethod } from "../../_lib/http";
import { readAllTimeLeaderboard } from "../../_lib/leaderboards";
import { authenticateSession, refreshSession, sessionCookie } from "../../_lib/sessions";
import { shortcutDownloadUrl } from "../../_lib/shortcut-download";
import type { AppData, AppEnv } from "../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const session = await authenticateSession(request, env);
  await refreshSession(env, session);
  const leaderboard = await readAllTimeLeaderboard(env, latestWorldwideDay());
  const games = leaderboard.games.map((game) => {
    const player = game.players.find((candidate) => candidate.id === session.player_id);
    return {
      key: game.key,
      display_name: game.display_name,
      icon: game.icon,
      total: player?.total ?? 0,
      games_played: player?.games_played ?? 0,
      average: player?.average ?? null,
      rank: player?.rank ?? null,
    };
  });

  return apiJson(
    data.requestId,
    {
      status: "ok",
      player: { id: session.player_id, display_name: session.display_name },
      games,
      install_url: shortcutDownloadUrl(env),
    },
    { headers: { "Set-Cookie": sessionCookie(session.token, session.absolute_expires_at) } },
  );
};
