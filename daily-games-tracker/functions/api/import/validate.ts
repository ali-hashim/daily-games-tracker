import { importRequest } from "../../_lib/import";
import type { AppData, AppEnv } from "../../_lib/runtime";
export const onRequest: PagesFunction<AppEnv, string, AppData> = ({ request, env, data }) =>
  importRequest(request, env, data.requestId, "validate");
