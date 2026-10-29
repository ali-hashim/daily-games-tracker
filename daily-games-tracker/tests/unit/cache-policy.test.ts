import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { applyResponsePolicy } from "../../functions/_lib/policy";
import { isAppShellAsset, isNetworkOnlyPath } from "../../shared/cache-policy";

const redirects = readFileSync(new URL("../../public/_redirects", import.meta.url), "utf8");
const headers = readFileSync(new URL("../../public/_headers", import.meta.url), "utf8");
const serviceWorker = readFileSync(
  new URL("../../service-worker/worker.ts", import.meta.url),
  "utf8",
);
const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");

function cssBlock(selector: string): string {
  const normalizedStyles = styles.replace(/\s+/g, " ");
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizedStyles.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`),
  );
  expect(match, `Expected CSS block for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

describe("network-only routes", () => {
  it("fits the four bottom-nav tiles at narrow mobile widths", () => {
    const nav = cssBlock(".nav-inner");
    const link = cssBlock(".nav-link");
    expect(nav).toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");
    expect(link).toContain("min-width: 0");
    expect(link).toContain("width: 100%");
  });

  it("serves both private route aliases through the SPA shell with no-store headers", () => {
    expect(redirects).toContain("/user /index.html 200");
    expect(redirects).toContain("/user/* /index.html 200");
    expect(redirects).toContain("/login /index.html 200");
    expect(redirects).toContain("/login/* /index.html 200");
    expect(headers).toContain("/user\n  Cache-Control: no-store");
    expect(headers).toContain("/user/*\n  Cache-Control: no-store");
    expect(headers).toContain("/login\n  Cache-Control: no-store");
    expect(serviceWorker).toContain("CACHE_PREFIX}v4");
  });

  it.each([
    "/api",
    "/api/health",
    "/admin",
    "/admin/players",
    "/register/invite-token",
    "/user",
    "/user/",
    "/login",
    "/login/",
  ])("keeps %s out of browser and service-worker caches", (pathname) => {
    expect(isNetworkOnlyPath(pathname)).toBe(true);
  });

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

describe("service-worker login cache integration", () => {
  let onFetch: (event: {
    request: Request;
    respondWith: (response: Promise<Response>) => void;
  }) => void;
  const match = vi.fn();
  const put = vi.fn();
  const open = vi.fn();
  const fetchMock = vi.fn();

  beforeEach(async () => {
    vi.resetModules();
    match.mockReset();
    put.mockReset();
    open.mockReset().mockResolvedValue({ put });
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("caches", { match, open });
    vi.stubGlobal("self", {
      location: { origin: "https://wht.example" },
      addEventListener: (type: string, listener: typeof onFetch) => {
        if (type === "fetch") onFetch = listener;
      },
    });
    await import("../../service-worker/worker");
  });

  afterEach(() => vi.unstubAllGlobals());

  function dispatch(path: string, method = "GET", navigate = false) {
    const request = new Request(`https://wht.example${path}`, { method });
    if (navigate) Object.defineProperty(request, "mode", { value: "navigate" });
    const respondWith = vi.fn<(response: Promise<Response>) => void>();
    onFetch({ request, respondWith });
    expect(respondWith).toHaveBeenCalledOnce();
    return { request, response: respondWith.mock.calls[0][0] };
  }

  it.each(["/login", "/login/?return=/daily", "/api", "/api/auth/me"])(
    "bypasses HTTP and service-worker caches for %s",
    async (path) => {
      const network = new Response("fresh");
      fetchMock.mockResolvedValue(network);
      const { request, response } = dispatch(path);
      expect(await response).toBe(network);
      expect(fetchMock).toHaveBeenCalledWith(request, { cache: "no-store" });
      expect(match).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    },
  );

  it.each(["/api/auth/device/complete", "/api/auth/logout"])(
    "keeps POST %s network-only",
    async (path) => {
      fetchMock.mockResolvedValue(new Response("ok"));
      const { request, response } = dispatch(path, "POST");
      await response;
      expect(fetchMock).toHaveBeenCalledWith(request, { cache: "no-store" });
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("never falls back to a cached login shell when offline", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    match.mockResolvedValue(new Response("stale login"));
    await expect(dispatch("/login", "GET", true).response).rejects.toThrow("offline");
    expect(match).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "does not cache redirected shell responses (navigation=%s)",
    async (navigate) => {
      const redirected = new Response("login");
      Object.defineProperties(redirected, {
        redirected: { value: true },
        url: { value: "https://wht.example/login" },
      });
      fetchMock.mockResolvedValue(redirected);
      const { response } = dispatch(navigate ? "/daily/2026-10-23" : "/icon.svg", "GET", navigate);
      expect(await response).toBe(redirected);
      expect(put).not.toHaveBeenCalled();
      expect(open).not.toHaveBeenCalled();
    },
  );

  it("preserves offline app-shell fallback for dated daily pages", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const shell = new Response("shell");
    match.mockResolvedValue(shell);
    expect(await dispatch("/daily/2026-10-23", "GET", true).response).toBe(shell);
    expect(match).toHaveBeenCalledWith("/");
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
    expect(isAppShellAsset("/user", "document")).toBe(false);
    expect(isAppShellAsset("/login", "document")).toBe(false);
  });
});
