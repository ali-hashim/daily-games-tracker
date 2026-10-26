import { readFileSync } from "node:fs";
import * as React from "react";
import { act, createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getPage } from "../../src/App";
import { safeDailyReturnPath, safeReturnPath } from "../../src/lib/login-return";
import DeviceLogin, {
  dailySignInUrl,
  shouldRedirectDaily,
  type AuthenticatedRenderProps,
  type Player,
} from "../../src/pages/DeviceLogin";
import UserPage, { type UserStatsResponse } from "../../src/pages/UserPage";
import { ApiRequestError } from "../../src/lib/api";

const appSource = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
const deviceLoginSource = readFileSync(
  new URL("../../src/pages/DeviceLogin.tsx", import.meta.url),
  "utf8",
);
function sourceIfPresent(path: string): string {
  try {
    return readFileSync(new URL(path, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const userPageSource = sourceIfPresent("../../src/pages/UserPage.tsx");
const loginReturnSource = sourceIfPresent("../../src/lib/login-return.ts");

class BehaviorEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  target: BehaviorElement | BehaviorDocument | null = null;
  currentTarget: BehaviorElement | BehaviorDocument | null = null;
  defaultPrevented = false;

  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation(): void {}
}

type BehaviorListener = (event: BehaviorEvent) => void;

class BehaviorNode {
  readonly nodeType: number;
  ownerDocument: BehaviorDocument;
  parentNode: BehaviorElement | BehaviorDocument | null = null;
  childNodes: BehaviorNode[] = [];
  private textValue: string | null = null;

  constructor(nodeType: number, ownerDocument: BehaviorDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
  }

  get textContent(): string {
    return this.textValue ?? this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string | null) {
    this.childNodes = [];
    this.textValue = value ?? "";
  }

  appendChild<T extends BehaviorNode>(child: T): T {
    this.textValue = null;
    child.parentNode = this as unknown as BehaviorElement | BehaviorDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends BehaviorNode>(child: T, before: BehaviorNode | null): T {
    this.textValue = null;
    child.parentNode = this as unknown as BehaviorElement | BehaviorDocument;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends BehaviorNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
}

class BehaviorTextNode extends BehaviorNode {
  constructor(value: string, ownerDocument: BehaviorDocument) {
    super(3, ownerDocument);
    this.textContent = value;
  }
}

class BehaviorElement extends BehaviorNode {
  readonly tagName: string;
  readonly nodeName: string;
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, BehaviorListener[]>();
  className = "";
  disabled = false;

  constructor(tagName: string, ownerDocument: BehaviorDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
  }

  setAttribute(name: string, value: string | boolean): void {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === "class") this.className = normalized;
    if (name === "disabled") this.disabled = true;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: BehaviorListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: BehaviorListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: BehaviorEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  click(): void {
    if (!this.disabled) this.dispatchEvent(new BehaviorEvent("click", { bubbles: true }));
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  querySelectorAll(selector: string): BehaviorElement[] {
    const matches: BehaviorElement[] = [];
    const visit = (node: BehaviorNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof BehaviorElement) {
          if (child.matches(selector)) matches.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector: string): BehaviorElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  matches(selector: string): boolean {
    const match = selector.match(/^([a-z0-9-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);
    if (!match) throw new Error(`Unsupported behavior selector: ${selector}`);
    const [, tag, className, attribute, attributeValue] = match;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (className && !this.className.split(/\s+/).includes(className)) return false;
    if (attribute && !this.attributes.has(attribute)) return false;
    if (attributeValue !== undefined && this.attributes.get(attribute ?? "") !== attributeValue) {
      return false;
    }
    return true;
  }
}

class BehaviorDocument extends BehaviorNode {
  readonly documentElement: BehaviorElement;
  readonly body: BehaviorElement;
  readonly defaultView: Record<string, unknown>;
  readonly listeners = new Map<string, BehaviorListener[]>();
  activeElement: BehaviorElement | null = null;
  visibilityState: "visible" | "hidden" = "visible";

  constructor() {
    super(9, null as unknown as BehaviorDocument);
    this.ownerDocument = this;
    this.defaultView = {};
    this.documentElement = new BehaviorElement("html", this);
    this.body = new BehaviorElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): BehaviorElement {
    return new BehaviorElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): BehaviorElement {
    return this.createElement(tagName);
  }

  createTextNode(value: string): BehaviorTextNode {
    return new BehaviorTextNode(value, this);
  }

  addEventListener(type: string, listener: BehaviorListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: BehaviorListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: BehaviorEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  querySelectorAll(selector: string): BehaviorElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector: string): BehaviorElement | null {
    return this.documentElement.querySelector(selector);
  }
}

interface BehaviorWindow {
  document: BehaviorDocument;
  HTMLElement: typeof BehaviorElement;
  HTMLIFrameElement: typeof BehaviorElement;
  SVGElement: typeof BehaviorElement;
  Node: typeof BehaviorNode;
  location: {
    origin: string;
    pathname: string;
    search: string;
    assign: (url: string) => void;
  };
  addEventListener: (type: string, listener: BehaviorListener) => void;
  removeEventListener: (type: string, listener: BehaviorListener) => void;
  dispatchEvent: (event: BehaviorEvent) => boolean;
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  setInterval: typeof setInterval;
  clearInterval: typeof clearInterval;
}

function installBehaviorDom(): {
  container: BehaviorElement;
  document: BehaviorDocument;
  window: BehaviorWindow;
} {
  const document = new BehaviorDocument();
  const windowListeners = new Map<string, BehaviorListener[]>();
  const window: BehaviorWindow = {
    document,
    HTMLElement: BehaviorElement,
    HTMLIFrameElement: BehaviorElement,
    SVGElement: BehaviorElement,
    Node: BehaviorNode,
    location: { origin: "https://wht.test", pathname: "/user", search: "", assign: vi.fn() },
    addEventListener: (type, listener) => {
      const listeners = windowListeners.get(type) ?? [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    removeEventListener: (type, listener) => {
      windowListeners.set(
        type,
        (windowListeners.get(type) ?? []).filter((current) => current !== listener),
      );
    },
    dispatchEvent: (event) => {
      if (!event.target) event.target = null;
      for (const listener of windowListeners.get(event.type) ?? []) listener(event);
      return !event.defaultPrevented;
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  Object.assign(document.defaultView, window);
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("React", React);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, document, window };
}

const behaviorRoots: Array<{ unmount: () => void }> = [];

async function renderBehavior(element: ReactNode) {
  const dom = installBehaviorDom();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(dom.container as unknown as Element);
  behaviorRoots.push(root);
  await act(async () => {
    root.render(element);
  });
  return { ...dom, root };
}

async function flushBehavior(): Promise<void> {
  for (let index = 0; index < 3; index += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

function userStats(overrides: Partial<UserStatsResponse> = {}): UserStatsResponse {
  return {
    status: "ok",
    player: { id: "alex", display_name: "Alex" },
    games: [
      {
        key: "krillion",
        display_name: "Krillion",
        icon: "🦐",
        total: 0,
        games_played: 0,
        average: null,
        rank: null,
      },
    ],
    install_url: null,
    ...overrides,
  };
}

const testPlayer: Player = { id: "alex", display_name: "Alex" };

function buttonWithText(container: BehaviorElement, text: string): BehaviorElement {
  const button = container
    .querySelectorAll("button")
    .find((candidate) => candidate.textContent.includes(text));
  expect(button, `Missing button containing ${text}`).toBeDefined();
  return button!;
}

afterEach(async () => {
  const roots = behaviorRoots.splice(0);
  if (roots.length > 0) {
    await act(async () => {
      for (const root of roots) root.unmount();
      await Promise.resolve();
    });
  }
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Phase 10 User behavior", () => {
  it("cleans up the waiting Login with Device actions and advisory notes", async () => {
    const requestPaths: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        requestPaths.push(path);

        if (path === "/api/auth/me") {
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20To%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") {
          return Response.json({ status: "pending" });
        }

        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(createElement(DeviceLogin));
    await flushBehavior();

    expect(buttonWithText(rendered.container, "Login with Device")).toBeDefined();
    expect(rendered.container.textContent).not.toContain("Start a new login");

    await act(async () => {
      buttonWithText(rendered.container, "Login with Device").click();
    });
    await flushBehavior();

    expect(requestPaths).toContain("/api/auth/device/start");
    const shortcut = rendered.container.querySelector("a.primary-action");
    expect(shortcut?.textContent).toBe("Login with your device");
    expect(shortcut?.getAttribute("href")).toBe("shortcuts://run-shortcut?name=Upload%20To%20WHT");
    expect(rendered.container.textContent).not.toContain("Open Upload to WHT");
    expect(rendered.container.textContent).not.toContain("Home Screen app");
    expect(rendered.container.textContent).not.toContain("If Shortcuts opens Safari");
    expect(rendered.container.textContent).toContain("Already logged in? Tap Check login below.");
    expect(rendered.container.textContent).toContain(
      "Shortcut unavailable? Contact your administrator.",
    );
    expect(rendered.container.textContent).not.toContain("Reinstall your configured Shortcut");
    expect(() => buttonWithText(rendered.container, "Start a new login")).toThrow();
    expect(buttonWithText(rendered.container, "Check login")).toBeDefined();

    const advisory = rendered.container.querySelector(".device-login-advisory");
    expect(advisory).not.toBeNull();
    expect(advisory?.textContent).toContain("Already logged in? Tap Check login below.");

    const checkLogin = buttonWithText(rendered.container, "Check login");
    expect(checkLogin.parentNode).toBe(advisory?.parentNode);
    expect(checkLogin.parentNode?.childNodes.indexOf(advisory!)).toBeLessThan(
      checkLogin.parentNode?.childNodes.indexOf(checkLogin) ?? -1,
    );
  });

  it("registers behavior roots for deterministic teardown", async () => {
    await renderBehavior(createElement("div", null, "teardown probe"));
    expect(behaviorRoots).toHaveLength(1);
  });

  it("mounts through the auth slot, keeps logout usable while loading, renders zero-play values, and logs out", async () => {
    let resolveStats!: (response: Response) => void;
    const pendingStats = new Promise<Response>((resolve) => {
      resolveStats = resolve;
    });
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        calls.push(path);
        if (path === "/api/auth/me") return Response.json({ player: testPlayer });
        if (path === "/api/user/stats") return pendingStats;
        if (path === "/api/auth/logout") return Response.json({ status: "ok" });
        throw new Error(`Unexpected ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    await flushBehavior();

    expect(rendered.container.textContent).toContain("Loading your scorecard");
    buttonWithText(rendered.container, "Log out");

    resolveStats(Response.json(userStats()));
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Krillion");
    expect(rendered.container.textContent).toContain("0");
    expect(rendered.container.textContent).toContain("—");

    await act(async () => buttonWithText(rendered.container, "Log out").click());
    await flushBehavior();
    expect(calls).toContain("/api/auth/logout");
    expect(rendered.container.textContent).toContain("Login with Device");
    expect(rendered.container.textContent).not.toContain("Alex");
  });

  it("clears mounted User content on a stats 401 without redirecting from /user", async () => {
    const locationAssign = vi.fn();
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        calls.push(path);
        if (path === "/api/auth/me") return Response.json({ player: testPlayer });
        if (path === "/api/user/stats") {
          return Response.json({ error_message: "Session expired" }, { status: 401 });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );
    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    rendered.window.location.assign = locationAssign;
    await flushBehavior();

    expect(calls).toContain("/api/user/stats");
    expect(rendered.window.location.pathname).toBe("/user");
    expect(locationAssign).not.toHaveBeenCalled();
    expect(rendered.container.textContent).toContain("Login with Device");
    expect(rendered.container.textContent).toContain(
      "Your login expired or was revoked. Login with Device to continue.",
    );
    expect(rendered.container.textContent).not.toContain("Alex");
  });

  it.each(["server", "network"] as const)(
    "keeps identity and logout usable when User stats fail with a %s error",
    async (failure) => {
      const calls: string[] = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const path = String(input);
          calls.push(path);
          if (path === "/api/auth/me") return Response.json({ player: testPlayer });
          if (path === "/api/user/stats") {
            if (failure === "network") throw new Error("offline");
            return Response.json({ error_message: "Unavailable" }, { status: 500 });
          }
          if (path === "/api/auth/logout") return Response.json({ status: "ok" });
          throw new Error(`Unexpected ${path}`);
        }),
      );
      const rendered = await renderBehavior(
        createElement(DeviceLogin, {
          children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
        }),
      );
      await flushBehavior();

      expect(rendered.container.querySelector('[role="alert"]')?.textContent).toContain(
        "could not load your scorecard",
      );
      expect(rendered.container.textContent).toContain("Alex");
      await act(async () => buttonWithText(rendered.container, "Log out").click());
      await flushBehavior();
      expect(calls).toContain("/api/auth/logout");
      expect(rendered.container.textContent).toContain("Login with Device");
      expect(rendered.container.textContent).not.toContain("Alex");
    },
  );

  it("revalidates mounted auth on pageshow, visibility, and focus, clearing revoked User state", async () => {
    let authCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authCalls += 1;
          if (authCalls < 4) return Response.json({ player: testPlayer });
          return Response.json({ error_message: "Session expired" }, { status: 401 });
        }
        if (path === "/api/user/stats") return Response.json(userStats());
        throw new Error(`Unexpected ${path}`);
      }),
    );
    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Alex");

    await act(async () => rendered.window.dispatchEvent(new BehaviorEvent("pageshow")));
    await flushBehavior();
    await act(async () => rendered.document.dispatchEvent(new BehaviorEvent("visibilitychange")));
    await flushBehavior();
    await act(async () => rendered.window.dispatchEvent(new BehaviorEvent("focus")));
    await flushBehavior();

    expect(authCalls).toBeGreaterThanOrEqual(4);
    expect(rendered.container.textContent).toContain("Login with Device");
    expect(rendered.container.textContent).not.toContain("Alex");
  });

  it("switches User stats with the authenticated player and ignores the prior response", async () => {
    let authCalls = 0;
    let statsCalls = 0;
    const statsResponses: Array<(response: Response) => void> = [];
    const makePendingStats = () =>
      new Promise<Response>((resolve) => {
        statsResponses.push(resolve);
      });
    const alexStats = userStats({
      player: { id: "alex", display_name: "Alex" },
      games: [
        {
          key: "krillion",
          display_name: "Krillion",
          icon: "🦐",
          total: 111,
          games_played: 1,
          average: 111,
          rank: 1,
        },
      ],
    });
    const blairStats = userStats({
      player: { id: "blair", display_name: "Blair" },
      games: [
        {
          key: "krillion",
          display_name: "Krillion",
          icon: "🦐",
          total: 222,
          games_played: 1,
          average: 222,
          rank: 1,
        },
      ],
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authCalls += 1;
          return Response.json(
            authCalls === 1
              ? { player: { id: "alex", display_name: "Alex" } }
              : { player: { id: "blair", display_name: "Blair" } },
          );
        }
        if (path === "/api/user/stats") {
          statsCalls += 1;
          return makePendingStats();
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    await flushBehavior();
    expect(statsCalls).toBe(1);

    await act(async () => rendered.window.dispatchEvent(new BehaviorEvent("focus")));
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Blair");
    expect(statsCalls).toBe(2);

    await act(async () => statsResponses[0](Response.json(alexStats)));
    await flushBehavior();
    expect(rendered.container.textContent).not.toContain("111");

    await act(async () => statsResponses[1](Response.json(blairStats)));
    await flushBehavior();
    expect(rendered.container.textContent).toContain("222");
    expect(rendered.container.textContent).not.toContain("111");
  });

  it("does not restore a stale auth response after logout", async () => {
    let authCalls = 0;
    let resolveStaleAuth!: (response: Response) => void;
    const staleAuth = new Promise<Response>((resolve) => {
      resolveStaleAuth = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authCalls += 1;
          return authCalls === 1 ? Response.json({ player: testPlayer }) : staleAuth;
        }
        if (path === "/api/user/stats") return Response.json(userStats());
        if (path === "/api/auth/logout") return Response.json({ status: "ok" });
        throw new Error(`Unexpected ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Alex");

    await act(async () => rendered.window.dispatchEvent(new BehaviorEvent("focus")));
    await flushBehavior();
    expect(authCalls).toBe(2);

    await act(async () => buttonWithText(rendered.container, "Log out").click());
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Login with Device");

    await act(async () => resolveStaleAuth(Response.json({ player: testPlayer })));
    await flushBehavior();
    expect(rendered.container.textContent).toContain("Login with Device");
    expect(rendered.container.textContent).not.toContain("Alex");
  });
});

describe("Phase 10 user route shell", () => {
  it("accepts only same-origin User or real dated Daily return paths", () => {
    expect(safeReturnPath(undefined)).toBe("/user");
    expect(safeReturnPath("/user?next=/admin")).toBe("/user");
    expect(safeReturnPath("/daily/2026-10-25")).toBe("/daily/2026-10-25");
    expect(safeReturnPath("/daily/2026-02-30")).toBe("/user");
    expect(safeReturnPath("daily/2026-10-25")).toBe("/user");
    expect(safeReturnPath("https://wht.invalid/user")).toBe("/user");
    expect(safeReturnPath("https://evil.example/daily/2026-10-25")).toBe("/user");
    expect(safeDailyReturnPath("/daily", "?date=2026-10-24")).toBe("/daily/2026-10-24");
    expect(dailySignInUrl("/daily", "", "2026-10-25")).toBe(
      "/user?return_url=%2Fdaily%2F2026-10-25",
    );
    expect(shouldRedirectDaily(new ApiRequestError("expired", 401))).toBe(true);
    expect(shouldRedirectDaily(new ApiRequestError("server failed", 500))).toBe(false);
    expect(shouldRedirectDaily(new Error("offline"))).toBe(false);
  });

  it("classifies /user and /login as the same User page", () => {
    expect(getPage("/user")).toBe("user");
    expect(getPage("/login")).toBe("user");
    expect(getPage("/daily/2026-10-25")).toBe("daily");
  });

  it("keeps the permanent bottom navigation in the required order", () => {
    const nav = appSource.slice(appSource.indexOf("const items = ["));
    expect(nav.indexOf('label: "Play"')).toBeGreaterThanOrEqual(0);
    expect(nav.indexOf('label: "Daily"')).toBeGreaterThan(nav.indexOf('label: "Play"'));
    expect(nav.indexOf('label: "All-Time"')).toBeGreaterThan(nav.indexOf('label: "Daily"'));
    expect(nav.indexOf('label: "User"')).toBeGreaterThan(nav.indexOf('label: "All-Time"'));
    expect(nav).toContain('href: "/user"');
    expect(nav).toContain('aria-current={page === item.id ? "page" : undefined}');
  });

  it("uses the explicit Daily auth gate and redirects only a 401 to a safe User return", () => {
    expect(appSource).toContain("redirectWhenSignedOut");
    expect(deviceLoginSource).toContain("shouldRedirectDaily(error)");
    expect(deviceLoginSource).toContain("/user?return_url=");
    expect(deviceLoginSource).toContain("safeDailyReturnPath");
    expect(deviceLoginSource).toContain('typeof children === "function"');
  });

  it("renders Daily through the authenticated slot without the identity card", () => {
    expect(appSource).toMatch(/<DeviceLogin[^>]*redirectWhenSignedOut/);
    expect(appSource).toMatch(/<DailyLeaderboardPage currentDay=\{health\?\.gameDay\} \/>/);
    expect(deviceLoginSource).toContain("player: Player;");
    expect(deviceLoginSource).toContain("busy: boolean;");
    expect(deviceLoginSource).toContain("logout: () => Promise<void>;");
  });

  it("defines a safe return helper and a private User scorecard", () => {
    expect(loginReturnSource).toContain("export function safeReturnPath");
    expect(loginReturnSource).toContain("/daily/");
    expect(loginReturnSource).toContain('const USER_PATH = "/user"');
    expect(userPageSource).toContain("/api/user/stats");
    expect(userPageSource).toContain("total: number");
    expect(userPageSource).toContain("games_played: number");
    expect(userPageSource).toContain("average: number | null");
    expect(userPageSource).toContain("rank: number | null");
    expect(userPageSource).toContain("install_url: string | null");
    expect(userPageSource).toContain("Log out");
  });

  it("covers explicit User loading, error, zero-play, and logout-clearing states", () => {
    expect(userPageSource).toContain("Loading your scorecard");
    expect(userPageSource).toContain('role="alert"');
    expect(userPageSource).toContain("games_played === 0");
    expect(userPageSource).toContain("average === null");
    expect(userPageSource).toContain("rank === null");
    expect(userPageSource).toContain("setStats(null)");
    expect(deviceLoginSource).toContain("setPlayer(null)");
    expect(appSource).toContain("window.history.replaceState");
  });
});
