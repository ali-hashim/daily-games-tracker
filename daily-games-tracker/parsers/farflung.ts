import type {
  NormalizedGameResult,
  NormalizedRoundResult,
  SafariVisibleNode,
  SafariWebpageCapture,
} from "../shared/types";
import { FARFLUNG_TIERS, PARSER_VERSIONS } from "../shared/game-config";
import { normalizeLineEndings } from "../shared/capture";
import { farflungDateForExpedition, isWorldwideWindowOpen } from "../shared/day";
import { fail } from "./errors";

const ROUND_COUNT = 5;
const TIER_NAMES = new Set<string>(FARFLUNG_TIERS.map((tier) => tier.name));
const KM = /^(?:\+([1-9]\d{0,2})|0) km$/;
const QUOTED = /^[“"](.+)[”"]$/su;

const linesOf = (text: string): string[] =>
  normalizeLineEndings(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function kmValue(line: string): number | null {
  const match = KM.exec(line);
  if (!match) return null;
  const value = match[1] ? Number(match[1]) : 0;
  return FARFLUNG_TIERS.some((tier) => tier.points === value) ? value : null;
}

// A round row is exactly: number, prompt, tier, “answer”, distance. Answer-list content
// (tier headings, "+N km", country buttons, notes, bare map labels) never has that shape.
function isRow(cells: readonly string[], at: number): boolean {
  return (
    /^\d+$/.test(cells[at] ?? "") &&
    Boolean(cells[at + 1]) &&
    !TIER_NAMES.has(cells[at + 1]) &&
    TIER_NAMES.has(cells[at + 2] ?? "") &&
    QUOTED.test(cells[at + 3] ?? "") &&
    kmValue(cells[at + 4] ?? "") !== null
  );
}

function readRows(cells: readonly string[]): NormalizedRoundResult[] {
  const rounds: NormalizedRoundResult[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (!isRow(cells, i)) continue;
    const roundNumber = Number(cells[i]);
    if (rounds.length >= ROUND_COUNT || roundNumber !== rounds.length + 1)
      fail("ROUND_COUNT_MISMATCH");
    const tier = FARFLUNG_TIERS.find((item) => item.name === cells[i + 2])!;
    const rawScore = kmValue(cells[i + 4])!;
    if (tier.points !== rawScore) fail("SCORE_MISMATCH");
    rounds.push({
      roundNumber,
      prompt: cells[i + 1],
      answer: QUOTED.exec(cells[i + 3])![1].trim(),
      rawScore,
    });
    i += 4;
  }
  if (rounds.length !== ROUND_COUNT) fail("ROUND_COUNT_MISMATCH");
  return rounds;
}

const ROW_CLASSES = ["pl-gz-n", "pl-gz-prompt", "pl-gz-stamp", "pl-gz-pick", "pl-gz-km"];

// Leaf nodes carry stable per-field classes. Use them as an independent reading that must
// agree with the visible text; ignore them when the page structure is not present.
function nodeRounds(nodes: readonly SafariVisibleNode[]): NormalizedRoundResult[] | null {
  const fields = nodes.filter((node) =>
    ROW_CLASSES.some((cls) => node.class.split(/\s+/).includes(cls)),
  );
  if (!fields.length) return null;
  return readRows(fields.map((node) => node.text.trim()));
}

export function parseFarflung(capture: SafariWebpageCapture, now: Date): NormalizedGameResult {
  const lines = linesOf(capture.visible_text);
  const headers = lines
    .map((line, index) => ({ match: /^EXPEDITION #(\d+)$/i.exec(line), index }))
    .filter(({ match }) => match);
  if (headers.length !== 1) fail(headers.length ? "PARSER_UNSUPPORTED" : "GAME_NOT_COMPLETE");
  const { match, index } = headers[0];
  if (lines[index + 1]?.toUpperCase() !== "COMPLETE") fail("GAME_NOT_COMPLETE");
  if (!match || !/^[1-9]\d{0,8}$/.test(match[1])) fail("PARSER_UNSUPPORTED");

  const start = lines.findIndex((line, i) => i > index && line.toUpperCase() === "THE ANSWERS");
  if (start < 0) fail("PARSER_UNSUPPORTED");
  const endOffset = lines
    .slice(start + 1)
    .findIndex((line) => line.toUpperCase() === "OTHER GAMES");
  const section = lines.slice(start + 1, endOffset < 0 ? undefined : start + 1 + endOffset);

  const rounds = readRows(section);
  const fromNodes = nodeRounds(capture.visible_nodes);
  if (fromNodes && JSON.stringify(fromNodes) !== JSON.stringify(rounds)) fail("PARSER_UNSUPPORTED");

  const expedition = Number(match[1]);
  const gameDate = farflungDateForExpedition(expedition);
  if (!gameDate || !isWorldwideWindowOpen(gameDate, now)) fail("WRONG_GAME_DAY");
  return {
    gameKey: "farflung",
    gameDate,
    externalPuzzleKey: match[1],
    // Farflung shows no total on the done page; the score is the sum of the five distances.
    finalScore: rounds.reduce((sum, round) => sum + round.rawScore, 0),
    rounds,
    parserVersion: PARSER_VERSIONS.farflung,
  };
}
