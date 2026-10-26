import type { AppData, AppEnv } from "./_lib/runtime";

const USER_PAGE_PATHS = new Set(["/user", "/user/", "/login", "/login/"]);

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, next }) => {
  const url = new URL(request.url);
  if (!USER_PAGE_PATHS.has(url.pathname)) return next();

  url.pathname = "/";
  return next(new Request(url, request));
};
