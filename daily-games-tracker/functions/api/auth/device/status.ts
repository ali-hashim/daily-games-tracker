import { authenticateDevice, touchDevice } from "../../../_lib/devices";
import { apiJson, requireMethod } from "../../../_lib/http";
import type { AppData, AppEnv } from "../../../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const device = await authenticateDevice(request, env);
  await touchDevice(env, device.id);
  return apiJson(data.requestId, {
    status: "authorized",
    player: { display_name: device.display_name },
    device: { label: device.label },
  });
};
