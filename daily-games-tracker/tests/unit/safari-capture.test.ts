import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { assertCapture, utf8Bytes } from "../../shared/capture";
import { parseCapture } from "../../parsers";
import type { SafariWebpageCapture } from "../../shared/types";

// A deterministic DOM double exercises traversal/privacy/limits, not Safari layout or native latency.
class Element {
  nodeType = 1;
  hidden = false;
  isContentEditable = false;
  open = false;
  id = "";
  attributes: Record<string, string> = {};
  style = { display: "block", visibility: "visible", opacity: "1", contentVisibility: "visible" };
  rects = [{ width: 100, height: 20 }];
  constructor(
    public tagName: string,
    public childNodes: (Element | Text)[] = [],
  ) {}
  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
  hasAttribute(name: string) {
    return name in this.attributes;
  }
  getClientRects() {
    return this.rects;
  }
  get textContent(): never {
    throw new Error("Whole-subtree reads are forbidden");
  }
  get value(): never {
    throw new Error("Form value read is forbidden");
  }
}
class Text {
  nodeType = 3;
  constructor(public nodeValue: string) {}
}
const text = (value: string, tag = "DIV") => new Element(tag, [new Text(value)]);
const script = readFileSync("shortcut/capture-safari.js", "utf8");
function capture(body: Element, code = script): unknown {
  let output: unknown;
  let calls = 0;
  const document = {
    body,
    title: "Krillion",
    get cookie(): never {
      throw new Error("Cookie access forbidden");
    },
  };
  const context = {
    document,
    location: { href: "https://krillion.io/" },
    getComputedStyle: (element: Element) => element.style,
    TextEncoder,
    URL,
    performance,
    completion: (value: unknown) => {
      calls++;
      output = value;
    },
    get localStorage(): never {
      throw new Error("Storage access forbidden");
    },
    get sessionStorage(): never {
      throw new Error("Storage access forbidden");
    },
  };
  runInNewContext(code, context, { timeout: 3000 });
  expect(calls).toBe(1);
  return output;
}

