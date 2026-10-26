import { assertCapture } from "../shared/capture";
import type { NormalizedGameResult } from "../shared/types";
import { fail } from "./errors";
import { parseMapTap } from "./maptap";
import { parseKrillion } from "./krillion";

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
  if (krillion === maptap) fail("PARSER_UNSUPPORTED");
  if (maptap) {
    if (input.source_kind !== "shared_text") fail("INCOMPLETE_MAPTAP_SHARE");
    return parseMapTap(input, now);
  }
  if (input.source_kind !== "safari_webpage") fail("INCOMPLETE_KRILLION_SHARE");
  return parseKrillion(input, now);
}
