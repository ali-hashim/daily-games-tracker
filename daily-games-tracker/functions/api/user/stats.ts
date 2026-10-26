import { latestWorldwideDay } from "../../../shared/day";
import { apiJson, requireMethod } from "../../_lib/http";
import { readAllTimeLeaderboard } from "../../_lib/leaderboards";
import { authenticateSession, refreshSession, sessionCookie } from "../../_lib/sessions";
import type { AppData, AppEnv } from "../../_lib/runtime";

const SUPPORTED_INSTALL_URL = /^https:\/\/www\.icloud\.com\/shortcuts\/[a-f0-9]{32}$/i;
const TEST_INSTALL_URL = "https://example.invalid/shortcuts/EXAMPLE_SHORTCUT";

function installUrl(env: AppEnv): string | null {
  const value = env.SHORTCUT_INSTALL_URL ?? "";
  return SUPPORTED_INSTALL_URL.test(value) || (env.APP_ENV === "test" && value === TEST_INSTALL_URL)
    ? value
    : null;
}

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
      install_url: installUrl(env),
    },
    { headers: { "Set-Cookie": sessionCookie(session.token, session.absolute_expires_at) } },
  );
};
