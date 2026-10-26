import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertCapture, sharedTextCapture, CAPTURE_LIMITS } from "../../shared/capture";
import type { SafariWebpageCapture } from "../../shared/types";
import { parseCapture } from "../../parsers";
import { ParserError } from "../../parsers/errors";

const now = new Date("2026-10-21T01:00:00Z"); // October 20 in Los Angeles
const raw = (file: string) => readFileSync(`tests/fixtures/${file}`, "utf8");
const current = raw("krillion/2026-10-21-dive-98-365.txt");
const archived = raw("krillion/2026-10-15-day-92-360.txt");
const map = raw("maptap/2026-10-20-835.txt");
const safari = (
  visible_text = current,
  source_url = "https://krillion.io/",
): SafariWebpageCapture => ({
  capture_schema: "dgt.capture.v1",
  source_kind: "safari_webpage",
  source_url,
  page_title: "Krillion",
  visible_text,
  visible_nodes: [],
});
function error(input: unknown, code: string, date = now) {
  try {
    parseCapture(input, date);
    expect.fail("Expected rejection");
  } catch (caught) {
    expect(caught).toBeInstanceOf(ParserError);
    expect((caught as ParserError).code).toBe(code);
    expect((caught as Error).message).toContain("Nothing was submitted.");
  }
}

