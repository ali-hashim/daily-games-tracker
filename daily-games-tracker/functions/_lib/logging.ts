interface RequestFailure {
  requestId: string;
  request: Request;
  error: unknown;
}

export type AdminDenialReason =
  "missing_assertion" | "assertion_too_large" | "invalid_assertion" | "identity_mismatch";

interface AdminAccessDeniedDiagnostic {
  requestId: string;
  request: Request;
  reason: AdminDenialReason;
  assertionPresent: boolean;
}

/** Logs operational metadata only. Never add request headers, bodies, query strings, or errors. */
export function logRequestFailure({ requestId, request, error }: RequestFailure): void {
  const url = new URL(request.url);
  const diagnostic = {
    level: "error",
    event: "request_failed",
    request_id: requestId,
    method: request.method,
    path: redactedPathname(url.pathname),
    error_type: error instanceof Error ? "Error" : "UnknownError",
  };

  console.error(JSON.stringify(diagnostic));
}

export function logAdminAccessDenied({
  requestId,
  request,
  reason,
  assertionPresent,
}: AdminAccessDeniedDiagnostic): void {
  const diagnostic = {
    level: "warn",
    event: "admin_access_denied",
    request_id: requestId,
    method: request.method,
    path: redactedPathname(new URL(request.url).pathname),
    reason,
    assertion_present: assertionPresent,
  };

  console.warn(JSON.stringify(diagnostic));
}

function redactedPathname(pathname: string): string {
  return pathname.replace(/^(\/api)?\/register\/[^/]+/, "$1/register/[redacted]");
}
