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
    method: safeMethod(request.method),
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
    method: safeMethod(request.method),
    path: redactedPathname(new URL(request.url).pathname),
    reason,
    assertion_present: assertionPresent,
  };

  console.warn(JSON.stringify(diagnostic));
}

function redactedPathname(pathname: string): string {
  const registration = /^(\/api)?\/register\/[^/]+(\/redeem)?$/.exec(pathname);
  if (registration) return `${registration[1] ?? ""}/register/[redacted]${registration[2] ?? ""}`;
  if (SAFE_PATHS.has(pathname)) return pathname;
  return "/[redacted]";
}

const SAFE_PATHS = new Set([
  "/",
  "/user",
  "/login",
  "/admin",
  "/api",
  "/api/health",
  "/api/games",
  "/api/import/validate",
  "/api/import/submit",
  "/api/user/stats",
  "/api/auth/me",
  "/api/auth/logout",
  "/api/auth/device/start",
  "/api/auth/device/status",
  "/api/auth/device/approve",
  "/api/auth/device/complete",
  "/api/leaderboards/daily",
  "/api/leaderboards/all-time",
  "/api/leaderboards/copy",
  "/api/admin",
  "/api/admin/me",
  "/api/admin/dashboard",
  "/api/admin/players",
  "/api/admin/invitations",
  "/api/admin/devices",
  "/api/admin/sessions",
  "/api/admin/submissions",
  "/api/admin/submissions/manual",
  "/api/admin/audits",
  "/api/admin/audit",
]);

function safeMethod(method: string): string {
  return ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].includes(method)
    ? method
    : "OTHER";
}