describe("golden parser results", () => {
  it("parses the native MapTap Dictionary envelope without altering its text", () => {
    const capture = JSON.parse(raw("capture/2026-10-21-maptap-810.iphone.json"));
    const before = JSON.stringify(capture);
    const result = parseCapture(capture, new Date("2026-10-21T20:00:00Z"));
    expect(result).toMatchObject({
      gameKey: "maptap",
      gameDate: "2026-10-21",
      externalPuzzleKey: "2026-10-21",
      finalScore: 810,
      parserVersion: "maptap.v1",
    });
    expect(result.rounds).toEqual([
      { roundNumber: 1, rawScore: 72, originalEmoji: "🫢" },
      { roundNumber: 2, rawScore: 98, originalEmoji: "🔥" },
      { roundNumber: 3, rawScore: 86, originalEmoji: "🎓" },
      { roundNumber: 4, rawScore: 77, originalEmoji: "😁" },
      { roundNumber: 5, rawScore: 79, originalEmoji: "👏" },
    ]);
    expect(JSON.stringify(capture)).toBe(before);
    expect(capture.shared_text).toBe(raw("maptap/2026-10-21-810.txt").replace(/\n$/, ""));
  });
  it("parses the synthetic fixture Dive #98 with original prompt and answer case", () => {
    const capture = JSON.parse(raw("capture/2026-10-21-dive-98-285.iphone.json"));
    const expected = JSON.parse(raw("capture/2026-10-21-dive-98-285.normalized.json"));
    expect(parseCapture(capture, new Date("2026-10-21T20:00:00Z"))).toEqual(expected);
  });
  it("parses the synthetic refreshed capture with matching native sizes and exclusions", () => {
    const capture = JSON.parse(raw("capture/2026-10-21-dive-98-285.refreshed.iphone.json"));
    const expected = JSON.parse(raw("capture/2026-10-21-dive-98-285.normalized.json"));
    expect(parseCapture(capture, new Date("2026-10-21T20:00:00Z"))).toEqual(expected);
    expect(Buffer.byteLength(JSON.stringify(capture))).toBe(4102);
    expect(Buffer.byteLength(capture.visible_text)).toBe(848);
    expect(capture.visible_nodes).toHaveLength(52);
    expect(
      capture.visible_nodes.every(
        (node: { tag: string; class: string }) =>
          node.tag === node.tag.toUpperCase() && !node.class.split(/\s+/).includes("sr-only"),
      ),
    ).toBe(true);
    expect(capture.visible_text).not.toContain("(opens in a new tab)");
    expect(capture.visible_text).not.toContain("\nYOU\n");
  });
  it("rejects disagreement between synthetic fixture leaf hints and visible text", () => {
    const capture = JSON.parse(
      raw("capture/2026-10-21-dive-98-285.iphone.json"),
    ) as SafariWebpageCapture;
    capture.visible_nodes.find((node) => node.text === "Synthetic native answer 1")!.text =
      "Different answer";
    error(capture, "PARSER_UNSUPPORTED", new Date("2026-10-21T20:00:00Z"));
  });
  it("rejects missing or extra round hints in the native section", () => {
    const capture = JSON.parse(
      raw("capture/2026-10-21-dive-98-285.iphone.json"),
    ) as SafariWebpageCapture;
    const first = capture.visible_nodes.findIndex((node) => node.text === "the catch") + 2;
    capture.visible_nodes.splice(first, 7);
    error(capture, "ROUND_COUNT_MISMATCH", new Date("2026-10-21T20:00:00Z"));
  });
  it("keeps native answer case even when structural markers change case", () => {
    const capture = JSON.parse(
      raw("capture/2026-10-21-dive-98-285.iphone.json"),
    ) as SafariWebpageCapture;
    capture.visible_text = capture.visible_text.replace(
      "Synthetic native answer 1",
      "sYnThEtIc NaTiVe AnSwEr 1",
    );
    capture.visible_nodes.find((node) => node.text === "Synthetic native answer 1")!.text =
      "sYnThEtIc NaTiVe AnSwEr 1";
    expect(parseCapture(capture, new Date("2026-10-21T20:00:00Z")).rounds[0].answer).toBe(
      "sYnThEtIc NaTiVe AnSwEr 1",
    );
  });
  for (const file of readdirSync("tests/fixtures/maptap").filter((name) => name.endsWith(".txt"))) {
    it(`parses MapTap ${file} with exact emojis and weighted total`, () => {
      const expected = JSON.parse(raw(`maptap/${file.replace(".txt", ".expected.json")}`));
      const result = parseCapture(
        sharedTextCapture(raw(`maptap/${file}`)),
        new Date(`${expected.game_day}T20:00:00Z`),
      );
      expect(result).toMatchObject({
        gameKey: "maptap",
        gameDate: expected.game_day,
        externalPuzzleKey: expected.game_day,
        finalScore: expected.reported_total,
        parserVersion: "maptap.v1",
      });
      expect(result.rounds).toEqual(
        expected.rounds.map(
          (round: { round_number: number; raw_score: number; emoji: string }) => ({
            roundNumber: round.round_number,
            rawScore: round.raw_score,
            originalEmoji: round.emoji,
          }),
        ),
      );
    });
  }
  it("parses every field of the current Krillion sample", () => {
    const expected = JSON.parse(raw("krillion/2026-10-21-dive-98-365.expected.json"));
    const result = parseCapture(safari(), now);
    expect(result).toMatchObject({
      gameKey: "krillion",
      gameDate: "2026-10-21",
      externalPuzzleKey: "98",
      finalScore: 365,
      parserVersion: "krillion.v1",
    });
    expect(result.rounds).toEqual(
      expected.rounds.map(
        (round: { round_number: number; prompt: string; answer: string; raw_score: number }) => ({
          roundNumber: round.round_number,
          prompt: round.prompt,
          answer: round.answer,
          rawScore: round.raw_score,
        }),
      ),
    );
  });
  it("rejects the archived golden fixture for players", () =>
    error(safari(archived), "WRONG_GAME_DAY"));
  it("retains the archive fixture's miss and quoted zero answer in a synthetic current layout", () => {
    // This transformation tests row semantics, never accepts the real archive as current.
    const synthetic = archived
      .replace("THE ARCHIVE", "THE DAILY DIVE")
      .replace("⟲ DAY #92 RESURFACED", "DIVE #98 COMPLETE")
      .replace(
        "BETTER THAN 85% OF DAY #92'S ORIGINAL PLAYERS",
        "BETTER THAN 85% OF TODAY'S PLAYERS",
      )
      .replace("NEXT DAY ⟲", "LOGBOOK");
    const result = parseCapture(safari(synthetic), now);
    expect(result.finalScore).toBe(360);
    expect(result.rounds[3]).toMatchObject({ answer: null, rawScore: 0 });
    expect(result.rounds[6]).toMatchObject({ answer: '"e"', rawScore: 0 });
  });
});

