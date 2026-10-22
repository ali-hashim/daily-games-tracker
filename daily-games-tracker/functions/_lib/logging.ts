interface RequestFailure {
  requestId: string;
  request: Request;
  error: unknown;
}

/** Logs operational metadata only. Never add request headers, bodies, query strings, or errors. */
export function logRequestFailure({ requestId, request, error }: RequestFailure): void {
  const url = new URL(request.url);
  const diagnostic = {
    level: "error",
    event: "request_failed",
    request_id: requestId,
    method: request.method,
    path: url.pathname.replace(/^(\/api)?\/register\/[^/]+/, "$1/register/[redacted]"),
    error_type: error instanceof Error ? "Error" : "UnknownError",
  };

  console.error(JSON.stringify(diagnostic));
}
