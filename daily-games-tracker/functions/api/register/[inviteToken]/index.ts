import { apiJson, requireMethod } from "../../../_lib/http";
import { getInvite } from "../../../_lib/onboarding";
import type { AppData, AppEnv } from "../../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, "inviteToken", AppData> = async ({
  request,
  env,
  params,
  data,
}) => {
  requireMethod(request, ["GET"]);
  const invite = await getInvite(env, String(params.inviteToken));
  return apiJson(data.requestId, {
    player: { display_name: invite.display_name },
    expires_at: invite.expires_at,
  });
};
