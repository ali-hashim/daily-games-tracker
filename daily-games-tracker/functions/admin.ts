import { requireMethod } from "./_lib/http";
import type { AppData, AppEnv } from "./_lib/runtime";

// The root middleware verifies Access before this handler can serve the admin UI.
export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, next }) => {
  requireMethod(request, ["GET", "HEAD"]);
  return next(new Request(new URL("/", request.url), request));
};
