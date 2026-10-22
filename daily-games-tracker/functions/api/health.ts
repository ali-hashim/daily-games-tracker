import { pacificDay } from "../../shared/day";
import { ApiError, apiJson, requireMethod } from "../_lib/http";
import type { AppData, AppEnv } from "../_lib/runtime";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  try {
    const row = await env.DB.prepare("SELECT value FROM app_meta WHERE key = ?")
      .bind("schema_version")
      .first<{ value: string }>();
    if (!row) throw new Error("Initial migration not applied");

    return apiJson(data.requestId, {
      status: "ok",
      schemaVersion: Number(row.value),
      // Server-derived Pacific date; later phases use this to enforce today-only submissions.
      gameDay: pacificDay(),
    });
  } catch (error) {
    // A public health endpoint must not leak internal database errors.
    throw new ApiError(503, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", {
      cause: error,
    });
  }
};
