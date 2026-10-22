import { deviceLoginRequest } from "../../../_lib/device-login";
import type { AppData, AppEnv } from "../../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = ({ request, env, data }) =>
  deviceLoginRequest(request, env, data.requestId, "start");
