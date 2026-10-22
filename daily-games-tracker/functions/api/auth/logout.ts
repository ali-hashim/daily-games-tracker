import { ApiError, apiJson, requireMethod } from "../../_lib/http";
import type { AppData, AppEnv } from "../../_lib/runtime";
import { authenticateSession, CLEAR_SESSION_COOKIE } from "../../_lib/sessions";
import { requireSameOrigin } from "../../_lib/tokens";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["POST"]);
  requireSameOrigin(request);
  try {
    const session = await authenticateSession(request, env);
    await env.DB.prepare("UPDATE web_sessions SET revoked_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), session.id)
      .run();
  } catch (error) {
    if (!(error instanceof ApiError) || error.errorCode !== "SESSION_REQUIRED") throw error;
  }
  return apiJson(
    data.requestId,
    { status: "logged_out" },
    { headers: { "Set-Cookie": CLEAR_SESSION_COOKIE } },
  );
};
