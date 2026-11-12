import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCapture } from "../../shared/capture";
import type { SafariVisibleNode, SafariWebpageCapture } from "../../shared/types";
import { parseCapture } from "../../parsers";
import { ParserError } from "../../parsers/errors";

// Fully synthetic captures modelled on the DOM shapes of the live done view. Every prompt
// and answer below is invented; no player data is reproduced.
const now = new Date("2026-10-21T01:00:00Z");
const SCORES = [85, 60, 60, 30, 10, 60, 60];
const ADVISORY =
  "We changed this at 2:30 am ET to exclude living and manmade things and let specific types count separately, because the original grouping and wording were confusing.";
const CLS = {
  num: "font-mono-ui text-[12px] text-drift/60 w-3 shrink-0",
  prompt: "font-mono-ui text-[12px] text-drift/70 truncate uppercase tracking-[0.05em]",
  answer: "text-[17px] text-foam truncate",
  note: "mt-0.5 text-[12px] text-drift/70",
  count: "tabular-nums text-lumen-cyan",
  points: "font-mono-ui text-sm tabular-nums",
  toggle: "font-mono-ui text-[11px] text-drift/50 w-3",
  advisory: "mt-1.5 pl-[55px] text-[14px] leading-snug text-drift/70",
  entry: "text-[14px] text-foam",
  desc: "block text-[13px] text-drift/70",
};

interface Opts {
  advisoryAfter?: number[];
  openRounds?: number[];
  // Extra lines (text + node) injected after the toggle of a given round.
  extra?: Record<number, string[]>;
  zeroPlayersRound?: number;
  mutate?: (lines: string[]) => string[];
}

function listBlock(round: number): { text: string[]; nodes: SafariVisibleNode[] } {
  const text = [
    "All 12",
    "Krillion 1",
    "Deep Cut 6",
    "Rare 3",
    "Schooler 1",
    "Plankton 1",
    "Invented entry A",
    "An invented description for entry A.",
    "+100",
    "3",
    "+85",
    "7 other players chose this",
    "+85",
    "Invented entry D",
    "+60",
    `100 of 12${round} answers`,
    "Scroll for more",
  ];
  const nodes: SafariVisibleNode[] = text.map((t) => {
    const chip = /^(All|Krillion|Deep Cut|Rare|Schooler|Plankton) \d+$/.test(t);
    return {
      id: "",
      tag: chip ? "BUTTON" : "SPAN",
      class: chip ? "rounded border px-2 py-1 font-mono-ui text-[12px]" : CLS.entry,
      text: t,
    };
  });
  return { text, nodes };
}

function build(opts: Opts = {}): SafariWebpageCapture {
  const total = SCORES.reduce((a, b) => a + b, 0);
  const text = [
    "KRILLION",
    "Dive #98 complete",
    String(total),
    "better than 50% of today's players",
    "dive log",
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "the catch",
    "tap a round for every answer",
  ];
  const nodes: SafariVisibleNode[] = [
    { id: "", tag: "SPAN", class: "", text: "the catch" },
    { id: "", tag: "SPAN", class: "fathom-depth", text: "tap a round for every answer" },
  ];
  const node = (tag: string, cls: string, t: string) =>
    nodes.push({ id: "", tag, class: cls, text: t });
  for (let r = 1; r <= 7; r++) {
    const open = opts.openRounds?.includes(r) ?? false;
    const zero = opts.zeroPlayersRound === r;
    const answer = `Invented answer ${r}`;
    text.push(String(r), `Name an invented thing number ${r}`, answer);
    node("SPAN", CLS.num, String(r));
    node("P", CLS.prompt, `Name an invented thing number ${r}`);
    node("P", CLS.answer, answer);
    if (!zero) {
      text.push(`${1000 + r} other players chose this`);
      node("P", CLS.note, "other players chose this");
      node("SPAN", CLS.count, String(1000 + r));
    }
    text.push(String(SCORES[r - 1]), open ? "−" : "+");
    node("SPAN", CLS.points, String(SCORES[r - 1]));
    node("SPAN", CLS.toggle, open ? "−" : "+");
    if (opts.advisoryAfter?.includes(r)) {
      text.push(ADVISORY);
      node("P", CLS.advisory, ADVISORY);
    }
    if (open) {
      const block = listBlock(r);
      text.push(...block.text);
      nodes.push(...block.nodes);
    }
    for (const line of opts.extra?.[r] ?? []) {
      text.push(line);
      node("SPAN", CLS.entry, line);
    }
  }
  text.push("logbook", "streak 2 · played 36 · avg 296 · best 465", "2", "36", "296", "465");
  node("SPAN", "", "logbook");
  node("SPAN", "text-foam", "2");
  node("SPAN", "text-foam", "36");
  const lines = opts.mutate ? opts.mutate(text) : text;
  return {
    capture_schema: "dgt.capture.v1",
    source_kind: "safari_webpage",
    source_url: "https://krillion.io/",
    page_title: "Krillion",
    visible_text: lines.join("\n"),
    visible_nodes: nodes,
  };
}

