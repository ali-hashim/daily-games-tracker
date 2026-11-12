import { latestWorldwideDay } from "../../../shared/day";
import { apiJson, requireMethod } from "../../_lib/http";
import { readStatsBoard } from "../../_lib/leaderboards";
import type { AppData, AppEnv } from "../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const now = new Date();
  return apiJson(data.requestId, {
    ...(await readStatsBoard(env, latestWorldwideDay(now), now)),
  });
};
