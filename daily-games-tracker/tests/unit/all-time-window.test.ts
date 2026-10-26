import { describe, expect, it } from "vitest";
import {
  ALL_TIME_WIDE_WINDOW_MIN_WIDTH,
  allTimeWindowSizeForWidth,
  createAllTimeDateWindow,
} from "../../src/lib/all-time-window";

const days = [
  { date: "2026-10-24" },
  { date: "2026-10-23" },
  { date: "2026-10-22" },
  { date: "2026-10-21" },
  { date: "2026-10-20" },
  { date: "2026-10-19" },
];

describe("all-time date windows", () => {
  it("uses four dates as the safe fallback and five when the measured width is wide enough", () => {
    expect(allTimeWindowSizeForWidth(undefined)).toBe(4);
    expect(allTimeWindowSizeForWidth(439)).toBe(4);
    expect(allTimeWindowSizeForWidth(ALL_TIME_WIDE_WINDOW_MIN_WIDTH)).toBe(5);
    expect(allTimeWindowSizeForWidth(620)).toBe(5);
  });

  it("returns newest-first dates and enables navigation toward older dates", () => {
    expect(createAllTimeDateWindow(days, 4, 0)).toEqual({
      dates: ["2026-10-24", "2026-10-23", "2026-10-22", "2026-10-21"],
      startIndex: 0,
      canMoveOlder: true,
      canMoveNewer: false,
    });
  });

  it("keeps the oldest partial window without overlapping the newest window", () => {
    expect(createAllTimeDateWindow(days, 4, 4)).toEqual({
      dates: ["2026-10-20", "2026-10-19"],
      startIndex: 4,
      canMoveOlder: false,
      canMoveNewer: true,
    });
  });

  it("clamps an out-of-range start index to the available oldest window", () => {
    expect(createAllTimeDateWindow(days, 5, 99)).toEqual({
      dates: ["2026-10-19"],
      startIndex: 5,
      canMoveOlder: false,
      canMoveNewer: true,
    });
  });

  it("normalizes retained starts across four- and five-column resize boundaries", () => {
    expect(createAllTimeDateWindow(days, 5, 4)).toEqual({
      dates: ["2026-10-19"],
      startIndex: 5,
      canMoveOlder: false,
      canMoveNewer: true,
    });
    expect(createAllTimeDateWindow(days, 4, 5)).toEqual({
      dates: ["2026-10-20", "2026-10-19"],
      startIndex: 4,
      canMoveOlder: false,
      canMoveNewer: true,
    });

    const intermediateDays = [
      { date: "2026-10-24" },
      { date: "2026-10-23" },
      { date: "2026-10-22" },
      { date: "2026-10-21" },
      { date: "2026-10-20" },
      { date: "2026-10-19" },
      { date: "2026-10-18" },
      { date: "2026-10-17" },
      { date: "2026-10-16" },
      { date: "2026-10-15" },
      { date: "2026-10-14" },
    ];

    expect(createAllTimeDateWindow(intermediateDays, 5, 7).startIndex).toBe(5);
    expect(createAllTimeDateWindow(intermediateDays, 4, 5).startIndex).toBe(4);
  });

  it("handles empty history without inventing dates or navigation", () => {
    expect(createAllTimeDateWindow([], 4, 0)).toEqual({
      dates: [],
      startIndex: 0,
      canMoveOlder: false,
      canMoveNewer: false,
    });
  });
});
