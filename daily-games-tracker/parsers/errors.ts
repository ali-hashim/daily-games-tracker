export const PARSER_MESSAGES = {
  CAPTURE_INVALID: "The capture is malformed. Share the completed game again.",
  CAPTURE_TOO_LARGE: "The page is too large to capture. Contact the administrator.",
  PARSER_UNSUPPORTED: "The game format is unrecognized or ambiguous. Contact the administrator.",
  INCOMPLETE_KRILLION_SHARE:
    'Oops! For Krillion, use the Safari browser’s Share Website menu on the completed results page, then choose Upload to WHT. Do NOT use the "SHARE..." button inside the Krillion website. We need all seven answers and scores.',
  INCOMPLETE_MAPTAP_SHARE:
    'Oops! For MapTap, use the blue "Share your score" button inside the MapTap website, then choose Upload to WHT. Do NOT use the Safari browser’s Share Website menu. We need all five round scores.',
  GAME_NOT_COMPLETE: "Finish the game, then share the completed result.",
  ROUND_COUNT_MISMATCH:
    "The expected rounds are missing, repeated, or out of order. Share the completed game again.",
  SCORE_MISMATCH:
    "The round scores do not reproduce the final total. Share the completed game again.",
  WRONG_GAME_DAY: "Only today’s Pacific-day puzzle can be imported. Share today’s completed game.",
} as const;

export type ParserErrorCode = keyof typeof PARSER_MESSAGES;

export class ParserError extends Error {
  readonly code: ParserErrorCode;
  constructor(code: ParserErrorCode) {
    super(`${PARSER_MESSAGES[code]}\n\nNothing was submitted.`);
    this.name = "ParserError";
    this.code = code;
  }
}

export function fail(code: ParserErrorCode): never {
  throw new ParserError(code);
}
