import { afterEach, describe, expect, it, vi } from "vitest";
import { logRequestFailure } from "../../functions/_lib/logging";

afterEach(() => vi.restoreAllMocks());

describe("redacted request diagnostics", () => {
  it("redacts invitation tokens embedded in registration URL paths", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logRequestFailure({
      requestId: "req_safe",
      request: new Request("https://wht.test/api/register/private-invite/redeem"),
      error: new Error("sensitive"),
    });
    const output = String(spy.mock.calls[0][0]);
    expect(output).not.toContain("private-invite");
    expect(output).toContain("/api/register/[redacted]/redeem");
  });
  it("omits query strings, headers, bodies, and error messages", () => {
    const output: string[] = [];
    vi.spyOn(console, "error").mockImplementation((value) => output.push(String(value)));
    const request = new Request("https://wht.example/api/import/submit?token=query-secret", {
      method: "POST",
      headers: { Authorization: "Device header-secret" },
      body: "body-secret",
    });

    logRequestFailure({
      requestId: "req_safe",
      request,
      error: new Error("error-secret"),
    });

    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0])).toEqual({
      level: "error",
      event: "request_failed",
      request_id: "req_safe",
      method: "POST",
      path: "/api/import/submit",
      error_type: "Error",
    });
    expect(output[0]).not.toContain("query-secret");
    expect(output[0]).not.toContain("header-secret");
    expect(output[0]).not.toContain("body-secret");
    expect(output[0]).not.toContain("error-secret");
  });
});
