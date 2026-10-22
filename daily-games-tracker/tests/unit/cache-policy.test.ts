import { describe, expect, it } from "vitest";
import { applyResponsePolicy } from "../../functions/_lib/policy";
import { isAppShellAsset, isNetworkOnlyPath } from "../../shared/cache-policy";

describe("network-only routes", () => {
  it.each(["/api", "/api/health", "/admin", "/admin/players", "/register/invite-token", "/login"])(
    "keeps %s out of browser and service-worker caches",
    (pathname) => {
      expect(isNetworkOnlyPath(pathname)).toBe(true);
    },
  );

  it.each(["/", "/daily", "/all-time", "/administrator", "/registration"])(
    "does not overmatch %s",
    (pathname) => {
      expect(isNetworkOnlyPath(pathname)).toBe(false);
    },
  );

  it("forces no-store and a request ID on network-only responses", () => {
    const response = applyResponsePolicy(new Response("ok"), "req_policy", "/api/games");

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Request-ID")).toBe("req_policy");
  });
});

describe("app-shell cache boundary", () => {
  it("allows only app-shell files and static browser destinations", () => {
    expect(isAppShellAsset("/", "document")).toBe(true);
    expect(isAppShellAsset("/assets/app-123.js", "script")).toBe(true);
    expect(isAppShellAsset("/assets/app-123.css", "style")).toBe(true);
  });

  it("never treats API, admin, or registration resources as app-shell assets", () => {
    expect(isAppShellAsset("/api/games", "script")).toBe(false);
    expect(isAppShellAsset("/admin", "document")).toBe(false);
    expect(isAppShellAsset("/register/abc", "image")).toBe(false);
    expect(isAppShellAsset("/login", "document")).toBe(false);
  });
});
