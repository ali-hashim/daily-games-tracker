import { describe, expect, it } from "vitest";
import {
  ApiError,
  apiErrorResponse,
  apiJson,
  declaredBodyTooLarge,
  readJsonBody,
  requireMethod,
} from "../../functions/_lib/http";

describe("API responses", () => {
  it("adds the request ID to successful JSON responses and disables caching", async () => {
    const response = apiJson("req_123", { status: "ok" });

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("X-Request-ID")).toBe("req_123");
    await expect(response.json()).resolves.toEqual({ status: "ok", request_id: "req_123" });
  });

  it("uses the uniform public error envelope", async () => {
    const response = apiErrorResponse(
      "req_456",
      new ApiError(400, "INVALID_INPUT", "Check the submitted result."),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      status: "error",
      request_id: "req_456",
      error_code: "INVALID_INPUT",
      error_message: "Check the submitted result.",
    });
  });

  it("returns an Allow header for unsupported methods", () => {
    const request = new Request("https://wht.example/api/health", { method: "POST" });

    expect(() => requireMethod(request, ["GET"])).toThrowError(
      expect.objectContaining({
        statusCode: 405,
        errorCode: "METHOD_NOT_ALLOWED",
        headers: { Allow: "GET" },
      }),
    );
  });
});

describe("bounded JSON bodies", () => {
  it("parses JSON within the byte limit", async () => {
    const request = new Request("https://wht.example/api/import/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ shortcut_version: 1 }),
    });

    await expect(readJsonBody<{ shortcut_version: number }>(request, 100)).resolves.toEqual({
      shortcut_version: 1,
    });
  });

  it("rejects a declared oversized body before reading it", () => {
    const request = new Request("https://wht.example/api/import/validate", {
      method: "POST",
      headers: { "Content-Length": "101", "Content-Type": "application/json" },
      body: "{}",
    });

    expect(declaredBodyTooLarge(request, 100)).toBe(true);
  });

  it("rejects a streamed oversized body even without Content-Length", async () => {
    const request = new Request("https://wht.example/api/import/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "too large" }),
    });

    await expect(readJsonBody(request, 8)).rejects.toMatchObject({
      statusCode: 413,
      errorCode: "PAYLOAD_TOO_LARGE",
    });
  });

  it("rejects non-JSON media types", async () => {
    const request = new Request("https://wht.example/api/import/validate", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "{}",
    });

    await expect(readJsonBody(request)).rejects.toMatchObject({
      statusCode: 415,
      errorCode: "UNSUPPORTED_MEDIA_TYPE",
    });
  });
});
