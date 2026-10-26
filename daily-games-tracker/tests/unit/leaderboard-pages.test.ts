import { readFileSync } from "node:fs";
import { act, createElement, type ElementType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  allTimeDateLabel,
  createLeaderboardCopyController,
  historicalScoreLink,
  krillionRoundEmoji,
  parseDailyRoute,
} from "../../src/pages/LeaderboardPages";
import * as leaderboardPageModule from "../../src/pages/LeaderboardPages";

const styles = readFileSync(new URL("../../src/styles.css", import.meta.url), "utf8");
const pageSource = readFileSync(
  new URL("../../src/pages/LeaderboardPages.tsx", import.meta.url),
  "utf8",
);

function cssBlock(selector: string): string {
  const normalizedStyles = styles.replace(/\s+/g, " ");
  const normalizedSelector = selector.replace(/\s+/g, " ").trim();
  const escapedSelector = normalizedSelector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = normalizedStyles.match(
    new RegExp(`(?:^|})\\s*${escapedSelector}\\s*\\{([^{}]*)\\}`),
  );

  expect(match, `Expected CSS block for ${selector}`).not.toBeNull();
  return match?.[1] ?? "";
}

interface DailyPlayerForOrdering {
  id: string;
  display_name: string;
  daily_score: number | null;
}

interface LeaderboardPageModuleForOrdering {
  orderDailyPlayers?: (players: DailyPlayerForOrdering[]) => DailyPlayerForOrdering[];
}

interface LeaderboardPageModuleForRendering {
  AllTimeGameTable?: ElementType;
  AllTimeLeaderboardPage?: ElementType;
  DailyGameTable?: ElementType;
}

class FakeEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly key?: string;
  target: FakeElement | FakeDocument | null = null;
  currentTarget: FakeElement | FakeDocument | null = null;
  defaultPrevented = false;

  constructor(type: string, init: { bubbles?: boolean; cancelable?: boolean; key?: string } = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? false;
    this.cancelable = init.cancelable ?? false;
    this.key = init.key;
  }

  preventDefault(): void {
    if (this.cancelable) this.defaultPrevented = true;
  }

  composedPath(): Array<FakeElement | FakeDocument> {
    const path: Array<FakeElement | FakeDocument> = [];
    let current = this.target;
    while (current) {
      path.push(current);
      current = current instanceof FakeElement ? current.parentNode : null;
    }
    return path;
  }
}

type FakeListener = (event: FakeEvent) => void;

class FakeNode {
  readonly nodeType: number;
  ownerDocument: FakeDocument;
  parentNode: FakeElement | FakeDocument | null = null;
  childNodes: FakeNode[] = [];
  private textValue: string | null = null;

