import { ApiError, apiErrorResponse, declaredBodyTooLarge } from "./_lib/http";
import { logRequestFailure } from "./_lib/logging";
import { applyResponsePolicy } from "./_lib/policy";
import { createRequestId, type AppData, type AppEnv } from "./_lib/runtime";
import { isAdminPath, requireAdmin } from "./_lib/access";
import { importRequest } from "./_lib/import";

export const onRequest: PagesFunction<AppEnv, string, AppData> = async (context) => {
  const requestId = createRequestId();
  const url = new URL(context.request.url);
  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
  context.data.requestId = requestId;

  try {
    if (isAdminPath(url.pathname)) {
      context.data.admin = await requireAdmin(context.request, context.env);
    }
    if (isApi && declaredBodyTooLarge(context.request)) {
      throw new ApiError(
        413,
        "PAYLOAD_TOO_LARGE",
        "The uploaded result is too large. Nothing was submitted.",
      );
    }

    // Exact import routes already share all enforcement in this middleware and importRequest.
    // Dispatch them directly rather than recompiling the remaining Pages route matchers.
    const importMode =
      url.pathname === "/api/import/validate"
        ? "validate"
        : url.pathname === "/api/import/submit"
          ? "submit"
          : null;
    const response = importMode
      ? await importRequest(context.request, context.env, requestId, importMode)
      : await context.next();
    return applyResponsePolicy(response, requestId, url.pathname);
  } catch (error) {
    if (!(error instanceof ApiError) || error.statusCode >= 500) {
      logRequestFailure({ requestId, request: context.request, error });
    }

    if (isApi) {
      const apiError =
        error instanceof ApiError
          ? error
          : new ApiError(
              500,
              "INTERNAL_ERROR",
              "The request could not be completed. Try again or contact the administrator.",
            );
      return applyResponsePolicy(apiErrorResponse(requestId, apiError), requestId, url.pathname);
    }

    return applyResponsePolicy(
      new Response(error instanceof ApiError ? error.publicMessage : "Internal Server Error", {
        status: error instanceof ApiError ? error.statusCode : 500,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
          "X-Request-ID": requestId,
        },
      }),
      requestId,
      url.pathname,
    );
  }
};
