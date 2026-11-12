import { describe, expect, it } from "vitest";
import { latestWorldwideDay } from "../../shared/day";
import { computePlayerStats, rankStats, type StatsScoreRow } from "../../shared/stats";

const row = (player_id: string, game_date: string, final_score: number): StatsScoreRow => ({
  player_id,
  game_date,
  final_score,
});

describe("computePlayerStats", () => {
  it("returns empty stats for a player with no submissions", () => {
    expect(computePlayerStats([], "2026-11-10", ["a"]).a).toEqual({
      player_id: "a",
      total_points: 0,
      days_played: 0,
      games_played: 0,
      first_day: null,
      last_day: null,
      average_per_day: null,
      average_per_game: null,
      current_streak: 0,
      longest_streak: 0,
      best_day: null,
    });
  });

  it("does not penalise days before the first submission", () => {
    const stats = computePlayerStats(
      [row("a", "2026-11-09", 100), row("a", "2026-11-10", 50)],
      "2026-11-10",
      ["a"],
    ).a;
    expect(stats.first_day).toBe("2026-11-09");
    expect(stats.average_per_day).toBe(75);
    expect(stats.average_per_game).toBe(75);
  });

  it("counts missed days since the first submission as zero for the per-day average only", () => {
    const stats = computePlayerStats(
      [row("a", "2026-11-01", 100), row("a", "2026-11-04", 200)],
      "2026-11-04",
      ["a"],
    ).a;
    expect(stats.total_points).toBe(300);
    expect(stats.days_played).toBe(2);
    expect(stats.average_per_day).toBe(75); // 300 / 4 calendar days
    expect(stats.average_per_game).toBe(150); // 300 / 2 games
    expect(stats.longest_streak).toBe(1);
    expect(stats.current_streak).toBe(1);
  });

  it("sums several games on one day into that day and counts the day once", () => {
    const stats = computePlayerStats(
      [row("a", "2026-11-02", 100), row("a", "2026-11-02", 250), row("a", "2026-11-03", 10)],
      "2026-11-03",
      ["a"],
    ).a;
    expect(stats.days_played).toBe(2);
    expect(stats.games_played).toBe(3);
    expect(stats.total_points).toBe(360);
    expect(stats.average_per_day).toBe(180);
    expect(stats.average_per_game).toBe(120);
    expect(stats.best_day).toEqual({ date: "2026-11-02", points: 350 });
  });

  it("keeps the current streak alive when only the still-open as-of day is unplayed", () => {
    const rows = [row("a", "2026-11-07", 1), row("a", "2026-11-08", 1), row("a", "2026-11-09", 1)];
    const stats = computePlayerStats(rows, "2026-11-10", ["a"]).a;
    expect(stats.current_streak).toBe(3);
    // the open day is not charged as a zero day
    expect(stats.average_per_day).toBe(1);
  });

  it("breaks the streak and charges missed days once a full day has been skipped", () => {
    const rows = [row("a", "2026-11-07", 3), row("a", "2026-11-08", 3)];
    const stats = computePlayerStats(rows, "2026-11-10", ["a"]).a;
    expect(stats.current_streak).toBe(0);
    expect(stats.longest_streak).toBe(2);
    expect(stats.average_per_day).toBe(2); // 6 points over Nov 7-9
  });

  it("extends the streak when the as-of day is played", () => {
    const rows = [row("a", "2026-11-09", 1), row("a", "2026-11-10", 1)];
    expect(computePlayerStats(rows, "2026-11-10", ["a"]).a.current_streak).toBe(2);
  });

  it("tracks the longest streak across gaps and month/year boundaries", () => {
    const rows = [
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
      "2027-01-05",
      "2027-01-06",
    ].map((date) => row("a", date, 10));
    const stats = computePlayerStats(rows, "2027-01-06", ["a"]).a;
    expect(stats.longest_streak).toBe(4);
    expect(stats.current_streak).toBe(2);
  });

  it("handles leap days when counting consecutive days", () => {
    const rows = [row("a", "2028-02-28", 1), row("a", "2028-02-29", 1), row("a", "2028-03-01", 1)];
    expect(computePlayerStats(rows, "2028-03-01", ["a"]).a.longest_streak).toBe(3);
  });

  it("ignores submissions after the as-of day and unknown players", () => {
    const rows = [
      row("a", "2026-11-10", 5),
      row("a", "2026-11-11", 999),
      row("ghost", "2026-11-10", 9),
    ];
    const result = computePlayerStats(rows, "2026-11-10", ["a"]);
    expect(Object.keys(result)).toEqual(["a"]);
    expect(result.a.total_points).toBe(5);
    expect(result.a.last_day).toBe("2026-11-10");
  });

  it("breaks best-day ties toward the earlier date", () => {
    const rows = [row("a", "2026-11-05", 100), row("a", "2026-11-03", 100)];
    expect(computePlayerStats(rows, "2026-11-05", ["a"]).a.best_day).toEqual({
      date: "2026-11-03",
      points: 100,
    });
  });

  it("rounds averages to two decimals", () => {
    const rows = [
      row("a", "2026-11-01", 100),
      row("a", "2026-11-02", 1),
      row("a", "2026-11-03", 0),
    ];
    expect(computePlayerStats(rows, "2026-11-03", ["a"]).a.average_per_day).toBe(33.67);
  });

  it("uses the worldwide as-of day, which can be a calendar day ahead of Pacific", () => {
    const asOf = latestWorldwideDay(new Date("2026-11-10T10:00:00.000Z"));
    expect(asOf).toBe("2026-11-11");
    const rows = [row("a", "2026-11-09", 1), row("a", "2026-11-10", 1)];
    // 11-11 is already open somewhere but unplayed: streak stays alive
    expect(computePlayerStats(rows, asOf, ["a"]).a.current_streak).toBe(2);
    expect(
      computePlayerStats(rows, latestWorldwideDay(new Date("2026-11-12T10:00:00.000Z")), ["a"]).a
        .current_streak,
    ).toBe(0);
  });
});

describe("rankStats", () => {
  it("ranks by total points with shared ties and unplayed players last", () => {
    const stats = computePlayerStats(
      [row("a", "2026-11-01", 100), row("b", "2026-11-01", 100), row("c", "2026-11-01", 300)],
      "2026-11-01",
      ["a", "b", "c", "d"],
    );
    const names = { a: "Ada", b: "Bo", c: "Cy", d: "Di" };
    const ranked = rankStats(Object.values(stats), names);
    expect(ranked.map((p) => [p.player_id, p.rank])).toEqual([
      ["c", 1],
      ["a", 2],
      ["b", 2],
      ["d", null],
    ]);
  });
});