const expectedRounds = SCORES.map((rawScore, i) => ({
  roundNumber: i + 1,
  prompt: `Name an invented thing number ${i + 1}`,
  answer: `Invented answer ${i + 1}`,
  rawScore,
}));
function reject(capture: SafariWebpageCapture, code: string) {
  try {
    parseCapture(capture, now);
    expect.fail("Expected rejection");
  } catch (caught) {
    expect(caught).toBeInstanceOf(ParserError);
    expect((caught as ParserError).code).toBe(code);
  }
}

describe("Krillion done view with advisories and expanded answer lists", () => {
  it("parses the normal case", () => {
    const result = parseCapture(build(), now);
    expect(result.rounds).toEqual(expectedRounds);
    expect(result.finalScore).toBe(365);
  });
  it.each([
    ["advisory only", { advisoryAfter: [1] }],
    ["advisory after every round", { advisoryAfter: [1, 2, 3, 4, 5, 6, 7] }],
    ["open list only (round 6)", { openRounds: [6] }],
    ["advisory and open list", { advisoryAfter: [1], openRounds: [6] }],
    ["multiple open lists", { openRounds: [2, 6, 7] }],
    ["open list on the first round", { openRounds: [1], advisoryAfter: [1] }],
  ] as [string, Opts][])("parses %s identically to the normal case", (_name, opts) => {
    expect(parseCapture(build(opts), now).rounds).toEqual(expectedRounds);
    expect(() => assertCapture(build(opts))).not.toThrow();
  });
  it("parses text-only captures (no usable visible_nodes) with open lists", () => {
    const capture = { ...build({ advisoryAfter: [1], openRounds: [6] }), visible_nodes: [] };
    expect(parseCapture(capture, now).rounds).toEqual(expectedRounds);
  });
  it("handles a round with zero other players, alone and with an open list", () => {
    for (const opts of [
      { zeroPlayersRound: 7 },
      { zeroPlayersRound: 7, openRounds: [6], advisoryAfter: [1] },
      { zeroPlayersRound: 6, openRounds: [6] },
    ])
      expect(parseCapture(build(opts), now).rounds).toEqual(expectedRounds);
  });
  it("still rejects a changed final score and an invalid tier", () => {
    const capture = build({ openRounds: [6] });
    reject(
      { ...capture, visible_text: capture.visible_text.replace("\n365\n", "\n366\n") },
      "SCORE_MISMATCH",
    );
    reject(
      build({ mutate: (l) => l.map((x, i) => (i === l.indexOf("30") ? "31" : x)) }),
      "PARSER_UNSUPPORTED",
    );
  });

  describe("strict round validation", () => {
    const removeRound = (n: number) => (lines: string[]) => {
      const from = lines.indexOf(`Name an invented thing number ${n}`) - 1;
      return [...lines.slice(0, from), ...lines.slice(from + 5)];
    };
    it("rejects a missing round even with an open list", () => {
      reject(build({ openRounds: [6], mutate: removeRound(3) }), "ROUND_COUNT_MISMATCH");
      reject(build({ openRounds: [6], mutate: removeRound(7) }), "ROUND_COUNT_MISMATCH");
    });
    it("rejects a repeated round", () => {
      reject(
        build({
          openRounds: [6],
          mutate: (l) => l.map((x, i) => (x === "5" && l[i + 1]?.startsWith("Name") ? "4" : x)),
        }),
        "ROUND_COUNT_MISMATCH",
      );
    });
    it("rejects out-of-order rounds", () => {
      reject(
        build({
          advisoryAfter: [1],
          mutate: (l) =>
            l.map((x, i) =>
              l[i + 1]?.startsWith("Name an invented thing number") && (x === "2" || x === "3")
                ? x === "2"
                  ? "3"
                  : "2"
                : x,
            ),
        }),
        "ROUND_COUNT_MISMATCH",
      );
    });
    it("rejects an extra round after round 7, even inside an advisory/list region", () => {
      reject(
        build({ extra: { 7: ["8", "Name an extra thing", "x", "0", "+"] } }),
        "ROUND_COUNT_MISMATCH",
      );
    });
    it("rejects an extra round hidden after an open list", () => {
      reject(
        build({ openRounds: [3], extra: { 3: ["3", "Name another thing", "x", "0", "+"] } }),
        "ROUND_COUNT_MISMATCH",
      );
    });
    it("does not treat list entries that look like round numbers as rounds", () => {
      // The builder's open list already contains entries "3" and "7 other players chose this".
      const capture = build({ openRounds: [2, 5] });
      expect(capture.visible_text).toContain("\n3\n+85\n7 other players chose this\n");
      expect(parseCapture(capture, now).rounds).toEqual(expectedRounds);
      const sevens = build({ openRounds: [6], extra: { 6: ["7", "7 other players chose this"] } });
      expect(parseCapture(sevens, now).rounds).toEqual(expectedRounds);
    });
    it("rejects a round whose toggle is missing", () => {
      reject(
        build({
          mutate: (l) => {
            const i = l.indexOf("10");
            return [...l.slice(0, i + 1), ...l.slice(i + 2)];
          },
        }),
        "ROUND_COUNT_MISMATCH",
      );
    });
  });
});

describe("standalone capture test snippet", () => {
  it("is a verbatim copy of the capture script", () => {
    const doc = readFileSync("shortcut/STANDALONE_CAPTURE_TEST.md", "utf8");
    const script = readFileSync("shortcut/capture-safari.js", "utf8").trimEnd();
    expect(doc).toContain("```js\n" + script + "\n```");
  });
});
