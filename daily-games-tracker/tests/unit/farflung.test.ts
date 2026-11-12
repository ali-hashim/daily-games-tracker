import { describe, expect, it } from "vitest";
import { assertCapture } from "../../shared/capture";
import type { SafariVisibleNode, SafariWebpageCapture } from "../../shared/types";
import { parseCapture } from "../../parsers";
import { ParserError } from "../../parsers/errors";
import { farflungDateForExpedition } from "../../shared/day";

// Fully synthetic captures modelled on the DOM shapes of the live Farflung done view.
// Every prompt and answer below is invented; no player data is reproduced.
const now = new Date("2026-11-12T18:00:00Z");

interface Round {
  prompt: string;
  tier: string;
  answer: string;
  km: string;
}

const ROUNDS: Round[] = [
  {
    prompt: "Pin a country with a volcano island",
    tier: "Elusive",
    answer: "Kiribati",
    km: "+85 km",
  },
  { prompt: "Pin a country crossed by the equator", tier: "Miss", answer: "Peru", km: "0 km" },
  { prompt: "Pin a country with a fjord", tier: "Rare", answer: "Chile", km: "+70 km" },
  {
    prompt: "Pin a country famous for tulips",
    tier: "Common",
    answer: "Netherlands",
    km: "+40 km",
  },
  {
    prompt: "Pin a country on two continents",
    tier: "Farflung",
    answer: "Kazakhstan",
    km: "+100 km",
  },
];

interface Opts {
  rounds?: Round[];
  expedition?: number;
  /** Rounds whose "Show answers" list is expanded. */
  openRounds?: number[];
  complete?: boolean;
  url?: string;
  mutateText?: (lines: string[]) => string[];
  dropNodes?: boolean;
}

const node = (cls: string, text: string, tag = "SPAN"): SafariVisibleNode => ({
  id: "",
  class: cls,
  tag,
  text,
});

function answerList(): { text: string[]; nodes: SafariVisibleNode[] } {
  // Tier headings, "+N km", country buttons and separators, as in the open "Show answers" view.
  const text = [
    "Show on map",
    "Tap a country for a fun fact",
    "Farflung",
    "+100 km",
    "Atlantis",
    "Elusive",
    "+85 km",
    "Lemuria ·Mu",
    "Common",
    "+40 km",
    "Avalon",
    "1",
    "5",
    "A made-up note about this prompt.",
    "Should something else count?",
  ];
  const nodes = [
    node("", "Show on map"),
    node("quip-hint", "Tap a country for a fun fact", "P"),
    node("ak-tier-name", "Farflung"),
    node("ak-tier-km", "+100 km"),
    node("quip-name is-on", "Atlantis", "BUTTON"),
    node("ak-tier-name", "Elusive"),
    node("ak-tier-km", "+85 km"),
    node("quip-name", "Lemuria", "BUTTON"),
    node("ak-sep", "·"),
    node("quip-name", "Mu", "BUTTON"),
    node("ak-tier-name", "Common"),
    node("ak-tier-km", "+40 km"),
    node("quip-name", "Avalon", "BUTTON"),
    node("", "1"),
    node("", "5"),
    node("ff-marginalia ak-note", "A made-up note about this prompt.", "DIV"),
    node("ff-btn ff-btn-link", "Should something else count?", "BUTTON"),
  ];
  return { text, nodes };
}

