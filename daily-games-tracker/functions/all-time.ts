import type { AppData, AppEnv } from "./_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, next }) => {
  if (new URL(request.url).pathname !== "/all-time") return next();

  return new Response(null, {
    status: 308,
    headers: {
      Location: "/all-time/",
      "Cache-Control": "no-store",
    },
  });
};