  constructor(nodeType: number, ownerDocument: FakeDocument) {
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

  appendChild<T extends FakeNode>(child: T): T {
    this.textValue = null;
    child.parentNode = this as unknown as FakeElement | FakeDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends FakeNode>(child: T, before: FakeNode | null): T {
    this.textValue = null;
    child.parentNode = this as unknown as FakeElement | FakeDocument;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(node: FakeNode): boolean {
    return this === node || this.childNodes.some((child) => child.contains(node));
  }
}

class FakeTextNode extends FakeNode {
  constructor(value: string, ownerDocument: FakeDocument) {
    super(3, ownerDocument);
    this.textContent = value;
  }
}

class FakeElement extends FakeNode {
  readonly tagName: string;
  readonly nodeName: string;
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, FakeListener[]>();
  className = "";
  disabled = false;
  value = "";

  constructor(tagName: string, ownerDocument: FakeDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
  }

  setAttribute(name: string, value: string | boolean): void {
    const normalizedValue = String(value);
    this.attributes.set(name, normalizedValue);
    if (name === "class") this.className = normalizedValue;
    if (name === "disabled") this.disabled = true;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  click(): void {
    if (!this.disabled)
      this.dispatchEvent(new FakeEvent("click", { bubbles: true, cancelable: true }));
  }

  focus(): void {
    this.ownerDocument.activeElement = this;
  }

  getBoundingClientRect(): { width: number; height: number } {
    return {
      width: this.ownerDocument.resizeWidth,
      height: 100,
    };
  }

  querySelectorAll(selector: string): FakeElement[] {
    const matches: FakeElement[] = [];
    const visit = (node: FakeNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof FakeElement) {
          if (child.matches(selector)) matches.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  matches(selector: string): boolean {
    const match = selector.match(/^([a-z0-9-]+)?(?:\.([\w-]+))?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);
    if (!match) throw new Error(`Unsupported fake selector: ${selector}`);
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

class FakeDocument extends FakeNode {
  readonly documentElement: FakeElement;
  readonly body: FakeElement;
  readonly defaultView: Record<string, unknown>;
  readonly listeners = new Map<string, FakeListener[]>();
  resizeWidth = 400;
  activeElement: FakeElement | null = null;

  constructor() {
    super(9, null as unknown as FakeDocument);
    this.ownerDocument = this;
    this.defaultView = {};
    this.documentElement = new FakeElement("html", this);
    this.body = new FakeElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): FakeElement {
    return this.createElement(tagName);
  }

  createTextNode(value: string): FakeTextNode {
    return new FakeTextNode(value, this);
  }

  addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: FakeListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: FakeEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  querySelectorAll(selector: string): FakeElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector: string): FakeElement | null {
    return this.documentElement.querySelector(selector);
  }
}

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  private readonly callback: (entries: Array<{ contentRect: { width: number } }>) => void;

  constructor(callback: (entries: Array<{ contentRect: { width: number } }>) => void) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }

  observe(): void {}

  disconnect(): void {}

  notify(width: number): void {
    this.callback([{ contentRect: { width } }]);
  }
}

function installFakeDom(): { container: FakeElement; document: FakeDocument } {
  const fakeDocument = new FakeDocument();
  fakeDocument.defaultView["document"] = fakeDocument;
  fakeDocument.defaultView["HTMLElement"] = FakeElement;
  fakeDocument.defaultView["HTMLIFrameElement"] = class {};
  fakeDocument.defaultView["SVGElement"] = FakeElement;
  fakeDocument.defaultView["Node"] = FakeNode;
  Object.assign(globalThis, {
    document: fakeDocument,
    window: fakeDocument.defaultView,
    ResizeObserver: FakeResizeObserver,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  FakeResizeObserver.instances = [];
  const container = fakeDocument.createElement("div");
  fakeDocument.body.appendChild(container);
  return { container, document: fakeDocument };
}

function renderStatic(component: unknown, props: Record<string, unknown>): string {
  expect(component).toBeTypeOf("function");
  return renderToStaticMarkup(createElement(component as ElementType, props));
}

async function renderInteractive(
  children: ReactNode,
): Promise<{ container: FakeElement; document: FakeDocument; root: { unmount: () => void } }> {
  const { container, document: fakeDocument } = installFakeDom();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement("div", null, children));
  });
  return { container, document: fakeDocument, root };
}

function allTimeGameFixture(key: "krillion" | "maptap") {
  const playerId = `${key}-ada`;
  return {
    key,
    display_name: key === "krillion" ? "Krillion" : "MapTap",
    icon: key === "krillion" ? "🏮" : "🗺️",
    round_count: 1,
    players: [
      {
        id: playerId,
        display_name: key === "krillion" ? "Ada Krillion" : "Ada MapTap",
        total: key === "krillion" ? 101 : 202,
        games_played: 2,
        average: key === "krillion" ? 50.5 : null,
        rank: 1,
        badge: "🥇",
        movement: "📈" as const,
      },
    ],
    days: [
      {
        date: "2026-10-24",
        external_puzzle_key: key === "krillion" ? "101" : null,
        scores: { [playerId]: 0 },
      },
      {
        date: "2026-10-23",
        external_puzzle_key: null,
        scores: { [playerId]: null },
      },
      {
        date: "2026-10-22",
        external_puzzle_key: null,
        scores: {},
      },
      {
        date: "2026-10-21",
        external_puzzle_key: null,
        scores: { [playerId]: 42 },
      },
      {
        date: "2026-10-20",
        external_puzzle_key: null,
        scores: { [playerId]: 7 },
      },
      {
        date: "2026-10-19",
        external_puzzle_key: null,
        scores: { [playerId]: 9 },
      },
    ],
  };
}

function allTimeResponseFixture() {
  return {
    status: "ok" as const,
    as_of_date: "2026-10-24",
    games: [allTimeGameFixture("krillion"), allTimeGameFixture("maptap")],
  };
}

function installAllTimeFetch() {
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: unknown) => {
    requests.push(String(input));
    return {
      headers: { get: () => "application/json" },
      ok: true,
      json: async () => allTimeResponseFixture(),
    } as unknown as Response;
  }) as typeof fetch;

  return {
    requests,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

function dailyGameFixture(key: "krillion" | "maptap") {
  const playerId = `${key}-ada`;
  return {
    key,
    display_name: key === "krillion" ? "Krillion" : "MapTap",
    icon: key === "krillion" ? "🏮" : "🗺️",
    round_count: 1,
    external_puzzle_key: key === "krillion" ? "101" : null,
    locked: false,
    players: [
      {
        id: playerId,
        display_name: key === "krillion" ? "Ada Krillion" : "Ada MapTap",
        daily_score: 0,
        rank: 1,
        badge: "🥇",
        rounds: [
          {
            round_number: 1,
            prompt: key === "maptap" ? "Prompt" : null,
            answer: key === "krillion" ? "Answer" : null,
            raw_score: 0,
            original_emoji: key === "krillion" ? "🧩" : "📍",
          },
        ],
      },
      {
        id: `${key}-missing`,
        display_name: "Missing Player",
        daily_score: null,
        rank: null,
        badge: null,
        rounds: [],
      },
    ],
  };
}

describe("rendered leaderboard behavior", () => {
  const renderingModule = leaderboardPageModule as unknown as LeaderboardPageModuleForRendering;

  it("renders both daily games independently with zero scores and sparse players", () => {
    const krillionMarkup = renderStatic(renderingModule.DailyGameTable, {
      game: dailyGameFixture("krillion"),
      date: "2026-10-24",
    });
    const mapTapMarkup = renderStatic(renderingModule.DailyGameTable, {
      game: dailyGameFixture("maptap"),
      date: "2026-10-24",
    });

    expect(krillionMarkup).toContain(
      'class="leaderboard-card live-leaderboard krillion-daily-leaderboard"',
    );
    expect(krillionMarkup).toContain('class="round-result krillion-result"');
    expect(krillionMarkup).toContain('aria-label="Ada Krillion R1 score: 0"');
    expect(krillionMarkup).toContain("Not played");
    expect(mapTapMarkup).toContain(
      'class="leaderboard-card live-leaderboard maptap-daily-leaderboard"',
    );
    expect(mapTapMarkup).toContain('class="round-result"');
    expect(mapTapMarkup).toContain("<strong>0</strong>");
    expect(mapTapMarkup).toContain("Prompt");
    expect(mapTapMarkup).toContain("Not played");
  });

  it("renders zero and nonzero all-time scores as accessible daily links while keeping sparse scores muted", () => {
    const krillionMarkup = renderStatic(renderingModule.AllTimeGameTable, {
      game: allTimeGameFixture("krillion"),
    });
    const mapTapMarkup = renderStatic(renderingModule.AllTimeGameTable, {
      game: allTimeGameFixture("maptap"),
    });

    expect(krillionMarkup).toContain(
      'href="/daily/2026-10-24" aria-label="Ada Krillion score on Oct 24, 2026: 0"',
    );
    expect(krillionMarkup).toContain(
      'href="/daily/2026-10-21" aria-label="Ada Krillion score on Oct 21, 2026: 42"',
    );
    expect(krillionMarkup).toContain('class="cell-muted">—</td>');
    expect(mapTapMarkup).toContain(
      'href="/daily/2026-10-24" aria-label="Ada MapTap score on Oct 24, 2026: 0"',
    );
    expect(mapTapMarkup).toContain('href="/daily/2026-10-21"');
  });

  it("shares one all-time date window and maps arrows to newer and older windows", async () => {
    const { AllTimeLeaderboardPage } = renderingModule;
    const fetchState = installAllTimeFetch();
    const { container, root } = await renderInteractive(
      createElement(AllTimeLeaderboardPage as ElementType),
    );
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      const krillion = container.querySelector('section[aria-labelledby="all-time-krillion"]');
      const mapTap = container.querySelector('section[aria-labelledby="all-time-maptap"]');
      expect(krillion).not.toBeNull();
      expect(mapTap).not.toBeNull();
      if (!krillion || !mapTap) return;

      const controls = container.querySelectorAll(".daily-date-nav");
      const krillionNewer = container.querySelector(
        'button[aria-label="Next all-time date window"]',
      );
      const krillionOlder = container.querySelector(
        'button[aria-label="Previous all-time date window"]',
      );
      expect(controls).toHaveLength(1);
      expect(
        controls[0]?.querySelectorAll("button").map((button) => button.getAttribute("aria-label")),
      ).toEqual(["Next all-time date window", "Previous all-time date window"]);
      expect(krillionNewer?.disabled).toBe(true);
      expect(krillionOlder?.disabled).toBe(false);
      expect(fetchState.requests).toEqual(["/api/leaderboards/all-time"]);
      expect(
        krillion.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual([
        "/daily/2026-10-24",
        "/daily/2026-10-23",
        "/daily/2026-10-22",
        "/daily/2026-10-21",
      ]);

      await act(async () => krillionOlder?.click());
      expect(krillionOlder?.disabled).toBe(true);
      expect(krillionNewer?.disabled).toBe(false);
      expect(
        krillion.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-20", "/daily/2026-10-19"]);
      expect(
        mapTap.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-20", "/daily/2026-10-19"]);
      expect(fetchState.requests).toEqual(["/api/leaderboards/all-time"]);

      await act(async () => krillionNewer?.click());
      expect(krillionOlder?.disabled).toBe(false);
      expect(krillionNewer?.disabled).toBe(true);
      expect(
        mapTap.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual([
        "/daily/2026-10-24",
        "/daily/2026-10-23",
        "/daily/2026-10-22",
        "/daily/2026-10-21",
      ]);
    } finally {
      await act(async () => root.unmount());
      fetchState.restore();
    }
  });

  it("normalizes the shared window when ResizeObserver crosses four and five columns", async () => {
    const { AllTimeLeaderboardPage } = renderingModule;
    const fetchState = installAllTimeFetch();
    const { container, root } = await renderInteractive(
      createElement(AllTimeLeaderboardPage as ElementType),
    );
    try {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      const krillion = container.querySelector('section[aria-labelledby="all-time-krillion"]');
      const mapTap = container.querySelector('section[aria-labelledby="all-time-maptap"]');
      expect(krillion).not.toBeNull();
      expect(mapTap).not.toBeNull();
      if (!krillion || !mapTap) return;

      await act(async () =>
        container.querySelector('button[aria-label="Previous all-time date window"]')?.click(),
      );
      expect(
        krillion.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-20", "/daily/2026-10-19"]);

      await act(async () => FakeResizeObserver.instances[0]?.notify(500));
      expect(
        krillion.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-19"]);
      expect(
        mapTap.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-19"]);
      expect(
        container.querySelector('button[aria-label="Previous all-time date window"]')?.disabled,
      ).toBe(true);

      await act(async () => FakeResizeObserver.instances[0]?.notify(400));
      expect(
        krillion.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-20", "/daily/2026-10-19"]);
      expect(
        mapTap.querySelectorAll("a.all-time-date-link").map((link) => link.getAttribute("href")),
      ).toEqual(["/daily/2026-10-20", "/daily/2026-10-19"]);
    } finally {
      await act(async () => root.unmount());
      fetchState.restore();
    }
  });

  it("toggles an all-time player popover and closes it on Escape", async () => {
    const { AllTimeGameTable } = renderingModule;
    const {
      container,
      document: fakeDocument,
      root,
    } = await renderInteractive(
      createElement(AllTimeGameTable as ElementType, { game: allTimeGameFixture("maptap") }),
    );
    try {
      const playerButton = container.querySelector("button.all-time-player-name");
      expect(playerButton?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('[role="tooltip"]')).toBeNull();

      await act(async () => playerButton?.click());
      expect(playerButton?.getAttribute("aria-expanded")).toBe("true");
      expect(container.querySelector('[role="tooltip"]')?.textContent).toContain("202");

      await act(async () =>
        fakeDocument.dispatchEvent(new FakeEvent("keydown", { key: "Escape" })),
      );
      expect(playerButton?.getAttribute("aria-expanded")).toBe("false");
      expect(container.querySelector('[role="tooltip"]')).toBeNull();
    } finally {
      await act(async () => root.unmount());
    }
  });
});

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("leaderboard page helpers", () => {
  it("derives Krillion's display emoji from the persisted raw score", () => {
    expect(krillionRoundEmoji(85, null)).toBe("🏮");
  });

  it("falls back safely when a Krillion score is outside the shared mapping", () => {
    expect(krillionRoundEmoji(42, "🧩")).toBe("🧩");
    expect(krillionRoundEmoji(42, null)).toBe("—");
  });

  it("distinguishes an absent date from an explicit invalid route date", () => {
    expect(parseDailyRoute("/daily", "")).toEqual({ date: null, invalidDate: false });
    expect(parseDailyRoute("/daily/2026-02-30", "")).toEqual({
      date: null,
      invalidDate: true,
    });
  });

  it("keeps valid legacy query dates available for canonicalization", () => {
    expect(parseDailyRoute("/daily", "?date=2026-02-28")).toEqual({
      date: "2026-02-28",
      invalidDate: false,
    });
  });

  it("links every played historical score, including zero, with an accessible name", () => {
    expect(historicalScoreLink("2026-02-28", "Ada", 0)).toEqual({
      href: "/daily/2026-02-28",
      ariaLabel: "Ada score on Feb 28, 2026: 0",
    });
    expect(historicalScoreLink("2026-02-28", "Ada", null)).toBeNull();
  });

  it("formats all-time date labels exactly as MM/DD", () => {
    expect(allTimeDateLabel("2026-02-08")).toBe("02/08");
  });

  it("orders daily players by descending score while keeping zero valid and null last", () => {
    const orderDailyPlayers = (leaderboardPageModule as unknown as LeaderboardPageModuleForOrdering)
      .orderDailyPlayers;

    expect(orderDailyPlayers).toBeTypeOf("function");
    if (!orderDailyPlayers) return;

    expect(
      orderDailyPlayers([
        { id: "null-score", display_name: "Zoe", daily_score: null },
        { id: "zero-score", display_name: "Alex", daily_score: 0 },
        { id: "high-score", display_name: "Sam", daily_score: 100 },
        { id: "mid-score", display_name: "Bea", daily_score: 50 },
      ]).map((player) => player.id),
    ).toEqual(["high-score", "mid-score", "zero-score", "null-score"]);
  });

  it("breaks equal daily scores by display name and then player id", () => {
    const orderDailyPlayers = (leaderboardPageModule as unknown as LeaderboardPageModuleForOrdering)
      .orderDailyPlayers;

    expect(orderDailyPlayers).toBeTypeOf("function");
    if (!orderDailyPlayers) return;

    expect(
      orderDailyPlayers([
        { id: "zoe", display_name: "Zoe", daily_score: 50 },
        { id: "alex-b", display_name: "Alex", daily_score: 50 },
        { id: "alex-a", display_name: "Alex", daily_score: 50 },
      ]).map((player) => player.id),
    ).toEqual(["alex-a", "alex-b", "zoe"]);
  });
});

describe("leaderboard copy state", () => {
  it("copies canonical server text and reports success", async () => {
    const states: Array<{ date: string | null; status: string }> = [];
    const copiedText: string[] = [];
    const controller = createLeaderboardCopyController(
      async () => ({ status: "ok" as const, date: "2026-10-22", scoreboard_text: "canonical" }),
      async (text: string) => {
        copiedText.push(text);
        return true;
      },
      (state: { date: string | null; status: string }) => states.push(state),
    );

    await controller.start("2026-10-22");

    expect(copiedText).toEqual(["canonical"]);
    expect(states).toEqual([
      { date: "2026-10-22", status: "copying" },
      { date: "2026-10-22", status: "success" },
    ]);
  });

  it("reports a failed clipboard write", async () => {
    const states: Array<{ date: string | null; status: string }> = [];
    const controller = createLeaderboardCopyController(
      async () => ({ status: "ok" as const, date: "2026-10-22", scoreboard_text: "canonical" }),
      async () => false,
      (state: { date: string | null; status: string }) => states.push(state),
    );

    await controller.start("2026-10-22");

    expect(states[states.length - 1]).toEqual({ date: "2026-10-22", status: "error" });
  });

  it("reports an API rejection without attempting a clipboard write", async () => {
    const states: Array<{ date: string | null; status: string }> = [];
    let copyCalls = 0;
    const controller = createLeaderboardCopyController(
      async () => {
        throw new Error("API unavailable");
      },
      async () => {
        copyCalls += 1;
        return true;
      },
      (state: { date: string | null; status: string }) => states.push(state),
    );

    await controller.start("2026-10-22");

    expect(copyCalls).toBe(0);
    expect(states[states.length - 1]).toEqual({ date: "2026-10-22", status: "error" });
  });

  it("suppresses stale A-to-B-to-A responses before they can copy old text", async () => {
    const states: Array<{ date: string | null; status: string }> = [];
    const copiedText: string[] = [];
    const responses = [
      deferred<{ status: "ok"; date: string; scoreboard_text: string }>(),
      deferred<{ status: "ok"; date: string; scoreboard_text: string }>(),
      deferred<{ status: "ok"; date: string; scoreboard_text: string }>(),
    ];
    let requestNumber = 0;
    const controller = createLeaderboardCopyController(
      async () => responses[requestNumber++].promise,
      async (text: string) => {
        copiedText.push(text);
        return true;
      },
      (state: { date: string | null; status: string }) => states.push(state),
    );

    const firstA = controller.start("2026-10-22");
    controller.invalidate();
    const b = controller.start("2026-10-23");
    controller.invalidate();
    const secondA = controller.start("2026-10-22");

    responses[0].resolve({ status: "ok", date: "2026-10-22", scoreboard_text: "old A" });
    responses[1].resolve({ status: "ok", date: "2026-10-23", scoreboard_text: "old B" });
    responses[2].resolve({ status: "ok", date: "2026-10-22", scoreboard_text: "current A" });
    await Promise.all([firstA, b, secondA]);

    expect(copiedText).toEqual(["current A"]);
    expect(states[states.length - 1]).toEqual({ date: "2026-10-22", status: "success" });
    expect(states).not.toContainEqual({ date: "2026-10-23", status: "success" });
  });
});

describe("worldwide daily navigation", () => {
  it("uses the latest accepted worldwide date for navigation and picker limits", () => {
    expect(pageSource).toMatch(/disabled=\{result\.date >= result\.latest_available_day\}/);
    expect(pageSource).toMatch(/max=\{result\.latest_available_day\}/);
  });

  it("uses the selected date in locked-game fallback instructions", () => {
    expect(pageSource).toMatch(
      /Play and submit the \$\{date\} \$\{game\.display_name\} result to unlock this table\./,
    );
    expect(pageSource).not.toMatch(/Play and submit today's \$\{game\.display_name\}/);
    expect(pageSource).toMatch(/selected challenge date/);
    expect(pageSource).toContain("Challenge date");
  });
});

describe("leaderboard layout contracts", () => {
  it("gates Copy Leaderboard on the daily response eligibility flag", () => {
    expect(pageSource).toMatch(/copy_eligible:\s*boolean/);
    expect(pageSource).toMatch(
      /result\.copy_eligible[\s\S]*?<button[\s\S]*?type="button"[\s\S]*?>[\s\S]*?Copy Leaderboard[\s\S]*?<\/button>/,
    );
  });

  it("requests the selected date and copies the server-generated text", () => {
    expect(pageSource).toMatch(
      /apiRequest<CopyLeaderboardResponse>\(\s*`\/api\/leaderboards\/copy\?date=\$\{encodeURIComponent\(copyDate\)\}`\s*,?\s*\)/,
    );
    expect(pageSource).toMatch(/copyController\.start\(result\.date\)/);
    expect(pageSource).toMatch(/copy\(response\.scoreboard_text\)/);
    expect(pageSource).toMatch(/\n\s*copyText,\n/);
    expect(pageSource).not.toMatch(/scoreboard_text\.(?:split|replace|join)\(/);
  });

  it("resets copy state for a new date and surfaces failed clipboard requests", () => {
    expect(pageSource).toMatch(/return \(\) => \{[\s\S]*?copyController\.invalidate\(\)/);
    expect(pageSource).not.toContain("copyStateForDate");
    expect(pageSource).toMatch(/Could not copy the leaderboard\. Try again\./);
    expect(pageSource).toMatch(/copyState\.status === "error"/);
  });

  it("provides a focused visual treatment for the copy control", () => {
    const copyControl = cssBlock(".leaderboard-copy-control");
    expect(copyControl).toMatch(/display:\s*inline-flex;/);
    expect(copyControl).toMatch(/min-height:\s*44px;/);
  });

  it("uses non-navigating button popovers for round prompts", () => {
    expect(pageSource).toMatch(
      /function InfoPopover[\s\S]*?<button[\s\S]*?type="button"[\s\S]*?aria-expanded=\{open\}[\s\S]*?aria-controls=\{id\}/,
    );
    expect(pageSource).toMatch(/<InfoPopover[\s\S]*?label=\{`R\$\{roundNumber\}`\}/);
    expect(pageSource).not.toMatch(/<InfoPopover[\s\S]*?label="Scoring"/);
    expect(pageSource).not.toMatch(/<a[^>]*>\s*R\$\{roundNumber\}/);
  });

  it("allows one open help popover and closes it with Escape", () => {
    expect(pageSource).toMatch(
      /const \[openPopover, setOpenPopover\] = useState<string \| null>\(null\);/,
    );
    expect(pageSource).toMatch(
      /setOpenPopover\(\(current\) => \(current === popoverId \? null : popoverId\)\)/,
    );
    expect(pageSource).toMatch(/event\.key === "Escape"[\s\S]*?setOpenPopover\(null\)/);
  });

  it("renders the open help panel at card level outside the table scroll branch", () => {
    const dailyGameTableSource = pageSource.slice(
      pageSource.indexOf("function DailyGameTable"),
      pageSource.indexOf("export function DailyLeaderboardPage"),
    );
    const panelIndex = dailyGameTableSource.indexOf(
      '<span id={openPopover} className="daily-info-popover-panel"',
    );
    const scrollMatch = dailyGameTableSource.match(
      /className="[^"]*daily-leaderboard-scroll[^"]*"/,
    );
    const scrollIndex = scrollMatch?.index ?? -1;

    expect(panelIndex).toBeGreaterThan(-1);
    expect(scrollIndex).toBeGreaterThan(-1);
    expect(panelIndex).toBeLessThan(scrollIndex);
    expect(dailyGameTableSource.slice(scrollIndex)).not.toContain("daily-info-popover-panel");
  });

  it("renders Krillion results as score-and-emoji buttons with accessible popover controls", () => {
    expect(pageSource).toMatch(
      /<button[\s\S]*?type="button"[\s\S]*?className="round-result krillion-result"[\s\S]*?aria-label=\{`\$\{player\.display_name\} R\$\{roundNumber\} score: \$\{round\.raw_score\}`\}[\s\S]*?aria-expanded=\{open\}[\s\S]*?aria-controls=\{popoverId\}/,
    );
    expect(pageSource).toMatch(
      /<strong>\{round\.raw_score\}<\/strong>[\s\S]*?<span aria-hidden="true">\{emoji\}<\/span>/,
    );
    expect(pageSource).not.toMatch(/<a[^>]*className="round-result krillion-result"/);
  });

  it("keeps answer and question popover content while removing scoring content", () => {
    expect(pageSource).toMatch(/daily-krillion-answer-/);
    expect(pageSource).toMatch(
      /\{`\$\{openAnswer\.player\.display_name\}'s R\$\{openAnswer\.round\.round_number\} Answer:`\}/,
    );
    expect(pageSource).toMatch(/\{openAnswer\.round\.answer \?\? "No answer"\}/);
    expect(pageSource).toMatch(/<strong>R\{openRoundNumber\} Question:<\/strong>/);
    expect(pageSource).not.toContain("Scoring");
  });

  it("keeps locked games free of protected round controls", () => {
    const lockedBranch = pageSource.match(
      /\{game\.locked \? \([\s\S]*?<div className="leaderboard-lock"[\s\S]*?\) :/,
    )?.[0];

    expect(lockedBranch).toBeDefined();
    expect(lockedBranch).not.toContain("InfoPopover");
    expect(lockedBranch).not.toContain("round-result");
  });

  it("keeps MapTap prompts in their existing inline header content", () => {
    expect(pageSource).toMatch(
      /game\.key === "krillion" \?[\s\S]*?<InfoPopover[\s\S]*?:\s*\([\s\S]*?<span>R\{roundNumber\}<\/span>[\s\S]*?prompt && <small>\{prompt\}<\/small>/,
    );
  });

  it("renders the daily table with Player followed by round columns", () => {
    expect(pageSource).toMatch(/<table className="leaderboard-table daily-table">/);
    expect(pageSource).toMatch(
      /<table className="leaderboard-table daily-table">[\s\S]*?<thead>[\s\S]*?<th className="sticky-column player-heading-column" scope="col">\s*Player\s*<\/th>[\s\S]*?roundNumbers\.map\(\(roundNumber\) => \{[\s\S]*?<th key=\{roundNumber\} scope="col" className="round-heading round-column">[\s\S]*?<InfoPopover[\s\S]*?label=\{`R\$\{roundNumber\}`\}/,
    );
  });

  it("renders daily players as body rows with existing daily cells under rounds", () => {
    expect(pageSource).toMatch(
      /<table className="leaderboard-table daily-table">[\s\S]*?<tbody>[\s\S]*?orderedPlayers\.map\(\(player\) => \([\s\S]*?<tr key=\{player\.id\}>[\s\S]*?<th className="sticky-column player-row-heading" scope="row">[\s\S]*?<\/th>[\s\S]*?roundNumbers\.map\(\(roundNumber\) => \{[\s\S]*?<td[\s\S]*?key=\{roundNumber\}[\s\S]*?dailyCell\(game, player, roundNumber, openPopover, togglePopover\)[\s\S]*?<\/td>/,
    );
  });

  it("removes the all-time top stats strip while preserving the page selectors", () => {
    const allTimePageSource = pageSource.slice(
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );
    const dailyPageSource = pageSource.slice(
      pageSource.indexOf("export function DailyLeaderboardPage"),
      pageSource.indexOf("function AllTimePlayerHeading"),
    );

    expect(allTimePageSource).not.toContain('className="stats-strip"');
    expect(allTimePageSource).not.toContain("Games tracked");
    expect(allTimePageSource).not.toContain("Updated through");
    expect(allTimePageSource).not.toContain('"LIVE"');
    expect(allTimePageSource).toContain(
      '<div className="date-strip daily-date-nav" aria-label="All-time date-window controls">',
    );
    expect(dailyPageSource).toContain('<div className="date-strip daily-date-nav">');
    expect(dailyPageSource).toContain('className="date-picker-label"');
  });

  it("transposes all-time history so active players are rows and visible dates are columns", () => {
    const allTimeGameTableSource = pageSource.slice(
      pageSource.indexOf("function AllTimeGameTable"),
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimeGameTableSource).toMatch(
      /<div\s+ref=\{allTimeScrollRef\}\s+className="leaderboard-scroll all-time-leaderboard-scroll"[\s\S]*?<table className="leaderboard-table all-time-table">/,
    );
    expect(allTimeGameTableSource).toMatch(
      /<th className="sticky-column player-column player-heading-column" scope="col">\s*Player\s*<\/th>[\s\S]*?visibleDays\.map\(\(day\) =>/,
    );
    expect(allTimeGameTableSource).toMatch(
      /game\.players\.map\(\(player\) => \([\s\S]*?<th className="sticky-column player-column player-row-heading" scope="row">[\s\S]*?visibleDays\.map\(\(day\) =>/,
    );
    expect(allTimeGameTableSource).not.toMatch(
      /game\.days\.map\(\(day\) => \([\s\S]*?game\.players\.map/,
    );
  });

  it("measures five date columns with ResizeObserver and keeps a four-column fallback", () => {
    const allTimePageSource = pageSource.slice(
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimePageSource).toMatch(/useRef<HTMLDivElement>\(null\)/);
    expect(allTimePageSource).toMatch(/typeof ResizeObserver === "undefined"/);
    expect(allTimePageSource).toMatch(/new ResizeObserver\(/);
    expect(allTimePageSource).toMatch(/allTimeWindowSizeForWidth/);
    expect(allTimePageSource).toMatch(/createAllTimeDateWindow/);
    expect(allTimePageSource).toMatch(
      /const \[windowSize, setWindowSize\] = useState<AllTimeWindowSize>\(4\)/,
    );
  });

  it("renders one shared date-window control and passes its dates to both tables", () => {
    const allTimeGameTableSource = pageSource.slice(
      pageSource.indexOf("function AllTimeGameTable"),
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );
    const allTimePageSource = pageSource.slice(
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimePageSource).toMatch(
      /const \[windowStartIndex, setWindowStartIndex\] = useState\(0\)/,
    );
    expect(allTimePageSource).toMatch(/canMoveOlder/);
    expect(allTimePageSource).toMatch(/canMoveNewer/);
    expect(allTimePageSource).toMatch(/disabled=\{!dateWindow\.canMoveOlder\}/);
    expect(allTimePageSource).toMatch(/disabled=\{!dateWindow\.canMoveNewer\}/);
    expect(allTimePageSource).toMatch(/dateWindow\.startIndex \+ windowSize/);
    expect(allTimePageSource).toMatch(/dateWindow\.startIndex - windowSize/);
    expect(allTimePageSource).toMatch(/visibleDates=\{dateWindow\.dates\}/);
    expect(allTimePageSource.match(/className="date-strip daily-date-nav"/g)).toHaveLength(1);
    expect(allTimeGameTableSource).not.toContain("date-strip daily-date-nav");
    expect(allTimeGameTableSource).not.toContain("setWindowStartIndex");
  });

  it("uses the daily date-strip treatment for the shared all-time selector", () => {
    const allTimePageSource = pageSource.slice(
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimePageSource).toMatch(
      /<div className="date-strip daily-date-nav" aria-label="All-time date-window controls">/,
    );
    expect(allTimePageSource).toMatch(
      /<span className="date-strip-label all-time-date-range-label" aria-live="polite">\s*\{dateRangeLabel\}/,
    );
    expect(allTimePageSource).toContain('<span className="date-right">Date range</span>');
    expect(allTimePageSource).not.toContain("all-time-window-controls");
    expect(allTimePageSource).not.toContain("all-time-window-control");
    expect(allTimePageSource).not.toContain("all-time-window-range");

    expect(pageSource).toMatch(/<div className="date-strip daily-date-nav">/);
    expect(styles).toMatch(/\.daily-date-nav button\s*\{/);
    expect(styles).toMatch(/\.daily-date-nav button:disabled\s*\{/);
    expect(styles).not.toMatch(/\.all-time-window-controls\b/);
    expect(styles).not.toMatch(/\.all-time-window-control\b/);
    expect(styles).not.toMatch(/\.all-time-window-range\b/);
  });

  it("allows only the all-time date range label to wrap inside the shared strip", () => {
    const allTimePageSource = pageSource.slice(
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimePageSource).toMatch(
      /<span className="date-strip-label all-time-date-range-label" aria-live="polite">\s*\{dateRangeLabel\}/,
    );

    const dailyLabel = cssBlock(".date-strip-label");
    expect(dailyLabel).toMatch(/white-space:\s*nowrap;/);

    const allTimeLabel = cssBlock(".all-time-date-range-label");
    expect(allTimeLabel).toMatch(/flex:\s*1 1 auto;/);
    expect(allTimeLabel).toMatch(/min-width:\s*0;/);
    expect(allTimeLabel).toMatch(/white-space:\s*normal;/);
    expect(allTimeLabel).toMatch(/overflow-wrap:\s*anywhere;/);
  });

  it("uses the player-name button and card-level popover contract for all-time info", () => {
    const allTimePlayerHeadingSource = pageSource.slice(
      pageSource.indexOf("function AllTimePlayerHeading"),
      pageSource.indexOf("function AllTimeGameTable"),
    );
    const allTimeGameTableSource = pageSource.slice(
      pageSource.indexOf("function AllTimeGameTable"),
      pageSource.indexOf("export function AllTimeLeaderboardPage"),
    );

    expect(allTimePlayerHeadingSource).toMatch(
      /<button[\s\S]*?type="button"[\s\S]*?className="all-time-player-name"[\s\S]*?aria-expanded=\{open\}[\s\S]*?aria-controls=\{popoverId\}[\s\S]*?>[\s\S]*?player\.display_name[\s\S]*?<\/button>/,
    );
    expect(allTimeGameTableSource).toMatch(
      /\{openPlayer && \([\s\S]*?<div id=\{playerInfoId\} className="all-time-player-popover" role="tooltip">[\s\S]*?formatScore\(openPlayer\.total\)[\s\S]*?formatAverage\(openPlayer\.average\)[\s\S]*?<\/div>[\s\S]*?\)\}/,
    );
    expect(allTimeGameTableSource).toMatch(
      /const \[openPlayerId, setOpenPlayerId\] = useState<string \| null>\(null\);[\s\S]*?event\.key === "Escape"[\s\S]*?setOpenPlayerId\(null\)/,
    );
    expect(allTimeGameTableSource.indexOf("all-time-player-popover")).toBeLessThan(
      allTimeGameTableSource.indexOf("all-time-leaderboard-scroll"),
    );
  });

  it("uses MM/DD date links, visible full-date ranges, and Krillion puzzle labels", () => {
    const helperSource = pageSource.slice(
      pageSource.indexOf("export function allTimeDateLabel"),
      pageSource.indexOf("function shiftDate"),
    );

    expect(helperSource).toMatch(/month: "2-digit",[\s\S]*?day: "2-digit",/);
    expect(helperSource).not.toMatch(/year:/);
    expect(pageSource).toMatch(
      /<a[^>]*href=\{`\/daily\/\$\{day\.date\}`\}[^>]*>\s*<span>\{allTimeDateLabel\(day\.date\)\}<\/span>/,
    );
    expect(pageSource).toMatch(/game\.key === "krillion" && day\.external_puzzle_key/);
    expect(pageSource).toContain("<small>#{day.external_puzzle_key}</small>");
    expect(pageSource).toMatch(
      /shortDateLabel\(dateWindow\.dates\[dateWindow\.dates\.length - 1\]\)/,
    );
    expect(pageSource).toMatch(/shortDateLabel\(dateWindow\.dates\[0\]\)/);
  });

  it("derives ordered daily players before mapping the player rows", () => {
    expect(pageSource).toMatch(
      /function DailyGameTable[\s\S]*?const players = game\.players \?\? \[\];\s*const orderedPlayers = orderDailyPlayers\(players\);[\s\S]*?<tbody>[\s\S]*?orderedPlayers\.map\(\(player\) => \(/,
    );
  });

  it("lets daily leaderboards grow vertically while preserving horizontal safety", () => {
    const dailyScroll = cssBlock(".daily-leaderboard-scroll");
    expect(dailyScroll).toMatch(/max-height:\s*none;/);
    expect(dailyScroll).toMatch(/overflow-x:\s*auto;/);
    expect(dailyScroll).toMatch(/overflow-y:\s*visible;/);
    expect(dailyScroll).not.toMatch(/overflow:\s*auto;/);
  });

  it("keeps all-time history in page flow without internal vertical or horizontal scrolling", () => {
    const allTimeScroll = cssBlock(".all-time-leaderboard-scroll");
    expect(allTimeScroll).toMatch(/max-height:\s*none;/);
    expect(allTimeScroll).toMatch(/overflow-x:\s*visible;/);
    expect(allTimeScroll).toMatch(/overflow-y:\s*visible;/);
    expect(allTimeScroll).not.toMatch(/overflow:\s*auto;/);
  });

  it("keeps all-time tables inside the card gutter while preserving daily gutters and alignment", () => {
    const allTimeScroll = cssBlock(".all-time-leaderboard-scroll");
    expect(allTimeScroll).toMatch(/padding:\s*0 17px 17px;/);
    expect(allTimeScroll).not.toMatch(/padding-left:\s*0;/);
    expect(allTimeScroll).not.toMatch(/padding-right:\s*0;/);

    const dateStrip = cssBlock(".date-strip");
    expect(dateStrip).toMatch(/display:\s*flex;/);
    expect(dateStrip).toMatch(/background:\s*#172a21;/);
    expect(dateStrip).toMatch(/border:\s*1px solid #2b4034;/);
    expect(dateStrip).toMatch(/border-radius:\s*13px;/);

    const dailyDateNav = cssBlock(".daily-date-nav");
    expect(dailyDateNav).toMatch(/gap:\s*8px;/);

    const dailyScroll = cssBlock(".daily-leaderboard-scroll");
    expect(dailyScroll).toMatch(/max-height:\s*none;/);
    expect(dailyScroll).toMatch(/overflow-x:\s*auto;/);
    expect(dailyScroll).toMatch(/overflow-y:\s*visible;/);
    expect(dailyScroll).not.toMatch(/padding(?:-left|-right|-bottom)?\s*:/);

    const sharedScroll = cssBlock(".leaderboard-scroll");
    expect(sharedScroll).toMatch(/padding:\s*0 17px 17px;/);

    const stickyColumn = cssBlock(".leaderboard-table .sticky-column");
    expect(stickyColumn).toMatch(/left:\s*0;/);
  });

  it("keeps the responsive shell and leaderboard scroll gutters exact", () => {
    const appShell = cssBlock(".app-shell");
    expect(appShell).toMatch(
      /padding:\s*max\(env\(safe-area-inset-top\), 14px\) 22px calc\(env\(safe-area-inset-bottom\) \+ 112px\);/,
    );
    expect(styles).toMatch(
      /@media\s*\(min-width:\s*520px\)\s*\{[\s\S]*?\.app-shell\s*\{[\s\S]*?padding-left:\s*36px;[\s\S]*?padding-right:\s*36px;/,
    );

    const leaderboardScroll = cssBlock(".leaderboard-scroll");
    expect(leaderboardScroll).toMatch(/margin:\s*18px -17px -17px;/);
    expect(leaderboardScroll).toMatch(/padding:\s*0 17px 17px;/);
  });

  it("requires cssBlock selectors to match the full rule header", () => {
    expect(() => cssBlock(".sticky-column")).toThrow(/Expected CSS block for \.sticky-column/);
  });

  it("keeps the daily table within the viewport with shrinkable wrapping cells", () => {
    const dailyTable = cssBlock(".daily-table");
    expect(dailyTable).toMatch(/width:\s*100%;/);
    expect(dailyTable).toMatch(/min-width:\s*0;/);
    expect(dailyTable).toMatch(/table-layout:\s*fixed;/);

    const dailyCells = cssBlock(".daily-table th, .daily-table td");
    expect(dailyCells).toMatch(/min-width:\s*0;/);
    expect(dailyCells).toMatch(/padding:\s*8px 6px;/);
    expect(dailyCells).toMatch(/overflow-wrap:\s*anywhere;/);

    const dailyPlayerColumns = cssBlock(
      ".daily-table .player-heading-column, .daily-table .player-row-heading",
    );
    expect(dailyPlayerColumns).toMatch(/width:\s*24%;/);
    expect(dailyPlayerColumns).toMatch(/min-width:\s*0;/);

    const dailyRoundColumns = cssBlock(".daily-table .round-column");
    expect(dailyRoundColumns).toMatch(/width:\s*auto;/);
    expect(dailyRoundColumns).toMatch(/min-width:\s*0;/);
  });

  it("keeps daily header and player content compact", () => {
    const dailyInfoControl = cssBlock(".daily-info-control");
    expect(dailyInfoControl).toMatch(/border:\s*0;/);
    expect(dailyInfoControl).toMatch(/background:\s*transparent;/);
    expect(dailyInfoControl).toMatch(/text-decoration:\s*underline;/);

    const dailyPlayerName = cssBlock(
      ".krillion-daily-leaderboard .daily-table .player-heading strong",
    );
    expect(dailyPlayerName).toMatch(/min-width:\s*0;/);
    expect(dailyPlayerName).toMatch(/overflow:\s*hidden;/);
    expect(dailyPlayerName).toMatch(/text-overflow:\s*ellipsis;/);
    expect(dailyPlayerName).toMatch(/white-space:\s*nowrap;/);
  });

  it("fits the transposed all-time table at narrow and wide supported widths", () => {
    const allTimeTable = cssBlock(".all-time-table");
    expect(allTimeTable).toMatch(/width:\s*100%;/);
    expect(allTimeTable).toMatch(/min-width:\s*0;/);
    expect(allTimeTable).toMatch(/table-layout:\s*fixed;/);

    const allTimeCells = cssBlock(".all-time-table th, .all-time-table td");
    expect(allTimeCells).toMatch(/min-width:\s*0;/);
    expect(allTimeCells).toMatch(/padding:\s*8px 4px;/);
    expect(allTimeCells).toMatch(/overflow-wrap:\s*normal;/);

    const allTimePlayerColumns = cssBlock(
      ".all-time-table .player-heading-column, .all-time-table .player-row-heading",
    );
    expect(allTimePlayerColumns).toMatch(/width:\s*34%;/);
    expect(allTimePlayerColumns).toMatch(/min-width:\s*0;/);
    expect(allTimePlayerColumns).toMatch(/text-align:\s*left;/);

    const allTimePlayerName = cssBlock(".all-time-player-name");
    expect(allTimePlayerName).toMatch(/width:\s*100%;/);
    expect(allTimePlayerName).toMatch(/overflow:\s*hidden;/);
    expect(allTimePlayerName).toMatch(/text-overflow:\s*ellipsis;/);
    expect(allTimePlayerName).toMatch(/white-space:\s*nowrap;/);

    const allTimePlayerHeading = cssBlock(".all-time-table .all-time-player-heading");
    expect(allTimePlayerHeading).toMatch(/min-height:\s*0;/);
    expect(allTimePlayerHeading).toMatch(/gap:\s*2px;/);
  });

  it("uses equal-width all-time date columns without dropping puzzle labels", () => {
    const allTimeDateColumns = cssBlock(".all-time-table .all-time-date-column");
    expect(allTimeDateColumns).toMatch(/width:\s*auto;/);
    expect(allTimeDateColumns).toMatch(/min-width:\s*0;/);

    const puzzleLabel = cssBlock(".all-time-date-link small");
    expect(puzzleLabel).toMatch(/display:\s*block;/);
    expect(puzzleLabel).toMatch(/white-space:\s*normal;/);
  });

  it("removes the retired daily scoring key styles", () => {
    expect(styles).not.toMatch(/\.daily-scoring-key\b/);
  });

  it("constrains all-time player content while retaining cumulative details and focusable popovers", () => {
    const allTimeNameButton = cssBlock(".all-time-player-name");
    expect(allTimeNameButton).toMatch(/appearance:\s*none;/);
    expect(allTimeNameButton).toMatch(/display:\s*inline-flex;/);
    expect(allTimeNameButton).toMatch(/max-width:\s*100%;/);
    expect(allTimeNameButton).toMatch(/min-width:\s*0;/);
    expect(allTimeNameButton).toMatch(/overflow:\s*hidden;/);
    expect(allTimeNameButton).toMatch(/text-overflow:\s*ellipsis;/);
    expect(allTimeNameButton).toMatch(/white-space:\s*nowrap;/);
    expect(allTimeNameButton).toMatch(/cursor:\s*pointer;/);

    const allTimeHeading = cssBlock(".all-time-table .all-time-player-heading");
    expect(allTimeHeading).toMatch(/min-height:\s*0;/);
    expect(allTimeHeading).toMatch(/max-width:\s*100%;/);
    expect(allTimeHeading).toMatch(/overflow:\s*visible;/);

    const allTimePopover = cssBlock(".all-time-player-popover");
    expect(allTimePopover).toMatch(/position:\s*relative;/);
    expect(allTimePopover).toMatch(/z-index:\s*6;/);
    expect(allTimePopover).toMatch(/width:\s*min\(260px, 100%\);/);
    expect(allTimePopover).toMatch(/max-width:\s*100%;/);
    expect(allTimePopover).toMatch(/white-space:\s*normal;/);
    expect(allTimePopover).toMatch(/overflow-wrap:\s*anywhere;/);
    expect(allTimePopover).toMatch(/text-align:\s*left;/);

    const allTimeScores = cssBlock(".all-time-table td");
    expect(allTimeScores).toMatch(/font-size:\s*11px;/);
    expect(allTimeScores).toMatch(/font-variant-numeric:\s*tabular-nums;/);
    expect(allTimeScores).toMatch(/line-height:\s*1\.2;/);
  });

  it("styles the complete Krillion result cell as a compact button", () => {
    const krillionResult = cssBlock(".krillion-daily-leaderboard .daily-table .krillion-result");
    expect(krillionResult).toMatch(/appearance:\s*none;/);
    expect(krillionResult).toMatch(/width:\s*100%;/);
    expect(krillionResult).toMatch(/border:\s*0;/);
    expect(krillionResult).toMatch(/background:\s*transparent;/);
    expect(krillionResult).toMatch(/font:\s*inherit;/);
    expect(krillionResult).toMatch(/cursor:\s*pointer;/);
  });

  it("keeps three-digit Krillion scores on one line in narrow fixed columns", () => {
    const krillionResult = cssBlock(".krillion-daily-leaderboard .daily-table .krillion-result");
    expect(krillionResult).toMatch(/position:\s*absolute;/);
    expect(krillionResult).toMatch(/inset:\s*0;/);
    expect(krillionResult).toMatch(/max-width:\s*100%;/);

    const krillionScore = cssBlock(
      ".krillion-daily-leaderboard .daily-table .krillion-result strong",
    );
    expect(krillionScore).toMatch(/font-size:\s*12px;/);
    expect(krillionScore).toMatch(/overflow-wrap:\s*normal;/);
    expect(krillionScore).toMatch(/white-space:\s*nowrap;/);
  });

  it("removes padding only from populated Krillion cells and fills their hit target", () => {
    expect(pageSource).toMatch(
      /const hasKrillionResult =\s*game\.key === "krillion" &&\s*player\.daily_score !== null &&\s*player\.rounds\.some\(\(round\) => round\.round_number === roundNumber\);/,
    );
    expect(pageSource).toMatch(
      /<td[\s\S]*?key=\{roundNumber\}[\s\S]*?className=\{hasKrillionResult \? "krillion-result-cell" : undefined\}[\s\S]*?>/,
    );

    const krillionCell = cssBlock(".krillion-daily-leaderboard .daily-table .krillion-result-cell");
    expect(krillionCell).toMatch(/position:\s*relative;/);
    expect(krillionCell).toMatch(/padding:\s*0;/);

    const krillionResult = cssBlock(".krillion-daily-leaderboard .daily-table .krillion-result");
    expect(krillionResult).toMatch(/position:\s*absolute;/);
    expect(krillionResult).toMatch(/inset:\s*0;/);
    expect(krillionResult).toMatch(/padding:\s*8px 0;/);
  });

  it("bounds the card-level popover without adding table-width rules", () => {
    const popoverPanel = cssBlock(".daily-info-popover-panel");
    expect(popoverPanel).toMatch(/position:\s*relative;/);
    expect(popoverPanel).toMatch(/width:\s*min\(240px, calc\(100vw - 32px\)\);/);
    expect(popoverPanel).toMatch(/max-width:\s*100%;/);
    expect(popoverPanel).toMatch(/margin-left:\s*auto;/);
    expect(popoverPanel).not.toMatch(/width:\s*max-content;/);
    expect(popoverPanel).not.toMatch(/min-width:/);
    expect(styles).not.toMatch(/\.daily-table[^{}]*daily-info-popover/);
  });
});
