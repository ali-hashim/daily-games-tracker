import { assertCapture } from "../shared/capture";
import type { NormalizedGameResult } from "../shared/types";
import { fail } from "./errors";
import { parseMapTap } from "./maptap";
import { parseKrillion } from "./krillion";
import { parseFarflung } from "./farflung";

// Explicit server time makes fixtures deterministic; callers supply their server clock.
// No environment, database, fetch, or persistence capability enters the parser.
export function parseCapture(input: unknown, now: Date): NormalizedGameResult {
  assertCapture(input);
  const text =
    input.source_kind === "shared_text"
      ? input.shared_text
      : `${input.page_title}\n${input.visible_text}`;
  const source = input.source_kind === "safari_webpage" ? new URL(input.source_url) : null;
  const krillion = /\bKRILLION\b/i.test(text) || /(^|\.)krillion\.io$/.test(source?.hostname ?? "");
  const maptap =
    /\b(?:www\.)?maptap\.gg\b/i.test(text) || /(^|\.)maptap\.gg$/.test(source?.hostname ?? "");
  const farflung =
    /(^|\.)farflung\.game$/.test(source?.hostname ?? "") ||
    /\bfarflung\.game\b/i.test(text) ||
    (input.source_kind === "safari_webpage" && /^Farflung\b/i.test(input.page_title));
  if ([krillion, maptap, farflung].filter(Boolean).length !== 1) fail("PARSER_UNSUPPORTED");
  if (farflung) {
    if (input.source_kind !== "safari_webpage") fail("INCOMPLETE_FARFLUNG_SHARE");
    return parseFarflung(input, now);
  }
  if (maptap) {
    if (input.source_kind !== "shared_text") fail("INCOMPLETE_MAPTAP_SHARE");
    return parseMapTap(input, now);
  }
  if (input.source_kind !== "safari_webpage") fail("INCOMPLETE_KRILLION_SHARE");
  return parseKrillion(input, now);
}
