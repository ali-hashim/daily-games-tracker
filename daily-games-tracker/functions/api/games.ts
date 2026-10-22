import { ApiError, apiJson, requireMethod } from "../_lib/http";
import type { AppData, AppEnv } from "../_lib/runtime";

interface GameRow {
  id: string;
  key: "krillion" | "maptap";
  display_name: string;
  round_count: number;
  config_json: string;
}

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, key, display_name, round_count, config_json FROM games WHERE active = 1 ORDER BY display_name",
    ).all<GameRow>();
    return apiJson(data.requestId, {
      games: results.map((row) => ({
        id: row.key,
        title: row.display_name,
        icon: (JSON.parse(row.config_json) as { icon: string }).icon,
        rounds: row.round_count,
        scoringStyle: row.key === "krillion" ? "emoji_levels" : "weighted_numbers",
      })),
    });
  } catch (error) {
    throw new ApiError(503, "GAMES_UNAVAILABLE", "Games are temporarily unavailable.", {
      cause: error,
    });
  }
};
