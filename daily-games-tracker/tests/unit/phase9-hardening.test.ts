import { describe, expect, it } from "vitest";
import { onRequest } from "../../functions/_middleware";
import { PER_ISOLATE_RATE_LIMIT } from "../../functions/_lib/limits";
import { applyResponsePolicy } from "../../functions/_lib/policy";
import { createRateLimiter, requestRateLimitKey } from "../../functions/_lib/rate-limit";
import type { AppData, AppEnv } from "../../functions/_lib/runtime";

const CSP =
  "default-src 'self'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

describe("Phase 9 shared request boundary", () => {
  it("resets a bounded key deterministically at the end of its window", () => {
    let now = 10_000;
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 1_000,
      maxKeys: 2,
      now: () => now,
    });

    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("client-a")).toMatchObject({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 1,
      resetAt: 11_000,
    });

    now = 11_000;
    expect(limiter.check("client-a")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("keeps the in-memory key map bounded and excludes registration tokens from keys", () => {
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      maxKeys: 2,
      now: () => 1,
    });
    limiter.check("client-a");
    limiter.check("client-b");
    limiter.check("client-c");

    expect(limiter.size).toBe(2);
    expect(
      requestRateLimitKey(
        new Request("https://wht.test/api/register/private-invite/redeem?capture=raw"),
      ),
    ).not.toContain("private-invite");
  });

  it("does not evict a live exhausted key when new-key churn reaches capacity", () => {
    let now = 10_000;
    const limiter = createRateLimiter({
      maxRequests: 1,
      windowMs: 1_000,
      maxKeys: 2,
      now: () => now,
    });

    expect(limiter.check("target").allowed).toBe(true);
    expect(limiter.check("target").allowed).toBe(false);
    expect(limiter.check("churn-a").allowed).toBe(true);
    expect(limiter.check("churn-b").allowed).toBe(false);
    expect(limiter.check("target").allowed).toBe(false);

    now = 11_000;
    expect(limiter.check("target").allowed).toBe(true);
  });

  it("applies the same security headers to API, auth, admin, registration, and SPA responses", () => {
    const paths = [
      "/api/health",
      "/api/auth/me",
      "/api/admin/dashboard",
      "/register/invite-token",
      "/daily/2026-10-25",
    ];

    for (const pathname of paths) {
      const response = applyResponsePolicy(
        new Response("ok", {
          headers: { "Access-Control-Allow-Origin": "*" },
        }),
        "req_phase9",
        pathname,
      );

      expect(response.headers.get("Content-Security-Policy"), pathname).toBe(CSP);
      expect(response.headers.get("Referrer-Policy"), pathname).toBe("no-referrer");
      expect(response.headers.get("Permissions-Policy"), pathname).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
      expect(response.headers.get("X-Content-Type-Options"), pathname).toBe("nosniff");
      expect(response.headers.get("X-Frame-Options"), pathname).toBe("DENY");
      expect(response.headers.get("Access-Control-Allow-Origin"), pathname).toBeNull();
    }
  });

  it("keeps the SPA shell out of the browser HTTP cache while the service worker owns app-shell caching", () => {
    for (const pathname of ["/", "/daily/2026-10-25"]) {
      const response = applyResponsePolicy(new Response("shell"), "req_shell", pathname);
      expect(response.headers.get("Cache-Control"), pathname).toBe("no-store");
    }

    const asset = applyResponsePolicy(new Response("asset"), "req_asset", "/assets/app.js");
    expect(asset.headers.get("Cache-Control")).toBeNull();
  });

  it("fails closed with a bounded 429 response for an abusive request key", async () => {
    const ip = `phase9-${crypto.randomUUID()}`;
    let lastResponse: Response | undefined;

    for (let attempt = 0; attempt <= PER_ISOLATE_RATE_LIMIT.maxRequests; attempt += 1) {
      const request = new Request("https://wht.test/api/health", {
        headers: { "CF-Connecting-IP": ip },
      });
      const context = {
        request,
        env: {} as AppEnv,
        data: {} as AppData,
        next: async () => new Response("ok"),
      } as Parameters<typeof onRequest>[0];
      lastResponse = await onRequest(context);
    }

    expect(lastResponse).toBeDefined();
    expect(lastResponse?.status).toBe(429);
    expect(lastResponse?.headers.get("Retry-After")).toBeTruthy();
    await expect(lastResponse?.json()).resolves.toMatchObject({
      status: "error",
      error_code: "RATE_LIMITED",
    });
  });

  it("preserves Retry-After on an exhausted non-API route", async () => {
    const ip = `phase9-login-${crypto.randomUUID()}`;

    for (let attempt = 0; attempt < PER_ISOLATE_RATE_LIMIT.maxRequests; attempt += 1) {
      const request = new Request("https://wht.test/login", {
        headers: { "CF-Connecting-IP": ip },
      });
      const context = {
        request,
        env: {} as AppEnv,
        data: {} as AppData,
        next: async () => new Response("ok"),
      } as Parameters<typeof onRequest>[0];
      await onRequest(context);
    }

    const request = new Request("https://wht.test/login", {
      headers: { "CF-Connecting-IP": ip },
    });
    const context = {
      request,
      env: {} as AppEnv,
      data: {} as AppData,
      next: async () => new Response("ok"),
    } as Parameters<typeof onRequest>[0];
    const response = await onRequest(context);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBeTruthy();
    await expect(response.text()).resolves.toContain("Too many requests");
  });
});
