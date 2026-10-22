import type {
  NormalizedGameResult,
  NormalizedRoundResult,
  SafariWebpageCapture,
  SafariVisibleNode,
} from "../shared/types";
import { KRILLION_ALLOWED_SCORES, PARSER_VERSIONS } from "../shared/game-config";
import { normalizeLineEndings } from "../shared/capture";
import { fail } from "./errors";

const linesOf = (text: string): string[] =>
  normalizeLineEndings(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

function roundBlock(lines: string[]): NormalizedRoundResult {
  if (!/^\d+$/.test(lines[0] ?? "")) fail("ROUND_COUNT_MISMATCH");
  const roundNumber = Number(lines[0]);
  if (!/^NAME\s+/i.test(lines[1] ?? "")) fail("PARSER_UNSUPPORTED");
  const score = lines.at(-1) ?? "";
  if (!/^(0|[1-9]\d{0,2})$/.test(score) || !KRILLION_ALLOWED_SCORES.includes(Number(score)))
    fail("PARSER_UNSUPPORTED");
  const answerLines = lines.slice(2, -1);
  if (/^[\d,]+ other players chose this$/.test(answerLines.at(-1) ?? "")) answerLines.pop();
  if (
    !answerLines.length ||
    answerLines.some((line) => /^(THE CATCH|LOGBOOK|NAME\s|DIVE #)/i.test(line))
  )
    fail("PARSER_UNSUPPORTED");
  const answer = answerLines.join("\n");
  const rawScore = Number(score);
  if (answer === "—" && rawScore !== 0) fail("SCORE_MISMATCH");
  return { roundNumber, prompt: lines[1], answer: answer === "—" ? null : answer, rawScore };
}

// Leaf-node layout observed in the synthetic fixture Dive #198 capture. Parent direct text
// for the popularity note precedes its numeric child, so do not concatenate nodes
// and pretend they reproduce visible_text. Bind fields inside each '+' row instead.
function leafRounds(nodes: SafariVisibleNode[]): NormalizedRoundResult[] | null {
  const upper = (value: string) => value.trim().toUpperCase();
  const start = nodes.findIndex(
    (node) => node.text.length >= 9 && upper(node.text) === "THE CATCH",
  );
  if (start < 0) return null;
  const end = nodes.findIndex(
    (node, index) => index > start && node.text.length >= 7 && upper(node.text) === "LOGBOOK",
  );
  if (end < 0) return null;
  const section = nodes.slice(start + 1, end);
  const hasPromptHint = (node: SafariVisibleNode) =>
    node.tag.toUpperCase() === "P" &&
    node.class.split(/\s+/).includes("uppercase") &&
    /^NAME\s/i.test(node.text);
  if (!section.some(hasPromptHint)) return null;
  if (upper(section.shift()?.text ?? "") !== "TAP A ROUND FOR EVERY ANSWER")
    fail("PARSER_UNSUPPORTED");
  const rounds: NormalizedRoundResult[] = [];
  let rowStart = 0;
  for (let index = 0; index < section.length; index++) {
    if (section[index].text.trim() !== "+") continue;
    const row = section.slice(rowStart, index);
    rowStart = index + 1;
    if (
      row.length < 4 ||
      !hasPromptHint(row[1]) ||
      row[2].tag.toUpperCase() !== "P" ||
      !row[2].class.split(/\s+/).includes("truncate")
    )
      fail("PARSER_UNSUPPORTED");
    const note = row.slice(3, -1).map((node) => node.text.trim());
    if (!(
      note.length === 0 ||
      (note.length === 1 && /^[\d,]+ other players chose this$/i.test(note[0])) ||
      (note.length === 2 && /^other players chose this$/i.test(note[0]) && /^[\d,]+$/.test(note[1]))
    ))
      fail("PARSER_UNSUPPORTED");
    if (row[0].tag.toUpperCase() !== "SPAN" || row.at(-1)?.tag.toUpperCase() !== "SPAN")
      fail("PARSER_UNSUPPORTED");
    rounds.push(
      roundBlock([
        row[0].text.trim(),
        row[1].text.trim(),
        row[2].text.trim(),
        row.at(-1)!.text.trim(),
      ]),
    );
  }
  if (
    rowStart !== section.length ||
    rounds.length !== 7 ||
    rounds.some((round, index) => round.roundNumber !== index + 1)
  )
    fail("ROUND_COUNT_MISMATCH");
  return rounds;
}

function parseSection(lines: string[]): NormalizedRoundResult[] {
  const rounds: NormalizedRoundResult[] = [];
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "+") {
      rounds.push(roundBlock(lines.slice(start, i)));
      start = i + 1;
    }
  }
  if (
    start !== lines.length ||
    rounds.length !== 7 ||
    rounds.some((round, index) => round.roundNumber !== index + 1)
  )
    fail("ROUND_COUNT_MISMATCH");
  return rounds;
}

export function parseKrillion(capture: SafariWebpageCapture, today: string): NormalizedGameResult {
  const lines = linesOf(capture.visible_text);
  const url = new URL(capture.source_url);
  let archiveQuery = false;
  url.searchParams.forEach((_value, key) => {
    if (/^(archive|day|date|puzzle|dive)$/i.test(key)) archiveQuery = true;
  });
  // Navigation labels such as ARCHIVE ⟲ are present even on today's result.
  if (
    /\bDAY #\d+ RESURFACED\b|\b(?:ARCHIVED|ARCHIVE) (?:DIVE|DAY|RESULT)\b|^THE ARCHIVE$/im.test(
      capture.visible_text,
    ) ||
    /\/(?:archive|archives|day|past)(?:\/|$)/i.test(url.pathname) ||
    archiveQuery ||
    /archive|resurfaced/i.test(url.hash)
  )
    fail("WRONG_GAME_DAY");
  const markers = lines
    .map((line, index) => ({ match: /^DIVE #(\d+) COMPLETE$/i.exec(line), index }))
    .filter(({ match }) => match);
  if (!markers.length) fail("GAME_NOT_COMPLETE");
  if (markers.length !== 1) fail("PARSER_UNSUPPORTED");
  const { match, index } = markers[0];
  if (!match || !/^[1-9]\d{0,8}$/.test(match[1])) fail("PARSER_UNSUPPORTED");
  if (!lines.some((line) => /^BETTER THAN \d+% OF TODAY['’]S PLAYERS$/i.test(line)))
    fail("PARSER_UNSUPPORTED");
  if (!/^(0|[1-9]\d{0,2})$/.test(lines[index + 1] ?? "")) fail("PARSER_UNSUPPORTED");
  const finalScore = Number(lines[index + 1]);
  const starts = lines.flatMap((line, i) => (line.toUpperCase() === "THE CATCH" ? [i] : []));
  if (!starts.length) fail("INCOMPLETE_KRILLION_SHARE");
  if (
    starts.length !== 1 ||
    starts[0] <= index ||
    lines[starts[0] + 1]?.toUpperCase() !== "TAP A ROUND FOR EVERY ANSWER"
  )
    fail("PARSER_UNSUPPORTED");
  const end = lines.findIndex((line, i) => i > starts[0] + 1 && line.toUpperCase() === "LOGBOOK");
  if (end < 0) fail("PARSER_UNSUPPORTED");
  const section = lines.slice(starts[0] + 2, end);
  const textRounds = parseSection(section);
  // Generic near-leaf hints can contain an entire result row. Use complete row hints only;
  // never infer a game's CSS selectors without a real captured fixture proving them.
  const hints = capture.visible_nodes.filter(
    (node) =>
      node.text.includes("\n") &&
      /^\d+\nNAME\s/i.test(linesOf(node.text).join("\n")) &&
      linesOf(node.text).at(-1) === "+",
  );
  let rounds = leafRounds(capture.visible_nodes) ?? textRounds;
  if (JSON.stringify(rounds) !== JSON.stringify(textRounds)) fail("PARSER_UNSUPPORTED");
  if (hints.length) {
    rounds = hints.map((node) => roundBlock(linesOf(node.text).slice(0, -1)));
    if (rounds.length !== 7 || JSON.stringify(rounds) !== JSON.stringify(textRounds))
      fail("PARSER_UNSUPPORTED");
  }
  if (rounds.reduce((sum, round) => sum + round.rawScore, 0) !== finalScore) fail("SCORE_MISMATCH");
  return {
    gameKey: "krillion",
    gameDate: today,
    externalPuzzleKey: match[1],
    finalScore,
    rounds,
    parserVersion: PARSER_VERSIONS.krillion,
  };
}