function capture(opts: Opts = {}): SafariWebpageCapture {
  const rounds = opts.rounds ?? ROUNDS;
  const expedition = opts.expedition ?? 39;
  const open = new Set(opts.openRounds ?? []);
  // Map labels at the top change when an answer map is open; they must be ignored.
  const top = open.size ? ["5", "Atlantis", "Avalon", "Mu"] : ["1", "2", "3", "4", "5"];
  let text = [...top, `Expedition #${expedition}`];
  const nodes: SafariVisibleNode[] = top.map((label) => node("ff-alone", label));
  nodes.push(node("pl-label", `Expedition #${expedition}`));
  if (opts.complete !== false) {
    text.push("Complete");
    nodes.push(node("pl-num", "Complete", "B"));
  }
  const header = [
    "Clock on",
    "Share",
    "Further than 35% of today’s expeditions",
    "Logbook",
    "1-day streak",
    "Passport",
    "12 of 197countries",
    "2 new",
    "The answers",
  ];
  text.push(...header);
  nodes.push(
    node("camp-played", "Clock on", "DIV"),
    node("share-word", "Share"),
    node("camp-rank", "Further than 35% of today’s expeditions", "P"),
    node("record-name", "Logbook"),
    node("streak-part is-kindled", "-day streak"),
    node("", "1"),
    node("record-name", "Passport"),
    node("", "12 of 197"),
    node("", "countries"),
    node("record-new", "2 new", "B"),
    node("ff-fathom", "The answers", "DIV"),
  );
  rounds.forEach((round, index) => {
    const n = String(index + 1);
    text.push(n, round.prompt, round.tier, `“${round.answer}”`, round.km);
    nodes.push(
      node("pl-gz-n", n),
      node("pl-gz-prompt", round.prompt),
      node("pl-gz-stamp ff-tier-x", round.tier),
      node("pl-gz-pick", `“${round.answer}”`),
      node("pl-gz-km ff-tier-x", round.km),
    );
    if (open.has(index + 1)) {
      const list = answerList();
      text.push(...list.text);
      nodes.push(...list.nodes);
    } else {
      text.push("Show answers");
      nodes.push(node("pl-gz-more", "Show answers"));
    }
  });
  text.push("Other games", `Expedition #${expedition + 1} opens in 14 h 6 m`, "Return home");
  nodes.push(
    node("ff-btn ff-btn-quiet ff-btn-medium", "Other games", "BUTTON"),
    node("camp-next", `Expedition #${expedition + 1} opens in`, "DIV"),
    node("lb-clock", "14 h 6 m"),
    node("ff-btn ff-btn-quiet ff-btn-medium camp-home is-sprung", "Return home", "BUTTON"),
  );
  if (opts.mutateText) text = opts.mutateText(text);
  const result: SafariWebpageCapture = {
    capture_schema: "dgt.capture.v1",
    source_kind: "safari_webpage",
    source_url: opts.url ?? "https://farflung.game/",
    page_title: "Farflung Geography Game - Play the Daily Map Quiz",
    visible_text: text.join("\n"),
    visible_nodes: opts.dropNodes ? [] : nodes,
  };
  assertCapture(result);
  return result;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ParserError) return error.code;
    throw error;
  }
  return undefined;
}

const expectedRounds = ROUNDS.map((round, index) => ({
  roundNumber: index + 1,
  prompt: round.prompt,
  answer: round.answer,
  rawScore: Number(round.km.replace(/[^\d]/g, "")),
}));

describe("Farflung expedition dates", () => {
  it("maps expedition #39 to November 12, 2026, one expedition per day", () => {
    expect(farflungDateForExpedition(39)).toBe("2026-11-12");
    expect(farflungDateForExpedition(40)).toBe("2026-11-13");
    expect(farflungDateForExpedition(20)).toBe("2026-10-24");
    expect(farflungDateForExpedition(0)).toBeNull();
    expect(farflungDateForExpedition(1.5)).toBeNull();
  });
});