describe("strict capture boundary", () => {
  it("normalizes line endings only, preserving spaces, emoji and Unicode", () => {
    expect(sharedTextCapture("  A\r\nB\rC 🧑🏽‍🚀  \n").shared_text).toBe("  A\nB\nC 🧑🏽‍🚀  \n");
  });
  it.each([
    null,
    {},
    { ...safari(), cookies: "secret" },
    { ...safari(), source_url: "javascript:alert(1)" },
    { ...safari(), source_url: "https://user:pass@krillion.io/" },
    { ...safari(), visible_nodes: [{ tag: "DIV", id: "", class: "", text: "x", html: "x" }] },
    { ...safari(), visible_text: "\ud800" },
    { ...safari(), visible_text: "\u0000" },
  ])("rejects malformed envelopes %#", (capture) => error(capture, "CAPTURE_INVALID"));
  it("bounds UTF-8 text bytes, not character count", () =>
    error({ ...safari(), visible_text: "🦑".repeat(26000) }, "CAPTURE_TOO_LARGE"));
  it.each([{ tag: "DIV\n" }, { id: "\udfff" }, { class: "\u007f" }, { text: "\u000b" }])(
    "still validates every node field when other fields are empty %#",
    (field) =>
      error(
        { ...safari(), visible_nodes: [{ tag: "DIV", id: "", class: "", text: "", ...field }] },
        "CAPTURE_INVALID",
      ),
  );
  it("requires the allowed node fields themselves to be own properties", () => {
    const node = Object.assign(Object.create({ class: "" }), {
      tag: "DIV",
      id: "",
      text: "x",
      extra: "unexpected",
    });
    error({ ...safari(), visible_nodes: [node] }, "CAPTURE_INVALID");
  });
  it("rejects an unexpected enumerable field even when a required field is hidden", () => {
    const capture = { ...safari(), unexpected: {} };
    Object.defineProperty(capture, "page_title", { enumerable: false });
    capture.unexpected = capture;
    error(capture, "CAPTURE_INVALID");
  });
  it.each(["A", "é", "漢", "🦑", "\\", '"', "\t", "\n", "\r", "🧑🏽‍🚀", "\u2028"])(
    "counts serialized bytes exactly at the cap for %j",
    (pattern) => {
      const capture = safari("a", 'https://krillion.io/?q=é🦑"\\\t\n\r');
      capture.page_title = pattern.repeat(3);
      capture.visible_nodes = Array.from({ length: 4 }, () => ({
        tag: "DIV",
        id: pattern.repeat(3),
        class: pattern.repeat(3),
        text: pattern.repeat(1000),
      }));
      let remaining = CAPTURE_LIMITS.serializedBytes - Buffer.byteLength(JSON.stringify(capture));
      for (const node of capture.visible_nodes) {
        const append = Math.min(remaining, CAPTURE_LIMITS.textBytes - Buffer.byteLength(node.text));
        node.text += "x".repeat(append);
        remaining -= append;
      }
      expect(remaining).toBe(0);
      expect(Buffer.byteLength(JSON.stringify(capture))).toBe(CAPTURE_LIMITS.serializedBytes);
      expect(() => assertCapture(capture)).not.toThrow();
      capture.visible_text += "x";
      error(capture, "CAPTURE_TOO_LARGE");
    },
  );
  it("bounds node count", () =>
    error(
      {
        ...safari(),
        visible_nodes: Array.from({ length: 5001 }, () => ({
          tag: "DIV",
          id: "",
          class: "",
          text: "x",
        })),
      },
      "CAPTURE_TOO_LARGE",
    ));
  it("bounds serialized JSON including escaping and metadata", () =>
    error(
      {
        ...safari(),
        visible_nodes: Array.from({ length: 100 }, () => ({
          tag: "DIV",
          id: "x".repeat(1000),
          class: "x".repeat(1000),
          text: "x".repeat(1000),
        })),
      },
      "CAPTURE_TOO_LARGE",
    ));
  it("bounds serialization expansion", () =>
    error(
      {
        ...safari(),
        visible_text: "\\".repeat(CAPTURE_LIMITS.textBytes),
        visible_nodes: [{ tag: "DIV", id: "", class: "", text: "\\".repeat(90000) }],
      },
      "CAPTURE_TOO_LARGE",
    ));
  it("does not serialize recursive unknown fields", () => {
    const capture = { ...safari(), extra: {} };
    capture.extra = capture;
    error(capture, "CAPTURE_INVALID");
  });
  it("does not mutate caller input", () => {
    const capture = Object.freeze(safari());
    const before = JSON.stringify(capture);
    parseCapture(capture, now);
    expect(JSON.stringify(capture)).toBe(before);
    assertCapture(capture);
  });
});

