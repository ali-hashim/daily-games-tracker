import { readFileSync } from "node:fs";
import * as React from "react";
import { act, createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App, { getPage } from "../../src/App";
import { safeDailyReturnPath, safeReturnPath } from "../../src/lib/login-return";
import DeviceLogin, {
  dailySignInUrl,
  shouldRedirectDaily,
  type AuthenticatedRenderProps,
  type Player,
} from "../../src/pages/DeviceLogin";
import UserPage, { type UserStatsResponse } from "../../src/pages/UserPage";
import RegistrationPage from "../../src/pages/RegistrationPage";
import PlayerHelp from "../../src/pages/PlayerHelp";
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
const registrationPageSource = sourceIfPresent("../../src/pages/RegistrationPage.tsx");
const loginReturnSource = sourceIfPresent("../../src/lib/login-return.ts");
const stylesSource = sourceIfPresent("../../src/styles.css");

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

async function renderBehavior(element: ReactNode, pathname?: string) {
  const dom = installBehaviorDom();
  if (pathname) dom.window.location.pathname = pathname;
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
  it("auto-starts device login on initial unauthenticated entry", async () => {
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
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
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

    expect(requestPaths.filter((path) => path === "/api/auth/device/start")).toHaveLength(1);
    const shortcut = rendered.container.querySelector("a.primary-action");
    expect(shortcut?.textContent).toBe("Login with your device");
    expect(shortcut?.getAttribute("href")).toBe("shortcuts://run-shortcut?name=Upload%20to%20WHT");
    expect(() => buttonWithText(rendered.container, "Login with Device")).toThrow();
  });

  it("auto-starts device login once when mounted in StrictMode", async () => {
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
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") {
          return Response.json({ status: "pending" });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(React.StrictMode, null, createElement(DeviceLogin)),
    );
    await flushBehavior();

    expect(requestPaths.filter((path) => path === "/api/auth/me")).toHaveLength(1);
    expect(requestPaths.filter((path) => path === "/api/auth/device/start")).toHaveLength(1);
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
  });

  it("restarts device login when completion finds the session unauthenticated", async () => {
    let authCalls = 0;
    let startCalls = 0;
    let completeCalls = 0;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authCalls += 1;
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") {
          startCalls += 1;
          return Response.json({
            shortcut_url: `shortcuts://run-shortcut?name=Upload%20to%20WHT%20${startCalls}`,
          });
        }
        if (path === "/api/auth/device/complete") {
          completeCalls += 1;
          return Response.json({ status: completeCalls === 1 ? "authenticated" : "pending" });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(createElement(DeviceLogin));
    await flushBehavior();

    expect(authCalls).toBeGreaterThanOrEqual(2);
    expect(startCalls).toBe(2);
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
  });

  it("does not render an initial login button while starting device login", async () => {
    let resolveStart!: (response: Response) => void;
    const pendingStart = new Promise<Response>((resolve) => {
      resolveStart = resolve;
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") return pendingStart;
        if (path === "/api/auth/device/complete") return Response.json({ status: "pending" });
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(createElement(DeviceLogin));
    await flushBehavior();

    expect(rendered.container.querySelectorAll("button")).toHaveLength(0);

    resolveStart(
      Response.json({
        shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
      }),
    );
    await flushBehavior();
  });

  it("offers a retry action when starting device login fails", async () => {
    let startAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") {
          startAttempts += 1;
          if (startAttempts === 1) {
            return Response.json({ error_message: "Device unavailable" }, { status: 503 });
          }
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
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

    await act(async () => buttonWithText(rendered.container, "Try again").click());
    await flushBehavior();

    expect(startAttempts).toBe(2);
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
  });

  it("offers a retry action when the initial login check fails", async () => {
    let authAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authAttempts += 1;
          if (authAttempts === 1) {
            return Response.json({ error_message: "Auth service unavailable" }, { status: 503 });
          }
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
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

    expect(rendered.container.textContent).toContain("Auth service unavailable");
    await act(async () => buttonWithText(rendered.container, "Try again").click());
    await flushBehavior();

    expect(authAttempts).toBe(2);
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
  });

  it("offers a retry action when the device login request expires", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          return Response.json({ error_message: "required" }, { status: 401 });
        }
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") {
          return Response.json({ error_message: "Device login expired" }, { status: 410 });
        }
        throw new Error(`Unexpected request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(createElement(DeviceLogin));
    await flushBehavior();

    expect(rendered.container.textContent).toContain("Device login expired");
    expect(buttonWithText(rendered.container, "Try again")).toBeDefined();
  });

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
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
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

    expect(rendered.container.textContent).not.toContain("Start a new login");
    expect(requestPaths.filter((path) => path === "/api/auth/device/start")).toHaveLength(1);
    const shortcut = rendered.container.querySelector("a.primary-action");
    expect(shortcut?.textContent).toBe("Login with your device");
    expect(shortcut?.getAttribute("href")).toBe("shortcuts://run-shortcut?name=Upload%20to%20WHT");
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
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") return Response.json({ status: "pending" });
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
    expect(calls).toContain("/api/auth/device/start");
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
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
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") return Response.json({ status: "pending" });
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
    expect(calls).toContain("/api/auth/device/start");
    expect(rendered.container.querySelector("a.primary-action")?.textContent).toBe(
      "Login with your device",
    );
    expect(rendered.container.textContent).not.toContain("Alex");
  });

  it("ignores an old completion auth response after a newer device flow starts", async () => {
    let authCalls = 0;
    let startCalls = 0;
    let completeCalls = 0;
    let resolveOldAuth!: (response: Response) => void;
    let expireSession!: () => void;
    const oldAuth = new Promise<Response>((resolve) => {
      resolveOldAuth = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/auth/me") {
          authCalls += 1;
          return authCalls === 1 ? Response.json({ player: testPlayer }) : oldAuth;
        }
        if (path === "/api/auth/device/start") {
          startCalls += 1;
          return Response.json({ shortcut_url: `shortcuts://flow-${startCalls}` });
        }
        if (path === "/api/auth/device/complete") {
          completeCalls += 1;
          return Response.json({ status: completeCalls === 1 ? "authenticated" : "pending" });
        }
        throw new Error(`Unexpected ${path}`);
      }),
    );
    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => {
          expireSession = auth.sessionExpired;
          return createElement("div", null, auth.player.display_name);
        },
      }),
    );
    await flushBehavior();
    await act(async () => expireSession());
    await flushBehavior();
    expect(authCalls).toBe(2);
    await act(async () => expireSession());
    await flushBehavior();
    expect(startCalls).toBe(2);
    await act(async () => resolveOldAuth(Response.json({ player: testPlayer })));
    await flushBehavior();
    expect(rendered.container.textContent).not.toContain(testPlayer.display_name);
    expect(rendered.container.querySelector("a.primary-action")?.getAttribute("href")).toBe(
      "shortcuts://flow-2",
    );
  });

  it("retries server logout before starting a new device login", async () => {
    const calls: string[] = [];
    let logoutAttempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        calls.push(path);
        if (path === "/api/auth/me") return Response.json({ player: testPlayer });
        if (path === "/api/user/stats") return Response.json(userStats());
        if (path === "/api/auth/logout") {
          logoutAttempts += 1;
          return logoutAttempts === 1
            ? Response.json({ error_message: "Logout unavailable" }, { status: 503 })
            : Response.json({ status: "ok" });
        }
        if (path === "/api/auth/device/start") {
          return Response.json({
            shortcut_url: "shortcuts://run-shortcut?name=Upload%20to%20WHT",
          });
        }
        if (path === "/api/auth/device/complete") return Response.json({ status: "pending" });
        throw new Error(`Unexpected ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(DeviceLogin, {
        children: (auth: AuthenticatedRenderProps) => createElement(UserPage, auth),
      }),
    );
    await flushBehavior();

    await act(async () => buttonWithText(rendered.container, "Log out").click());
    await flushBehavior();

    expect(rendered.container.textContent).toContain("Logout unavailable");
    expect(calls).not.toContain("/api/auth/device/start");
    await act(async () => buttonWithText(rendered.container, "Try again").click());
    await flushBehavior();
    expect(calls.filter((path) => path === "/api/auth/logout")).toHaveLength(2);
    expect(calls.indexOf("/api/auth/device/start")).toBeGreaterThan(
      calls.lastIndexOf("/api/auth/logout"),
    );
    expect(rendered.container.textContent).toContain("You are logged out.");
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
    expect(userPageSource).toContain("href={currentStats.install_url}");
    expect(userPageSource).toContain("Download Shortcut");
    expect(userPageSource).toMatch(/explicitly approved future device-code\s+creation\s+feature/);
    expect(registrationPageSource).toContain("href={result.shortcut_install_url}");
    expect(registrationPageSource).not.toContain("www.icloud.com/shortcuts");
    expect(appSource).not.toContain("Supported Shortcut link unavailable");
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

describe("Task 9 player setup help", () => {
  it("shows accessible setup guidance at home, registration, and signed-in User entry points", () => {
    const registration = sourceIfPresent("../../src/pages/RegistrationPage.tsx");
    const help = sourceIfPresent("../../src/pages/PlayerHelp.tsx");
    const normalizedHelp = help.replace(/\s+/g, " ");
    const playPage = appSource.slice(
      appSource.indexOf("function PlayHelpPage"),
      appSource.indexOf("function BottomNav"),
    );

    expect(playPage).toContain("<PlayerHelp />");
    expect(appSource).not.toContain('aria-label="Supported Shortcut link unavailable"');
    expect(registration).toContain("<PlayerHelp");
    expect(userPageSource).toContain("<PlayerHelp");
    for (const guidance of [
      "Shortcuts",
      "Import Question",
      "Safari",
      "Share your score",
      "Edit Actions",
      "Favorites",
    ]) {
      expect(normalizedHelp.toLowerCase()).toContain(guidance.toLowerCase());
    }
    expect(help).toContain('aria-labelledby="player-help-heading"');
  });

  it("keeps Play's missing-action fallback below both game-specific paths", () => {
    const playPage = appSource.slice(
      appSource.indexOf("function PlayHelpPage"),
      appSource.indexOf("function BottomNav"),
    );
    const gamePaths = playPage.indexOf('className="setup-steps share-steps"');
    const fallback = playPage.indexOf('className="muted-note missing-share-action-help"');
    expect(gamePaths).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeGreaterThan(gamePaths);
    expect(playPage).toContain(
      "If Upload to WHT is missing from the share sheet: See the setup and sharing help below.",
    );
  });

  async function registerAndCopy(writeText: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("navigator", { userAgent: "Chrome", clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/register/synthetic-invite")
          return Response.json({ player: { display_name: "Alex" } });
        if (path === "/api/register/synthetic-invite/redeem" && init?.method === "POST")
          return Response.json({
            player: { display_name: "Alex" },
            device_code: "synthetic-private-code",
            shortcut_install_url: null,
          });
        throw new Error("Unexpected registration request: " + path);
      }),
    );
    const rendered = await renderBehavior(
      createElement(RegistrationPage),
      "/register/synthetic-invite",
    );
    await flushBehavior();
    const form = rendered.container.querySelector("form");
    expect(form).toBeDefined();
    await act(async () => {
      form!.dispatchEvent(new BehaviorEvent("submit", { bubbles: true, cancelable: true }));
    });
    await flushBehavior();
    await act(async () => buttonWithText(rendered.container, "Copy device code").click());
    await flushBehavior();
    return rendered.container;
  }

  it("shows accessible clipboard failure feedback and keeps the private code visible", async () => {
    const container = await registerAndCopy(
      vi.fn().mockRejectedValue(new Error("clipboard blocked")),
    );
    const steps = container.querySelectorAll("li.registration-step-card");
    const codeStep = steps[0];
    const downloadStep = steps[1];
    const code = codeStep?.querySelector('[aria-label="Private device code"]') as
      (BehaviorElement & { value?: string }) | null;
    const registration = sourceIfPresent("../../src/pages/RegistrationPage.tsx");

    expect(codeStep?.querySelector("button")?.textContent).toBe("Copy device code");
    expect(code?.value).toBe("synthetic-private-code");
    expect(registration).toMatch(/aria-label="Private device code"[\s\S]*?readOnly/);
    expect(codeStep?.querySelector('[role="status"]')?.textContent).toContain(
      "Copy failed. Select the code above and copy it manually.",
    );
    expect(downloadStep?.querySelector("a.primary-action")).toBeNull();
    expect(downloadStep?.querySelector(".notice")?.textContent).toContain(
      "The supported Shortcut download link is unavailable.",
    );
    expect(downloadStep?.querySelector(".notice")?.textContent).toContain(
      "the code cannot be recovered if you close it.",
    );
  });

  it("announces successful device-code copying", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const container = await registerAndCopy(writeText);

    expect(writeText).toHaveBeenCalledWith("synthetic-private-code");
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "Private device code copied.",
    );
  });
});

describe("Task 9 approved UI addendum", () => {
  it("renders the six-step registration completion flow without changing one-time-code handling", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const registrationRequests: string[] = [];
    vi.stubGlobal("navigator", { userAgent: "Safari", clipboard: { writeText } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        if (path === "/api/register/synthetic-invite") {
          return Response.json({ player: { display_name: "Alex" } });
        }
        if (path === "/api/register/synthetic-invite/redeem" && init?.method === "POST") {
          registrationRequests.push(`${path}:${init.method}`);
          return Response.json({
            player: { display_name: "Alex" },
            device_code: "synthetic-private-code",
            shortcut_install_url: "/api/shortcut/download",
          });
        }
        throw new Error(`Unexpected registration request: ${path}`);
      }),
    );

    const rendered = await renderBehavior(
      createElement(RegistrationPage),
      "/register/synthetic-invite",
    );
    await flushBehavior();
    const form = rendered.container.querySelector("form");
    expect(form).toBeDefined();
    await act(async () => {
      form!.dispatchEvent(new BehaviorEvent("submit", { bubbles: true, cancelable: true }));
    });
    await flushBehavior();

    const intro = rendered.container.querySelector(".registration-completion-intro");
    expect(intro?.textContent).toContain("Follow these six steps in order");
    expect(intro?.textContent).toContain("Keep this page open");

    const orderedSteps = rendered.container.querySelectorAll("li.registration-step-card");
    expect(orderedSteps).toHaveLength(6);
    expect(
      orderedSteps.map((step) => [
        step.querySelector(".registration-step-number")?.textContent,
        step.querySelector("h3")?.textContent,
      ]),
    ).toEqual([
      ["Step 1", "Copy your device code"],
      ["Step 2", "Download Upload to WHT"],
      ["Step 3", "Open your download"],
      ["Step 4", "Install and set up"],
      ["Step 5", "Add Upload to WHT to Favorites"],
      ["Step 6", "Play"],
    ]);
    expect(orderedSteps[0]?.textContent).toContain("copy it manually");
    expect(orderedSteps[0]?.textContent.toLowerCase()).not.toContain("paste");
    expect(orderedSteps[2]?.textContent).toContain("Downloads beside the address bar");
    expect(orderedSteps[3]?.textContent).toContain("Import Question");
    expect(orderedSteps[4]?.textContent).toContain("Edit Actions");
    expect(orderedSteps[4]?.textContent).toContain("Favorites");
    expect(registrationRequests).toEqual(["/api/register/synthetic-invite/redeem:POST"]);

    const codeStep = orderedSteps[0];
    const code = codeStep?.querySelector('[aria-label="Private device code"]') as
      (BehaviorElement & { value?: string }) | null;
    expect(code?.value).toBe("synthetic-private-code");
    expect(registrationPageSource).toMatch(/aria-label="Private device code"[\s\S]*?readOnly/);
    const copyButton = codeStep?.querySelector("button");
    expect(copyButton?.textContent).toBe("Copy device code");
    expect(
      orderedSteps
        .slice(1)
        .every(
          (step) =>
            step.querySelector('[aria-label="Private device code"]') === null &&
            step.querySelector("button") === null,
        ),
    ).toBe(true);

    const downloadStep = orderedSteps[1];
    const download = downloadStep?.querySelector("a.primary-action");
    expect(download?.textContent).toBe("Download Upload to WHT");
    expect(download?.getAttribute("href")).toBe("/api/shortcut/download");
    expect(orderedSteps[0]?.querySelector("a.primary-action")).toBeNull();
    expect(
      orderedSteps
        .slice(2)
        .every(
          (step) =>
            step.querySelector("a.primary-action") === null ||
            step.querySelector("a.primary-action")?.getAttribute("href") === "/",
        ),
    ).toBe(true);
    const playStep = orderedSteps[5];
    expect(playStep?.querySelector("a.primary-action")?.textContent).toBe("Play");
    expect(playStep?.querySelector("a.primary-action")?.getAttribute("href")).toBe("/");
    expect(
      orderedSteps[4]?.querySelectorAll("img").map((image) => image.getAttribute("src")),
    ).toEqual([
      "/images/player-help/safari-share-button.jpg",
      "/images/player-help/edit-actions-button.jpg",
    ]);

    await act(async () => copyButton?.click());
    await flushBehavior();
    expect(writeText).toHaveBeenCalledWith("synthetic-private-code");
    expect(codeStep?.querySelector('[role="status"]')?.textContent).toContain(
      "Private device code copied.",
    );
    expect(rendered.container.textContent).toContain("signed in on this browser");
    expect(rendered.container.textContent).toContain("Never share your configured copy.");
    expect(stylesSource).toMatch(/\.registration-step-flow\s*\{[^}]*list-style:\s*none/s);
    expect(stylesSource).toMatch(
      /\.registration-step-card\s*\{[^}]*border:\s*1px solid[^}]*border-radius:/s,
    );
    expect(stylesSource).toMatch(
      /\.registration-step-card \.private-code\s*\{[^}]*width:\s*100%[^}]*min-height:\s*48px[^}]*border:/s,
    );
    expect(stylesSource).toMatch(/\.app-shell\s*\{[^}]*safe-area-inset-bottom/s);
  });

  it("shows three complete accessible player-help topics with exact scripting-permission guidance", async () => {
    const rendered = await renderBehavior(createElement(PlayerHelp));
    const topics = rendered.container.querySelectorAll("details");

    expect(topics).toHaveLength(3);
    expect(topics.map((topic) => topic.querySelector("summary")?.textContent)).toEqual([
      "Set up Upload to WHT",
      "Share a completed game",
      "Fix a scripting security-settings error",
    ]);

    for (const topic of topics) {
      const directElements = topic.childNodes.filter(
        (child): child is BehaviorElement => child instanceof BehaviorElement,
      );
      expect(directElements.map((child) => child.tagName)).toEqual(["SUMMARY", "DIV"]);
      const content = topic.querySelector(".player-help-topic__content");
      expect(content).not.toBeNull();
      for (const selector of ["p", "ol", "ul", "img", "figure", "figcaption"]) {
        const topicElements = topic.querySelectorAll(selector);
        const contentElements = content?.querySelectorAll(selector) ?? [];
        expect(topicElements.every((element) => contentElements.includes(element))).toBe(true);
      }
    }

    const setupText = topics[0]?.textContent ?? "";
    expect(setupText).toContain(
      "If you have not received an invitation, contact the administrator.",
    );
    expect(setupText).not.toContain("existing player");
    expect(setupText).not.toContain("replacement device");

    const sharing = topics[1];
    const sharingText = sharing?.textContent ?? "";
    expect(sharingText).toContain("Choose Upload to WHT and submit your score.");
    expect(sharingText).toContain(
      "After submission, your daily leaderboard text is copied for you.",
    );
    expect(sharingText).toContain("Edit Actions");
    expect(sharingText).toContain("Favorites");
    expect(sharingText).not.toContain("Cancel");
    expect(sharingText).not.toContain("overwrite");

    const images = sharing?.querySelectorAll("img") ?? [];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/images/player-help/krillion-share.jpg",
      "/images/player-help/maptap-share.jpg",
      "/images/player-help/safari-share-button.jpg",
      "/images/player-help/edit-actions-button.jpg",
    ]);
    expect(images.map((image) => image.getAttribute("alt"))).toEqual([
      "Safari Share button on a completed Krillion result page",
      "MapTap Share your score button highlighted below the finished game",
      "Safari bottom toolbar with the Share button highlighted",
      "Edit Actions button in Safari's share sheet",
    ]);
    expect(images.every((image) => image.className.includes("player-help-image"))).toBe(true);
    expect(stylesSource).toMatch(/\.player-help-image\s*\{[^}]*max-width:\s*100%/s);
    expect(stylesSource).toMatch(/\.player-help-image\s*\{[^}]*height:\s*auto/s);

    const scripting = topics[2];
    const scriptingText = scripting?.textContent?.replace(/\s+/g, " ") ?? "";
    expect(scriptingText).toContain("Could not run “Run JavaScript on Web Page”");
    expect(scriptingText).toContain(
      "This shortcut cannot be run because this action is a scripting action and your Shortcuts security settings don’t allow you to run scripting actions.",
    );
    expect(scriptingText).toContain("reads the shared Krillion result");

    const procedure = scripting?.querySelector("ol")?.querySelectorAll("li") ?? [];
    expect(
      procedure.map((step) =>
        step.textContent
          ?.replace(/\s+/g, " ")
          .replace("Search Settings for Shortcuts and tap its result.", "")
          .replace("Turn on Allow Running Scripts.", "")
          .trim(),
      ),
    ).toEqual([
      "On your iPhone, open Settings, search for “Shortcuts,” and tap the Shortcuts result.",
      "Open Shortcuts settings, then Advanced.",
      "Turn on “Allow Running Scripts.”",
      "Return to the completed Krillion game in Safari and retry Share → Upload to WHT.",
    ]);

    const scriptingImages = scripting?.querySelectorAll("img") ?? [];
    expect(scriptingImages.map((image) => image.getAttribute("src"))).toEqual([
      "/images/player-help/scripting-security-error.jpg",
      "/images/player-help/shortcuts-settings-search.jpg",
      "/images/player-help/allow-running-scripts.jpg",
    ]);
    expect(scriptingImages.map((image) => image.getAttribute("alt"))).toEqual([
      "Krillion in Safari showing the Run JavaScript on Web Page security error",
      "iPhone Settings search results with Shortcuts selected",
      "Shortcuts Advanced settings with Allow Running Scripts turned on",
    ]);
    expect(
      (scripting?.querySelectorAll("figcaption") ?? []).map((caption) =>
        caption.textContent?.replace(/\s+/g, " ").trim(),
      ),
    ).toEqual([
      "The scripting-security-settings error appears while sharing a completed Krillion result.",
      "Search Settings for Shortcuts and tap its result.",
      "Turn on Allow Running Scripts.",
    ]);
    for (const image of scriptingImages) {
      expect(image.className).toContain("player-help-image");
    }
    expect(scriptingText).not.toMatch(
      /Allow Sharing Large Amounts of Data|Allow Deleting Without Confirmation|Allow Deleting Large Amounts of Data/i,
    );
    expect(scriptingText).not.toMatch(/\b(?:rebuild|sign(?:ing)?|change the Shortcut)\b/i);
  });

  it("keeps Play focused on the two Upload to WHT share paths", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path === "/api/health") return Response.json({ status: "ok" });
        if (path === "/api/games") {
          return Response.json({
            games: [
              { id: "krillion", title: "Krillion", icon: "🦐", rounds: 7 },
              { id: "maptap", title: "MapTap", icon: "🌎", rounds: 5 },
            ],
          });
        }
        throw new Error(`Unexpected app request: ${path}`);
      }),
    );
    const rendered = await renderBehavior(createElement(App), "/");
    await flushBehavior();

    const paths = rendered.container.querySelector("ol.share-steps")?.querySelectorAll("li");
    expect(paths?.map((step) => step.textContent)).toEqual([
      "Krillion: finish the game in Safari, then tap Share on its completed results page.",
      "MapTap: in the game, tap Share your score.",
      "Choose Upload to WHT, then submit your score.",
    ]);
    const fallback = rendered.container.querySelector(".missing-share-action-help");
    expect(fallback?.textContent).toBe(
      "If Upload to WHT is missing from the share sheet: See the setup and sharing help below.",
    );
    expect(rendered.container.textContent.indexOf("MapTap: in the game")).toBeLessThan(
      rendered.container.textContent.indexOf(fallback?.textContent ?? "missing fallback"),
    );
    expect(rendered.container.querySelectorAll("details")).toHaveLength(3);

    const homeText = rendered.container.textContent;
    expect(homeText).not.toContain("Login with Device");
    expect(homeText).not.toContain("Supported Shortcut link unavailable");
    expect(homeText).not.toContain("Registration is invitation-only.");
    expect(homeText).not.toContain("No screenshots, OCR, PINs, passwords");
    expect(homeText).not.toContain("manual score entry");
  });

  it("omits the User redownload card while retaining stats and logout", async () => {
    const logout = vi.fn(async () => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/user/stats") {
          return Response.json(
            userStats({
              games: [
                {
                  key: "krillion",
                  display_name: "Krillion",
                  icon: "🦐",
                  total: 4321,
                  games_played: 2,
                  average: 2160.5,
                  rank: 3,
                },
              ],
              install_url: "/api/shortcut/download",
            }),
          );
        }
        throw new Error(`Unexpected User request: ${String(input)}`);
      }),
    );
    const rendered = await renderBehavior(
      createElement(UserPage, {
        player: testPlayer,
        busy: false,
        logout,
        sessionExpired: vi.fn(),
      }),
      "/user",
    );
    await flushBehavior();

    expect(rendered.container.querySelector(".user-shortcut-card")).toBeNull();
    expect(rendered.container.querySelectorAll('a[href="/api/shortcut/download"]')).toHaveLength(0);
    expect(rendered.container.textContent).toContain("Krillion");
    expect(rendered.container.textContent).toContain("4,321");
    expect(rendered.container.textContent).toContain("2160.50");
    expect(rendered.container.textContent).toContain("#3");
    const logoutButton = buttonWithText(rendered.container, "Log out");
    await act(async () => logoutButton.click());
    expect(logout).toHaveBeenCalledOnce();
    expect(userPageSource).toMatch(/explicitly approved future device-code\s+creation\s+feature/);
  });
});
