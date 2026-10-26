import { describe, expect, it } from "vitest";
import {
  isWorldwideWindowOpen,
  krillionDateForPuzzle,
  latestWorldwideDay,
  pacificDay,
  previousCalendarDay,
  resolveOpenCalendarDate,
  worldwideWindow,
} from "../../shared/day";

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

describe("worldwide challenge windows", () => {
  it("opens at UTC+14 midnight and closes exclusively at UTC-12 midnight", () => {
    const window = worldwideWindow("2026-10-23");
    expect(window).toEqual({
      opensAt: new Date("2026-10-22T10:00:00.000Z"),
      closesAt: new Date("2026-10-24T12:00:00.000Z"),
    });
    expect(isWorldwideWindowOpen("2026-10-23", new Date("2026-10-22T10:00:00.000Z"))).toBe(true);
    expect(isWorldwideWindowOpen("2026-10-23", new Date("2026-10-24T11:59:59.999Z"))).toBe(true);
    expect(isWorldwideWindowOpen("2026-10-23", new Date("2026-10-22T09:59:59.999Z"))).toBe(false);
    expect(isWorldwideWindowOpen("2026-10-23", new Date("2026-10-24T12:00:00.000Z"))).toBe(false);
  });

  it("advances the latest navigable date at the worldwide opening without DST drift", () => {
    expect(latestWorldwideDay(new Date("2026-03-08T09:59:59.999Z"))).toBe("2026-03-08");
    expect(latestWorldwideDay(new Date("2026-03-08T10:00:00.000Z"))).toBe("2026-03-09");
    expect(latestWorldwideDay(new Date("2026-11-01T09:59:59.999Z"))).toBe("2026-11-01");
    expect(latestWorldwideDay(new Date("2026-11-01T10:00:00.000Z"))).toBe("2026-11-02");
  });

  it("resolves month/day evidence across year rollover and leap day", () => {
    expect(resolveOpenCalendarDate(12, 31, new Date("2027-01-01T11:00:00.000Z"))).toBe(
      "2026-12-31",
    );
    expect(resolveOpenCalendarDate(1, 1, new Date("2026-12-31T11:00:00.000Z"))).toBe("2027-01-01");
    expect(resolveOpenCalendarDate(2, 29, new Date("2028-02-29T11:00:00.000Z"))).toBe("2028-02-29");
  });

  it("maps supported Krillion puzzle numbers by calendar day and fails closed at numeric bounds", () => {
    expect(krillionDateForPuzzle(92)).toBe("2026-10-15");
    expect(krillionDateForPuzzle(97)).toBe("2026-10-20");
    expect(krillionDateForPuzzle(98)).toBe("2026-10-21");
    expect(krillionDateForPuzzle(100)).toBe("2026-10-23");
    expect(krillionDateForPuzzle(0)).toBeNull();
    expect(krillionDateForPuzzle(1_000_001)).toBeNull();
  });
});