describe("MapTap rejection and emoji semantics", () => {
  it("resolves MapTap identity from the shared month/day during the worldwide window", () => {
    const result = parseCapture(
      sharedTextCapture(map.replace("October 20", "October 23")),
      new Date("2026-10-24T11:00:00Z"),
    );
    expect(result).toMatchObject({
      gameDate: "2026-10-23",
      externalPuzzleKey: "2026-10-23",
    });
  });

  it.each([
    [new Date("2026-10-22T09:59:59.999Z"), "before the worldwide opening"],
    [new Date("2026-10-24T12:00:00.000Z"), "after the worldwide close"],
  ])("rejects MapTap outside its worldwide window %s", (date) => {
    error(sharedTextCapture(map.replace("October 20", "October 23")), "WRONG_GAME_DAY", date);
  });

  it("preserves the new native share under CRLF/CR normalization only", () => {
    const original = raw("maptap/2026-10-21-810.txt");
    const cr = sharedTextCapture(original.replace(/\n/g, "\r"));
    const crlf = sharedTextCapture(original.replace(/\n/g, "\r\n"));
    expect(cr.shared_text).toBe(original);
    expect(crlf.shared_text).toBe(original);
    const result = parseCapture(crlf, new Date("2026-10-21T20:00:00Z"));
    expect(result.finalScore).toBe(810);
    expect(result.rounds.map((round) => round.originalEmoji)).toEqual([
      "🫢",
      "🔥",
      "🎓",
      "😁",
      "👏",
    ]);
    error(crlf, "WRONG_GAME_DAY", new Date("2026-10-22T20:00:00Z"));
  });
  it.each([0, 100])("accepts all-%i raw scores, including a played zero", (score) => {
    const text = `www.maptap.gg October 20\n${Array(5).fill(`${score}🔥`).join(" ")}\nFinal score: ${score * 10}`;
    expect(parseCapture(sharedTextCapture(text), now).finalScore).toBe(score * 10);
  });
  it("preserves unseen multi-codepoint emoji verbatim", () => {
    for (const emoji of ["🧑🏽‍🚀", "🇺🇳", "☀️", "1️⃣", "🏳️‍🌈"]) {
      const result = parseCapture(sharedTextCapture(map.replace("97🔥", `97${emoji}`)), now);
      expect(result.rounds[0].originalEmoji).toBe(emoji);
    }
  });
  it.each([
    [map.replace("97🔥 ", ""), "ROUND_COUNT_MISMATCH"],
    [map.replace("97🔥 ", "97🔥 1🔥 "), "ROUND_COUNT_MISMATCH"],
    [map.replace("835", "834"), "SCORE_MISMATCH"],
    [map.replace("97🔥", "101🔥"), "PARSER_UNSUPPORTED"],
    [map.replace("97🔥", "97🔥🔥"), "PARSER_UNSUPPORTED"],
    [map.replace("97🔥", "98abc"), "PARSER_UNSUPPORTED"],
    [map.replace("97🔥", "-1🔥"), "PARSER_UNSUPPORTED"],
    [map.replace("October 20", "February 30"), "CAPTURE_INVALID"],
    [map.replace("October 20", "October 19"), "WRONG_GAME_DAY"],
    [map.replace(/Final score:.*/, ""), "GAME_NOT_COMPLETE"],
    [map + "\nFinal score: 835", "PARSER_UNSUPPORTED"],
    [map + "\nKRILLION", "PARSER_UNSUPPORTED"],
  ])("fails closed %#", (text, code) => error(sharedTextCapture(text), code));
  it("rejects wrong Safari sharing even if the page contains a share summary", () =>
    error(
      { ...safari(map, "https://www.maptap.gg/"), page_title: "MapTap" },
      "INCOMPLETE_MAPTAP_SHARE",
    ));
  it("rejects yesterday across the year boundary", () =>
    error(
      sharedTextCapture(map.replace("October 20", "December 31")),
      "WRONG_GAME_DAY",
      new Date("2027-01-01T20:00:00Z"),
    ));
});

