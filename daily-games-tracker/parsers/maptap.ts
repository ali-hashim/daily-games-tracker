import type { NormalizedGameResult, SharedTextCapture } from "../shared/types";
import { MAPTAP_WEIGHTS, PARSER_VERSIONS } from "../shared/game-config";
import { normalizeLineEndings } from "../shared/capture";
import { fail } from "./errors";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const graphemes = new Intl.Segmenter("en", { granularity: "grapheme" });
// A single emoji grapheme: includes flags, keycaps, modifiers, variation selectors and ZWJ.
function isEmoji(value: string): boolean {
  return (
    value.length <= 64 &&
    [...graphemes.segment(value)].length === 1 &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u.test(value) &&
    !/[^\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0E\uFE0F\u200D0-9#*\u20E3\u{E0020}-\u{E007F}]/u.test(
      value,
    )
  );
}

export function parseMapTap(capture: SharedTextCapture, today: string): NormalizedGameResult {
  const lines = normalizeLineEndings(capture.shared_text).trim().split("\n");
  const header = /^www\.maptap\.gg ([A-Za-z]+) (\d{1,2})$/.exec(lines[0]);
  if (!header) fail("PARSER_UNSUPPORTED");
  const month = MONTHS.indexOf(header[1]) + 1;
  const day = Number(header[2]);
  if (
    !month ||
    day < 1 ||
    day > new Date(Date.UTC(Number(today.slice(0, 4)), month, 0)).getUTCDate()
  )
    fail("CAPTURE_INVALID");
  const gameDate = `${today.slice(0, 4)}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (gameDate !== today) fail("WRONG_GAME_DAY");
  if (lines.length < 3 || !lines.some((line) => /^Final score:/.test(line)))
    fail("GAME_NOT_COMPLETE");
  if (lines.length !== 3) fail("PARSER_UNSUPPORTED");
  const tokens = lines[1].trim().split(/\s+/u);
  if (tokens.length !== 5) fail("ROUND_COUNT_MISMATCH");
  const rounds = tokens.map((token, index) => {
    const candidates = [1, 2, 3].flatMap((length) => {
      const number = token.slice(0, length);
      const emoji = token.slice(length);
      return /^(0|[1-9]\d{0,2})$/.test(number) && Number(number) <= 100 && isEmoji(emoji)
        ? [{ rawScore: Number(number), originalEmoji: emoji }]
        : [];
    });
    if (candidates.length !== 1) fail("PARSER_UNSUPPORTED");
    return { roundNumber: index + 1, ...candidates[0] };
  });
  const total = /^Final score: (0|[1-9]\d{0,3})$/.exec(lines[2]);
  if (!total || Number(total[1]) > 1000) fail("PARSER_UNSUPPORTED");
  const finalScore = Number(total[1]);
  if (
    rounds.reduce((sum, round, index) => sum + round.rawScore * MAPTAP_WEIGHTS[index], 0) !==
    finalScore
  )
    fail("SCORE_MISMATCH");
  return {
    gameKey: "maptap",
    gameDate,
    externalPuzzleKey: gameDate,
    finalScore,
    rounds,
    parserVersion: PARSER_VERSIONS.maptap,
  };
}
