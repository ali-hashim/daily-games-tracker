import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  IOS_REQUIREMENT_DETAIL,
  IOS_REQUIREMENT_SHORT,
  MINIMUM_IOS_VERSION,
} from "../../src/lib/player-requirements";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("iOS requirement in public setup content", () => {
  it("states iOS 26 or later", () => {
    expect(MINIMUM_IOS_VERSION).toBe(26);
    expect(IOS_REQUIREMENT_SHORT).toContain("iOS 26 or later");
    expect(IOS_REQUIREMENT_DETAIL).toContain("not supported");
  });

  it("is shown by shared help, registration, and player setup docs", () => {
    expect(read("../../src/pages/PlayerHelp.tsx")).toContain("IOS_REQUIREMENT_DETAIL");
    const registration = read("../../src/pages/RegistrationPage.tsx");
    expect(registration.match(/IOS_REQUIREMENT_SHORT\}/g)?.length).toBeGreaterThanOrEqual(2);
    expect(read("../../PLAYER_SETUP.md")).toContain("iOS 26 or later");
  });
});
