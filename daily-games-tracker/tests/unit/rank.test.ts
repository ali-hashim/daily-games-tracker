import { describe, expect, it } from "vitest";
import { movement, rankPlayers } from "../../shared/rank";

describe("competition ranking", () => {
  it("uses 1, 1, 3 and alphabetical display ordering within ties", () => {
    const result = rankPlayers([
      { id: "zoe", name: "Zoe", score: 100 },
      { id: "alex", name: "Alex", score: 100 },
      { id: "sam", name: "Sam", score: 50 },
      { id: "chris", name: "Chris", score: null },
      { id: "bailey", name: "Bailey", score: null },
    ]);

    expect(result.map(({ name, rank }) => [name, rank])).toEqual([
      ["Alex", 1],
      ["Zoe", 1],
      ["Sam", 3],
      ["Bailey", null],
      ["Chris", null],
    ]);
  });

  it("treats zero as played and sorts it ahead of missing", () => {
    const result = rankPlayers([
      { id: "missing", name: "Not played", score: null },
      { id: "zero", name: "Missed every round", score: 0 },
    ]);
    expect(result.map(({ rank }) => rank)).toEqual([1, null]);
  });

  it("uses a stable id fallback when normalized names are equal", () => {
    const result = rankPlayers([
      { id: "b", name: "alex", score: 10 },
      { id: "a", name: "Alex", score: 10 },
    ]);
    expect(result.map(({ id }) => id)).toEqual(["a", "b"]);
  });
});

describe("rank movement", () => {
  it("compares the current rank with a supplied prior-day rank", () => {
    expect(movement(1, 3)).toBe("📈");
    expect(movement(3, 1)).toBe("📉");
    expect(movement(2, 2)).toBe("➖");
    expect(movement(2, null)).toBeNull();
  });
});