describe("Farflung parser", () => {
  it("parses a completed expedition and sums the five rounds for the final score", () => {
    const result = parseCapture(capture(), now);
    expect(result).toEqual({
      gameKey: "farflung",
      gameDate: "2026-11-12",
      externalPuzzleKey: "39",
      finalScore: 295,
      rounds: expectedRounds,
      parserVersion: "farflung.v1",
    });
  });

  it("parses identically with a Show answers list open, on any round or several", () => {
    const base = parseCapture(capture(), now);
    for (const openRounds of [[5], [1], [2, 4], [1, 2, 3, 4, 5]])
      expect(parseCapture(capture({ openRounds }), now)).toEqual(base);
  });

  it("parses from visible text alone when no usable nodes are present", () => {
    expect(parseCapture(capture({ dropNodes: true, openRounds: [3] }), now)).toEqual(
      parseCapture(capture(), now),
    );
  });

  it("accepts an all-miss expedition with a total of zero", () => {
    const rounds = ROUNDS.map((round) => ({ ...round, tier: "Miss", km: "0 km" }));
    expect(parseCapture(capture({ rounds }), now).finalScore).toBe(0);
  });

  it("requires a finished expedition", () => {
    expect(code(() => parseCapture(capture({ complete: false }), now))).toBe("GAME_NOT_COMPLETE");
  });

  it("rejects an expedition outside its worldwide submission window", () => {
    expect(code(() => parseCapture(capture({ expedition: 30 }), now))).toBe("WRONG_GAME_DAY");
    expect(code(() => parseCapture(capture({ expedition: 45 }), now))).toBe("WRONG_GAME_DAY");
  });

  it("rejects a tier that does not match its distance", () => {
    const rounds = ROUNDS.map((round, i) => (i === 2 ? { ...round, km: "+85 km" } : round));
    expect(code(() => parseCapture(capture({ rounds }), now))).toBe("SCORE_MISMATCH");
  });

  it("rejects an unknown tier or distance", () => {
    const rounds = ROUNDS.map((round, i) => (i === 0 ? { ...round, km: "+90 km" } : round));
    expect(code(() => parseCapture(capture({ rounds, dropNodes: true }), now))).toBe(
      "ROUND_COUNT_MISMATCH",
    );
  });

  it("rejects missing, repeated and out-of-order rounds", () => {
    const missing = (lines: string[]) => {
      const i = lines.findIndex((line, at) => line === "4" && lines[at + 1] === ROUNDS[3].prompt);
      return [...lines.slice(0, i), ...lines.slice(i + 6)];
    };
    expect(code(() => parseCapture(capture({ mutateText: missing, dropNodes: true }), now))).toBe(
      "ROUND_COUNT_MISMATCH",
    );
    const repeated = (lines: string[]) =>
      lines.map((line, i, all) => (line === "3" && all[i + 1] === ROUNDS[2].prompt ? "2" : line));
    expect(code(() => parseCapture(capture({ mutateText: repeated, dropNodes: true }), now))).toBe(
      "ROUND_COUNT_MISMATCH",
    );
    const swapped = (lines: string[]) =>
      lines.map((line, i, all) =>
        line === "1" && all[i + 1] === ROUNDS[0].prompt
          ? "2"
          : line === "2" && all[i + 1] === ROUNDS[1].prompt
            ? "1"
            : line,
      );
    expect(code(() => parseCapture(capture({ mutateText: swapped, dropNodes: true }), now))).toBe(
      "ROUND_COUNT_MISMATCH",
    );
  });

  it("rejects a sixth round", () => {
    const rounds = [...ROUNDS, ROUNDS[0]];
    expect(code(() => parseCapture(capture({ rounds }), now))).toBe("ROUND_COUNT_MISMATCH");
  });

  it("rejects text and node rounds that disagree", () => {
    const changed = (lines: string[]) =>
      lines.map((line) => (line === "“Chile”" ? "“Norway”" : line));
    expect(code(() => parseCapture(capture({ mutateText: changed }), now))).toBe(
      "PARSER_UNSUPPORTED",
    );
  });

  it("rejects a Farflung share that is not a Safari webpage capture", () => {
    expect(
      code(() =>
        parseCapture(
          {
            capture_schema: "dgt.capture.v1",
            source_kind: "shared_text",
            shared_text: "farflung.game #39",
          },
          now,
        ),
      ),
    ).toBe("INCOMPLETE_FARFLUNG_SHARE");
  });

  it("is not confused with Krillion or MapTap pages", () => {
    expect(code(() => parseCapture(capture({ url: "https://krillion.io/" }), now))).toBe(
      "PARSER_UNSUPPORTED",
    );
  });
});
