import { ApiError } from "../_lib/http";
import type { AppData, AppEnv } from "../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async () => {
  throw new ApiError(404, "NOT_FOUND", "The requested API endpoint does not exist.");
};
