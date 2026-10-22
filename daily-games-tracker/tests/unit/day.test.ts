import { describe, expect, it } from "vitest";
import { pacificDay, previousCalendarDay } from "../../shared/day";

describe("Pacific game days", () => {
  it("turns over at midnight during standard time", () => {
    expect(pacificDay(new Date("2026-10-16T06:59:59Z"))).toBe("2026-10-15");
    expect(pacificDay(new Date("2026-10-16T07:00:00Z"))).toBe("2026-10-16");
  });

  it("handles the spring daylight-saving transition", () => {
    expect(pacificDay(new Date("2026-03-08T07:59:59Z"))).toBe("2026-03-07");
    expect(pacificDay(new Date("2026-03-08T08:00:00Z"))).toBe("2026-03-08");
    expect(pacificDay(new Date("2026-03-09T06:59:59Z"))).toBe("2026-03-08");
    expect(pacificDay(new Date("2026-03-09T07:00:00Z"))).toBe("2026-03-09");
  });

  it("handles the fall daylight-saving transition", () => {
    expect(pacificDay(new Date("2026-11-01T06:59:59Z"))).toBe("2026-10-31");
    expect(pacificDay(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11-01");
    expect(pacificDay(new Date("2026-11-02T07:59:59Z"))).toBe("2026-11-01");
    expect(pacificDay(new Date("2026-11-02T08:00:00Z"))).toBe("2026-11-02");
  });

  it("subtracts calendar days across leap-day and year boundaries", () => {
    expect(previousCalendarDay("2024-03-01")).toBe("2024-02-29");
    expect(previousCalendarDay("2026-01-01")).toBe("2025-12-31");
    expect(() => previousCalendarDay("2026-02-30")).toThrow(RangeError);
  });
});