describe("Safari capture script in a controlled DOM model", () => {
  it("excludes lowercase SVG subtrees and CSS-clipped screen-reader text", () => {
    const svg = new Element("svg", [text("SECRET", "text")]);
    const clipped = new Element("SPAN", [text("SECRET")]);
    Object.assign(clipped.style, { clip: "rect(0px, 0px, 0px, 0px)" });
    const inset = text("SECRET");
    Object.assign(inset.style, { clipPath: "inset(50%)" });
    const visible = text("visible", "p");
    const result = capture(new Element("BODY", [svg, clipped, inset, visible]));
    assertCapture(result);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect((result as SafariWebpageCapture).visible_text).toBe("visible");
    expect((result as SafariWebpageCapture).visible_nodes[0].tag).toBe("P");
  });
  it("traverses zero-height body and wrappers to visible positioned children", () => {
    const fixedResult = text("DIVE #198 COMPLETE");
    const wrapper = new Element("DIV", [new Text("not rendered"), fixedResult]);
    wrapper.rects = [{ width: 390, height: 0 }];
    const body = new Element("BODY", [wrapper]);
    body.rects = [{ width: 390, height: 0 }];
    const result = capture(body);
    assertCapture(result);
    expect((result as SafariWebpageCapture).visible_text).toBe("DIVE #198 COMPLETE");
    expect((result as SafariWebpageCapture).visible_nodes).toHaveLength(1);
    wrapper.style.display = "none";
    const hidden = capture(body);
    assertCapture(hidden);
    expect((hidden as SafariWebpageCapture).visible_text).toBe("");
  });
  it("traverses display:contents without requiring its own rendered box", () => {
    const container = new Element("DIV", [new Text("inline "), text("child")]);
    container.rects = [];
    container.style.display = "contents";
    const result = capture(new Element("BODY", [container]));
    assertCapture(result);
    expect((result as SafariWebpageCapture).visible_text).toBe("inline\nchild");
  });
  it("preserves zero-width BR line breaks", () => {
    const br = new Element("BR");
    br.rects = [{ width: 0, height: 18 }];
    const result = capture(new Element("BODY", [new Text("first"), br, new Text("second")]));
    assertCapture(result);
    expect((result as SafariWebpageCapture).visible_text).toBe("first\nsecond");
  });
  it("preserves inline ordering and meaningful line boundaries", () => {
    const inline = text(" middle ", "SPAN");
    inline.style.display = "inline";
    const result = capture(
      new Element("BODY", [
        new Element("DIV", [new Text("start"), inline, new Text("end")]),
        text("second\r\n  line"),
      ]),
    );
    assertCapture(result);
    expect((result as SafariWebpageCapture).visible_text).toBe("start middle end\nsecond\nline");
  });
  it("excludes scripts, styles, SVG, hidden ancestry, form content and browser secrets", () => {
    const bait: Element[] = [
      "SCRIPT",
      "STYLE",
      "NOSCRIPT",
      "TEMPLATE",
      "SVG",
      "CANVAS",
      "IFRAME",
      "INPUT",
      "TEXTAREA",
      "SELECT",
      "FORM",
    ].map((tag) => text("SECRET", tag));
    const hidden = text("SECRET");
    hidden.hidden = true;
    bait.push(hidden);
    for (const style of [
      { display: "none" },
      { visibility: "hidden" },
      { opacity: "0" },
      { contentVisibility: "hidden" },
    ]) {
      const ancestor = new Element("DIV", [text("SECRET")]);
      Object.assign(ancestor.style, style);
      bait.push(ancestor);
    }
    for (const attribute of ["aria-hidden", "inert"]) {
      const el = text("SECRET");
      el.attributes[attribute] = "true";
      bait.push(el);
    }
    const edit = text("SECRET");
    edit.isContentEditable = true;
    bait.push(edit);
    const zero = text("SECRET");
    zero.rects = [];
    bait.push(zero);
    const details = new Element("DETAILS", [text("summary", "SUMMARY"), text("SECRET")]);
    const visible = text("  visible  text  ");
    visible.attributes["data-password"] = "SECRET";
    const result = capture(new Element("BODY", [...bait, details, visible]));
    assertCapture(result);
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect((result as SafariWebpageCapture).visible_text).toBe("summary\nvisible text");
  });
  it("captures and parses the full current Krillion sample through one script", () => {
    const raw = readFileSync("tests/fixtures/krillion/2026-10-21-dive-98-365.txt", "utf8");
    const result = capture(
      new Element(
        "BODY",
        raw.split(/\r?\n/).map((line) => text(line)),
      ),
    );
    assertCapture(result);
    expect(parseCapture(result, new Date("2026-10-21T20:00:00Z"))).toMatchObject({
      finalScore: 365,
      externalPuzzleKey: "98",
    });
    expect(utf8Bytes(JSON.stringify(result))).toBeLessThan(256 * 1024);
  });
  it("returns an explicit error rather than a truncated result on text overflow", () => {
    expect(capture(new Element("BODY", [text("🦑".repeat(26000))]))).toMatchObject({
      capture_error: "CAPTURE_TOO_LARGE",
    });
  });
  it("returns an explicit error on node overflow", () => {
    expect(
      capture(
        new Element(
          "BODY",
          Array.from({ length: 5001 }, () => text("x")),
        ),
      ),
    ).toMatchObject({ capture_error: "CAPTURE_TOO_LARGE" });
  });
  it("bounds serialized metadata and traversal work", () => {
    const nodes = Array.from({ length: 1000 }, () => {
      const el = text("x");
      el.id = "a".repeat(256);
      el.attributes.class = "b".repeat(256);
      return el;
    });
    expect(capture(new Element("BODY", nodes))).toMatchObject({
      capture_error: "CAPTURE_TOO_LARGE",
    });
    expect(
      capture(
        new Element(
          "BODY",
          Array.from({ length: 21000 }, () => new Element("DIV")),
        ),
      ),
    ).toMatchObject({ capture_error: "CAPTURE_TOO_LARGE" });
  });
});
