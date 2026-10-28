import { apiJson, readJsonBody, requireMethod } from "../../../_lib/http";
import { redeemInvite } from "../../../_lib/onboarding";
import type { AppData, AppEnv } from "../../../_lib/runtime";
import { sessionCookie } from "../../../_lib/sessions";
import { shortcutDownloadUrl } from "../../../_lib/shortcut-download";
import { objectBody, requireSameOrigin, textField } from "../../../_lib/tokens";

export const onRequest: PagesFunction<AppEnv, "inviteToken", AppData> = async ({
  request,
  env,
  params,
  data,
}) => {
  requireMethod(request, ["POST"]);
  requireSameOrigin(request);
  const body = objectBody(await readJsonBody(request, 4096), ["label"]);
  const result = await redeemInvite(
    env,
    String(params.inviteToken),
    textField(body.label, 100, true),
  );
  const installUrl = shortcutDownloadUrl(env);
  return apiJson(
    data.requestId,
    {
      status: "registered",
      player: result.player,
      device_code: result.device_code,
      shortcut_install_url: installUrl,
    },
    {
      status: 201,
      headers: { "Set-Cookie": sessionCookie(result.sessionToken, result.absoluteExpiry) },
    },
  );
};