describe("Krillion strict sections and rounds", () => {
  it("derives Krillion game dates from completed Dive numbers", () => {
    const synthetic92 = raw("krillion/2026-10-15-day-92-360.txt")
      .replace("THE ARCHIVE", "THE DAILY DIVE")
      .replace("⟲ DAY #92 RESURFACED", "DIVE #92 COMPLETE")
      .replace(
        "BETTER THAN 85% OF DAY #92'S ORIGINAL PLAYERS",
        "BETTER THAN 85% OF TODAY'S PLAYERS",
      )
      .replace("NEXT DAY ⟲", "LOGBOOK");
    for (const [number, text, date, expectedDate] of [
      [92, synthetic92, "2026-10-16", "2026-10-15"],
      [98, current, "2026-10-22", "2026-10-21"],
      [100, current.replace("DIVE #98 COMPLETE", "DIVE #100 COMPLETE"), "2026-10-24", "2026-10-23"],
    ] as const) {
      expect(parseCapture(safari(text), new Date(`${date}T11:00:00Z`))).toMatchObject({
        gameDate: expectedDate,
        externalPuzzleKey: String(number),
      });
    }
  });

  it.each([0, 10, 15, 30, 60, 85, 100])("accepts the configured score tier %i", (score) => {
    const text = current
      .replace("\n85\n+", `\n${score}\n+`)
      .replace("\n365\n", `\n${280 + score}\n`);
    expect(parseCapture(safari(text), now).rounds[0].rawScore).toBe(score);
  });
  it.each([
    [current.replace("DIVE #98 COMPLETE", "PROMPT 5 OF 7"), "GAME_NOT_COMPLETE"],
    [current.replace("THE CATCH", "UNRECOGNIZED SECTION"), "INCOMPLETE_KRILLION_SHARE"],
    [current.replace("\n365\n", "\n366\n"), "SCORE_MISMATCH"],
    [current.replace("\n85\n+", "\n61\n+"), "PARSER_UNSUPPORTED"],
    [
      current.replace(
        "\n2\n\nNAME A SYNTHETIC CURRENT ITEM 2",
        "\n1\n\nNAME A SYNTHETIC CURRENT ITEM 2",
      ),
      "ROUND_COUNT_MISMATCH",
    ],
    [
      current.replace(
        "\n7\n\nNAME A SYNTHETIC CURRENT ITEM 7\nSynthetic current answer 7\n107 other players chose this\n60\n+",
        "",
      ),
      "ROUND_COUNT_MISMATCH",
    ],
    [
      current.replace("\nLOGBOOK", "\n8\nNAME AN EXTRA ROUND\nx\n0\n+\nLOGBOOK"),
      "ROUND_COUNT_MISMATCH",
    ],
    [current.replace("THE CATCH", "THE CATCH\nTHE CATCH"), "PARSER_UNSUPPORTED"],
    [current.replace("\nLOGBOOK", "\nDIVE #99 COMPLETE\n0\nLOGBOOK"), "PARSER_UNSUPPORTED"],
    [current.replace("TODAY'S PLAYERS", "ORIGINAL PLAYERS"), "PARSER_UNSUPPORTED"],
  ])("rejects malformed/unfinished/ambiguous rows %#", (text, code) => error(safari(text), code));
  it.each([
    "https://krillion.io/archive/92",
    "https://krillion.io/?day=92",
    "https://krillion.io/#archive/92",
  ])("rejects archive URL %s", (url) => error(safari(current, url), "WRONG_GAME_DAY"));
  it("rejects Krillion's summary share", () =>
    error(sharedTextCapture("KRILLION\nDIVE #98 COMPLETE\n365"), "INCOMPLETE_KRILLION_SHARE"));
  it("ignores numbers beyond the section boundary", () =>
    expect(parseCapture(safari(current + "\n8\nNAME X\nsecret\n100\n+"), now).finalScore).toBe(
      365,
    ));
  it("preserves punctuation, numbers, accents, newlines and unusual zero answers", () => {
    for (const answer of ['"0"', "0", "-", "é <script> !", "first line\nsecond line"]) {
      const text = current
        .replace("Synthetic current answer 1", answer)
        .replace("\n85\n+", "\n0\n+")
        .replace("\n365\n", "\n280\n");
      expect(parseCapture(safari(text), now).rounds[0]).toMatchObject({ answer, rawScore: 0 });
    }
  });
  it("uses complete generic DOM row hints and rejects conflicting hints", () => {
    const section = current.split("TAP A ROUND FOR EVERY ANSWER")[1].split("LOGBOOK")[0];
    const capture = safari();
    capture.visible_nodes = section
      .split(/\n\+/)
      .filter((text) => text.trim())
      .map((text) => ({ tag: "DIV", id: "", class: "", text: text.trim() + "\n+" }));
    expect(parseCapture(capture, now).finalScore).toBe(365);
    capture.visible_nodes[0].text = capture.visible_nodes[0].text.replace(
      "Synthetic current answer 1",
      "Wrong",
    );
    error(capture, "PARSER_UNSUPPORTED");
  });
  it("rejects unknown games and multiple game evidence", () => {
    error(sharedTextCapture("some other game"), "PARSER_UNSUPPORTED");
    error(safari(current + "\nwww.maptap.gg"), "PARSER_UNSUPPORTED");
  });
});
