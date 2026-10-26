import { parseDailyDate } from "./_lib/leaderboards";
import type { AppData, AppEnv } from "./_lib/runtime";
import { pacificDay } from "../shared/day";

/** Keep old shared links useful while the browser route stays /daily/YYYY-MM-DD. */
export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, next }) => {
  const url = new URL(request.url);
  if (url.pathname !== "/daily") return next();

  const date = url.searchParams.has("date") ? parseDailyDate(request.url) : pacificDay();
  return new Response(null, {
    status: 308,
    headers: {
      Location: `/daily/${date}`,
      "Cache-Control": "no-store",
    },
  });
};
