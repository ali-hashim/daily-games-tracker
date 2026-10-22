import { MAX_API_BODY_BYTES } from "./limits";

export interface ApiErrorBody {
  status: "error";
  request_id: string;
  error_code: string;
  error_message: string;
}

interface ApiErrorOptions {
  headers?: HeadersInit;
  cause?: unknown;
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string;
  readonly publicMessage: string;
  readonly headers?: HeadersInit;

  constructor(
    statusCode: number,
    errorCode: string,
    publicMessage: string,
    options: ApiErrorOptions = {},
  ) {
    super(publicMessage, { cause: options.cause });
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.publicMessage = publicMessage;
    this.headers = options.headers;
  }
}

export function apiJson(
  requestId: string,
  body: Record<string, unknown>,
  init: ResponseInit = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("X-Request-ID", requestId);

  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    ...init,
    headers,
  });
}

export function apiErrorResponse(requestId: string, error: ApiError): Response {
  const headers = new Headers(error.headers);
  return apiJson(
    requestId,
    {
      status: "error",
      error_code: error.errorCode,
      error_message: error.publicMessage,
    },
    { status: error.statusCode, headers },
  );
}

export function requireMethod(request: Request, allowed: readonly string[]): void {
  if (allowed.includes(request.method)) return;

  throw new ApiError(405, "METHOD_NOT_ALLOWED", "This request method is not supported.", {
    headers: { Allow: allowed.join(", ") },
  });
}

export function declaredBodyTooLarge(request: Request, limit = MAX_API_BODY_BYTES): boolean {
  const rawLength = request.headers.get("Content-Length");
  if (rawLength === null) return false;

  const length = Number(rawLength);
  return Number.isFinite(length) && length > limit;
}

export async function readJsonBody<T>(request: Request, limit = MAX_API_BODY_BYTES): Promise<T> {
  if (
    request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !==
    "application/json"
  ) {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send this request as application/json.");
  }

  if (declaredBodyTooLarge(request, limit)) {
    throw payloadTooLarge();
  }

  if (!request.body) {
    throw new ApiError(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(400, "INVALID_JSON", "The request body must contain valid JSON.");
  }
}

function payloadTooLarge(): ApiError {
  return new ApiError(
    413,
    "PAYLOAD_TOO_LARGE",
    "The uploaded result is too large. Nothing was submitted.",
  );
}
