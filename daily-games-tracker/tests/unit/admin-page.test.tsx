import { act, createElement, type ComponentType, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import AdminPage, { type AdminDashboard, type AdminPageProps } from "../../src/pages/AdminPage";

const AdminComponent = AdminPage as ComponentType<AdminPageProps>;
const dashboardPath = "/api/admin/dashboard";

const sectionLabels = [
  "Players",
  "Invitations",
  "Devices",
  "Sessions",
  "Submissions",
  "Audit history",
];

const dashboard: AdminDashboard = {
  players: [
    {
      id: "player-1",
      display_name: "Alex",
      active: 1,
      created_at: "2026-10-20T00:00:00.000Z",
      updated_at: "2026-10-20T00:00:00.000Z",
    },
  ],
  devices: [
    {
      id: "device-1",
      player_id: "player-1",
      display_name: "Alex",
      label: "iPhone",
      created_at: "2026-10-20T00:00:00.000Z",
      last_used_at: null,
      revoked_at: null,
    },
  ],
  invitations: [],
  sessions: [],
  submissions: [
    {
      id: "submission-1",
      player_id: "player-1",
      display_name: "Alex",
      game_key: "maptap",
      game_date: "2026-10-20",
      external_puzzle_key: "2026-10-20",
      final_score: 820,
      parser_version: "maptap.v1",
      source_kind: "shared_text",
      submitted_at: "2026-10-20T00:00:00.000Z",
      updated_at: "2026-10-20T00:00:00.000Z",
      rounds: [1, 2, 3, 4, 5].map((round_number) => ({
        id: `round-${round_number}`,
        round_number,
        raw_score: [73, 99, 87, 78, 80][round_number - 1],
        original_emoji: "🔥",
      })),
    },
  ],
  audits: [
    {
      id: "audit-1",
      admin_identity: "admin@example.test",
      action: "submission.correct",
      entity_type: "submission",
      entity_id: "submission-1",
      before: { final_score: 820 },
      after: { final_score: 821 },
      reason: "Correct a result",
      created_at: "2026-10-20T00:00:00.000Z",
    },
  ],
};

const krillionDashboard: AdminDashboard = {
  ...dashboard,
  submissions: [
    {
      ...dashboard.submissions[0],
      game_key: "krillion",
      external_puzzle_key: "98",
      final_score: 300,
      parser_version: "krillion.v1",
      rounds: [100, 85, 60, 30, 15, 10, 0].map((raw_score, index) => ({
        id: `krillion-round-${index + 1}`,
        round_number: index + 1,
        raw_score,
        original_emoji: null,
        prompt: `NAME ${index + 1}`,
      })),
    },
  ],
};

it("renders accessible admin sections and reason controls for every material result action", () => {
  const html = renderToStaticMarkup(createElement(AdminComponent, { initialData: dashboard }));
  for (const label of sectionLabels) expect(html).toContain(label);
  expect(html).toContain("admin-backfill-heading");
  expect(html).toContain("admin-submissions-heading");
  expect(html).toContain("correction-reason-submission-1");
  expect(html).toContain("delete-reason-submission-1");
  expect(html).toContain("backfill-reason");
  expect(html).toContain("Game date (America/Los_Angeles)");
  expect(html.match(/required=""/g)?.length).toBeGreaterThanOrEqual(4);
});

it("renders only sanitized admin values and no credential or token fields", () => {
  const html = renderToStaticMarkup(createElement(AdminComponent, { initialData: dashboard }));
  expect(html).not.toContain("credential_hash");
  expect(html).not.toContain("session_hash");
  expect(html).not.toContain("token_hash");
  expect(html).not.toContain("raw_capture");
  expect(html).toContain("Alex");
  expect(html).toContain("submission.correct");
});

it("escapes hostile dashboard values without injected elements or executable attributes", () => {
  const hostileText = '<img src=x onerror="alert(1)">';
  const hostileAttribute = 'submission-1" onfocus="alert(1)';
  const hostileDashboard: AdminDashboard = {
    ...dashboard,
    players: [{ ...dashboard.players[0], display_name: hostileText }],
    devices: [{ ...dashboard.devices[0], label: hostileText, display_name: hostileText }],
    invitations: [
      {
        id: "invite-hostile",
        player_id: "player-1",
        display_name: hostileText,
        expires_at: "2026-10-20T00:00:00.000Z",
        consumed_at: null,
        created_by: hostileText,
        created_at: "2026-10-20T00:00:00.000Z",
      },
    ],
    sessions: [
      {
        id: "session-hostile",
        player_id: "player-1",
        display_name: hostileText,
        has_source_device: 0,
        idle_expires_at: "2026-10-20T00:00:00.000Z",
        absolute_expires_at: "2026-10-20T00:00:00.000Z",
        last_activity_at: "2026-10-20T00:00:00.000Z",
        revoked_at: null,
        created_at: "2026-10-20T00:00:00.000Z",
      },
    ],
    submissions: [
      {
        ...dashboard.submissions[0],
        id: hostileAttribute,
        display_name: hostileText,
        external_puzzle_key: hostileText,
        source_kind: hostileText,
      },
    ],
    audits: [
      {
        ...dashboard.audits[0],
        action: hostileText,
        entity_type: hostileText,
        admin_identity: hostileText,
        reason: hostileText,
        before: hostileText,
        after: hostileText,
      },
    ],
  };

  const html = renderToStaticMarkup(
    createElement(AdminComponent, { initialData: hostileDashboard }),
  );

  expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  expect(html).toContain("submission-1&quot; onfocus=&quot;alert(1)");
  expect(html).not.toMatch(/<img\b/i);
  expect(html).not.toMatch(/<script\b/i);
  expect(html).not.toMatch(/\son(?:error|load|focus|click)\s*=\s*[\"']/i);
});

class TestEvent {
  readonly type: string;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  target: TestElement | TestDocument | null = null;
  currentTarget: TestElement | TestDocument | null = null;
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

type TestListener = (event: TestEvent) => void;

class TestNode {
  readonly nodeType: number;
  ownerDocument: TestDocument;
  parentNode: TestElement | TestDocument | null = null;
  childNodes: TestNode[] = [];
  private textValue: string | null = null;

  constructor(nodeType: number, ownerDocument: TestDocument) {
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

  appendChild<T extends TestNode>(child: T): T {
    this.textValue = null;
    child.parentNode = this as unknown as TestElement | TestDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
    this.textValue = null;
    child.parentNode = this as unknown as TestElement | TestDocument;
    const index = before ? this.childNodes.indexOf(before) : -1;
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends TestNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(node: TestNode): boolean {
    return this === node || this.childNodes.some((child) => child.contains(node));
  }
}

class TestTextNode extends TestNode {
  constructor(value: string, ownerDocument: TestDocument) {
    super(3, ownerDocument);
    this.textContent = value;
  }
}

class TestElement extends TestNode {
  readonly tagName: string;
  readonly nodeName: string;
  readonly namespaceURI = "http://www.w3.org/1999/xhtml";
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, TestListener[]>();
  className = "";
  disabled = false;
  private currentValue = "";

  get value(): string {
    return this.currentValue;
  }

  set value(value: string) {
    this.currentValue = String(value);
  }

  get options(): TestElement[] {
    return this.childNodes.filter((child): child is TestElement => child instanceof TestElement);
  }

  constructor(tagName: string, ownerDocument: TestDocument) {
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

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: TestEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    if (event.bubbles && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }

  querySelectorAll(selector: string): TestElement[] {
    const matches: TestElement[] = [];
    const visit = (node: TestNode): void => {
      for (const child of node.childNodes) {
        if (child instanceof TestElement) {
          if (child.matches(selector)) matches.push(child);
          visit(child);
        }
      }
    };
    visit(this);
    return matches;
  }

  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  matches(selector: string): boolean {
    const match = selector.match(/^([a-z0-9-]+)?(?:\[([\w-]+)(?:="([^"]*)")?\])?$/i);
    if (!match) throw new Error(`Unsupported test selector: ${selector}`);
    const [, tag, attribute, attributeValue] = match;
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    if (attribute && !this.attributes.has(attribute)) return false;
    if (attributeValue !== undefined && this.attributes.get(attribute ?? "") !== attributeValue)
      return false;
    return true;
  }
}

class TestDocument extends TestNode {
  readonly documentElement: TestElement;
  readonly body: TestElement;
  readonly defaultView: Record<string, unknown>;
  private readonly listeners = new Map<string, TestListener[]>();
  activeElement: TestElement | null = null;

  constructor() {
    super(9, null as unknown as TestDocument);
    this.ownerDocument = this;
    this.defaultView = {};
    this.documentElement = new TestElement("html", this);
    this.body = new TestElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
  }

  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return this.createElement(tagName);
  }

  createTextNode(value: string): TestTextNode {
    return new TestTextNode(value, this);
  }

  addEventListener(type: string, listener: TestListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestListener): void {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((current) => current !== listener),
    );
  }

  dispatchEvent(event: TestEvent): boolean {
    if (!event.target) event.target = this;
    event.currentTarget = this;
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return !event.defaultPrevented;
  }

  querySelectorAll(selector: string): TestElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector: string): TestElement | null {
    return this.documentElement.querySelector(selector);
  }
}

function installTestDom() {
  const document = new TestDocument();
  const window = {
    document,
    HTMLElement: TestElement,
    HTMLIFrameElement: class {},
    SVGElement: TestElement,
    Node: TestNode,
    confirm: () => true,
  };
  Object.assign(document.defaultView, window);
  Object.assign(globalThis, {
    document,
    window,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  return { container, document, window };
}

async function renderInteractive(initialData: AdminDashboard = dashboard): Promise<{
  container: TestElement;
  document: TestDocument;
  window: { confirm: () => boolean };
  root: { unmount: () => void };
}> {
  const { container, document, window } = installTestDom();
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(container as unknown as Element);
  await act(async () => {
    root.render(createElement(AdminComponent, { initialData }) as ReactNode);
  });
  return { container, document, window, root };
}

async function flushReact(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function input(document: TestDocument, id: string): TestElement {
  const element = document.querySelector(`[id="${id}"]`);
  expect(element, `Missing #${id}`).not.toBeNull();
  return element!;
}

async function setInputValue(document: TestDocument, id: string, value: string): Promise<void> {
  await act(async () => {
    const element = input(document, id);
    Object.getOwnPropertyDescriptor(TestElement.prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new TestEvent("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new TestEvent("change", { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

it("submits sanitized correction payloads, honors cancellation, validates input, and refreshes", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(url);
    calls.push({ path, init });
    if (path === dashboardPath) return Response.json(dashboard);
    if (path === "/api/admin/me") return Response.json({ admin: { email: "admin@example.test" } });
    return Response.json({ status: "ok" });
  });
  const rendered = await renderInteractive();
  await flushReact();
  const getDashboardCount = () => calls.filter((call) => call.path === dashboardPath).length;
  const correctionForm = rendered.container
    .querySelectorAll("form")
    .find((form) => form.querySelector(`[id="correction-reason-submission-1"]`));
  expect(correctionForm).not.toBeUndefined();
  const initialRefreshes = getDashboardCount();
  expect(calls.some((call) => call.path === "/api/admin")).toBe(false);
  let confirmations = 0;
  rendered.window.confirm = () => {
    confirmations += 1;
    return true;
  };
  await setInputValue(
    rendered.document,
    "correction-reason-submission-1",
    "Correct the saved result",
  );
  await act(async () => {
    correctionForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  const correctionCall = calls.find((call) => call.init.method === "PATCH");
  expect(correctionCall).toBeDefined();
  const correctionPayload = JSON.parse(String(correctionCall!.init.body)) as {
    final_score: number;
    rounds: Array<Record<string, unknown>>;
    reason: string;
  };
  expect(correctionPayload).toMatchObject({ final_score: 820, reason: "Correct the saved result" });
  expect(correctionPayload.rounds).toHaveLength(5);
  expect(correctionPayload.rounds[0]).toEqual({
    round_number: 1,
    raw_score: 73,
    original_emoji: "🔥",
  });
  expect(confirmations).toBe(1);
  expect(getDashboardCount()).toBe(initialRefreshes + 1);

  const deleteForm = rendered.container
    .querySelectorAll("form")
    .find((form) => form.querySelector(`[id="delete-reason-submission-1"]`));
  expect(deleteForm).not.toBeUndefined();
  await setInputValue(rendered.document, "delete-reason-submission-1", "Cancel this delete");
  rendered.window.confirm = () => false;
  const beforeCancel = calls.length;
  await act(async () => {
    deleteForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  expect(calls.slice(beforeCancel).some((call) => call.init.method === "DELETE")).toBe(false);
  expect(getDashboardCount()).toBe(initialRefreshes + 1);

  rendered.window.confirm = () => true;
  await setInputValue(rendered.document, "correction-reason-submission-1", "");
  const beforeInvalid = calls.length;
  await act(async () => {
    correctionForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  expect(calls.length).toBe(beforeInvalid);
  rendered.root.unmount();
});

it("requires Krillion correction prompts and sends edited prompts without MapTap text fields", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(url);
    calls.push({ path, init });
    if (path === dashboardPath) return Response.json(krillionDashboard);
    if (path === "/api/admin/me") return Response.json({ admin: { email: "admin@example.test" } });
    return Response.json({ status: "ok" });
  });
  const rendered = await renderInteractive(krillionDashboard);
  await flushReact();
  const correctionForm = rendered.container
    .querySelectorAll("form")
    .find((form) => form.querySelector(`[id="correction-reason-submission-1"]`));
  expect(correctionForm).not.toBeUndefined();
  await setInputValue(rendered.document, "correction-reason-submission-1", "Fix Krillion prompt");
  await setInputValue(rendered.document, "correction-prompt-submission-1-1", " ");
  let confirmations = 0;
  rendered.window.confirm = () => {
    confirmations += 1;
    return true;
  };
  const initialRefreshes = calls.filter((call) => call.path === dashboardPath).length;
  const beforeInvalid = calls.length;
  await act(async () => {
    correctionForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  expect(calls.length).toBe(beforeInvalid);
  expect(confirmations).toBe(0);
  expect(calls.filter((call) => call.path === dashboardPath).length).toBe(initialRefreshes);

  await setInputValue(rendered.document, "correction-prompt-submission-1-1", "UPDATED NAME 1");
  await act(async () => {
    correctionForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  const correctionCall = calls.find((call) => call.init.method === "PATCH");
  expect(correctionCall).toBeDefined();
  const payload = JSON.parse(String(correctionCall!.init.body)) as {
    rounds: Array<Record<string, unknown>>;
  };
  expect(payload.rounds[0]).toMatchObject({
    round_number: 1,
    raw_score: 100,
    prompt: "UPDATED NAME 1",
  });
  expect(payload.rounds[0]).not.toHaveProperty("answer");
  expect(calls.filter((call) => call.path === dashboardPath).length).toBe(initialRefreshes + 1);
  rendered.root.unmount();
});

it("validates Krillion prompts before confirmation and sends complete prompt fields", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(url);
    calls.push({ path, init });
    if (path === dashboardPath) return Response.json(dashboard);
    if (path === "/api/admin/me") return Response.json({ admin: { email: "admin@example.test" } });
    return Response.json({ status: "ok" });
  });
  const rendered = await renderInteractive();
  await flushReact();
  const backfillForm = rendered.container
    .querySelectorAll("form")
    .find((form) => form.querySelector(`[id="backfill-rounds"]`));
  expect(backfillForm).not.toBeUndefined();
  await setInputValue(rendered.document, "backfill-game", "krillion");
  expect(input(rendered.document, "backfill-rounds").value).toContain('"prompt": ""');
  await setInputValue(rendered.document, "backfill-player", "player-1");
  await setInputValue(rendered.document, "backfill-date", "2026-10-20");
  await setInputValue(rendered.document, "backfill-puzzle", "98");
  await setInputValue(rendered.document, "backfill-total", "300");
  await setInputValue(rendered.document, "backfill-reason", "Restore Krillion history");
  await setInputValue(
    rendered.document,
    "backfill-rounds",
    JSON.stringify(
      [100, 85, 60, 30, 15, 10, 0].map((raw_score, index) => ({
        round_number: index + 1,
        prompt: "",
        raw_score,
      })),
    ),
  );
  let confirmations = 0;
  rendered.window.confirm = () => {
    confirmations += 1;
    return true;
  };
  const beforeInvalid = calls.length;
  await act(async () => {
    backfillForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  expect(calls.length).toBe(beforeInvalid);
  expect(confirmations).toBe(0);

  await setInputValue(
    rendered.document,
    "backfill-rounds",
    JSON.stringify(
      [100, 85, 60, 30, 15, 10, 0].map((raw_score, index) => ({
        round_number: index + 1,
        prompt: `NAME ${index + 1}`,
        answer: index === 6 ? null : `answer-${index + 1}`,
        raw_score,
      })),
    ),
  );
  await act(async () => {
    backfillForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  const backfillCall = calls.find((call) => call.path === "/api/admin/submissions/manual");
  expect(backfillCall?.init.method).toBe("POST");
  expect(JSON.parse(String(backfillCall!.init.body))).toMatchObject({
    game_key: "krillion",
    game_date: "2026-10-20",
    external_puzzle_key: "98",
    final_score: 300,
    reason: "Restore Krillion history",
  });
  expect(JSON.parse(String(backfillCall!.init.body)).rounds[0]).toMatchObject({
    round_number: 1,
    prompt: "NAME 1",
    answer: "answer-1",
    raw_score: 100,
  });
  expect(calls.filter((call) => call.path === dashboardPath).length).toBeGreaterThan(1);
  rendered.root.unmount();
});

it("validates backfill round structure and sends the explicit game-date payload", async () => {
  const calls: Array<{ path: string; init: RequestInit }> = [];
  vi.stubGlobal("fetch", async (url: RequestInfo | URL, init: RequestInit = {}) => {
    const path = String(url);
    calls.push({ path, init });
    if (path === dashboardPath) return Response.json(dashboard);
    if (path === "/api/admin/me") return Response.json({ admin: { email: "admin@example.test" } });
    return Response.json({ status: "ok" });
  });
  const rendered = await renderInteractive();
  await flushReact();
  const backfillForm = rendered.container
    .querySelectorAll("form")
    .find((form) => form.querySelector(`[id="backfill-rounds"]`));
  expect(backfillForm).not.toBeUndefined();
  await setInputValue(rendered.document, "backfill-player", "player-1");
  await setInputValue(rendered.document, "backfill-date", "2026-10-19");
  await setInputValue(rendered.document, "backfill-puzzle", "2026-10-19");
  await setInputValue(rendered.document, "backfill-total", "820");
  await setInputValue(rendered.document, "backfill-reason", "Restore history");
  await setInputValue(rendered.document, "backfill-rounds", "[]");
  const beforeInvalid = calls.length;
  await act(async () => {
    backfillForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  expect(calls.length).toBe(beforeInvalid);

  await setInputValue(
    rendered.document,
    "backfill-rounds",
    JSON.stringify(
      [73, 99, 87, 78, 80].map((raw_score, index) => ({
        round_number: index + 1,
        raw_score,
        original_emoji: ["🫢", "🔥", "🎓", "😁", "👏"][index],
      })),
    ),
  );
  rendered.window.confirm = () => true;
  await act(async () => {
    backfillForm!.dispatchEvent(new TestEvent("submit", { bubbles: true, cancelable: true }));
  });
  await flushReact();
  const backfillCall = calls.find((call) => call.path === "/api/admin/submissions/manual");
  expect(backfillCall?.init.method).toBe("POST");
  expect(JSON.parse(String(backfillCall!.init.body))).toMatchObject({
    player_id: "player-1",
    game_key: "maptap",
    game_date: "2026-10-19",
    external_puzzle_key: "2026-10-19",
    final_score: 820,
    reason: "Restore history",
  });
  expect(JSON.parse(String(backfillCall!.init.body)).rounds).toHaveLength(5);
  expect(calls.filter((call) => call.path === dashboardPath).length).toBeGreaterThan(1);
  rendered.root.unmount();
});
