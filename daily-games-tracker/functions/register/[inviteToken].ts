import { getInvite } from "../_lib/onboarding";
import { requireMethod } from "../_lib/http";
import type { AppData, AppEnv } from "../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, "inviteToken", AppData> = async ({
  request,
  env,
  params,
  next,
}) => {
  requireMethod(request, ["GET", "HEAD"]);
  await getInvite(env, String(params.inviteToken));
  // Pages canonicalizes /index.html to /. Fetch / directly so the response stays on the
  // private invitation URL instead of redirecting the browser to the public home page.
  const shell = await next(new Request(new URL("/", request.url), request));
  const headers = new Headers(shell.headers);
  headers.delete("ETag");
  headers.set("Cache-Control", "no-store");
  return new Response(shell.body, { status: shell.status, headers });
};
