import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { KRILLION_ALLOWED_SCORES, MAPTAP_WEIGHTS } from "../../shared/game-config";

interface ExpectedRound {
  round_number: number;
  answer?: string | null;
  raw_score: number;
  emoji?: string;
  weight?: number;
}

interface ExpectedFixture {
  game: "krillion" | "maptap";
  rounds: ExpectedRound[];
  reported_total: number;
  calculated_total: number;
}

const fixtureRoot = path.resolve("tests", "fixtures");

async function loadExpected(game: "krillion" | "maptap"): Promise<ExpectedFixture[]> {
  const directory = path.join(fixtureRoot, game);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".expected.json"));
  return Promise.all(
    names.map(async (name) => {
      const raw = await readFile(path.join(directory, name), "utf8");
      await expect(
        readFile(path.join(directory, name.replace(".expected.json", ".txt")), "utf8"),
      ).resolves.toBeTruthy();
      return JSON.parse(raw) as ExpectedFixture;
    }),
  );
}

describe("golden fixture inventory", () => {
  it("contains two internally consistent Krillion captures", async () => {
    const fixtures = await loadExpected("krillion");
    expect(fixtures).toHaveLength(2);

    for (const fixture of fixtures) {
      expect(fixture.game).toBe("krillion");
      expect(fixture.rounds.map(({ round_number }) => round_number)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(
        fixture.rounds.every(({ raw_score }) => KRILLION_ALLOWED_SCORES.includes(raw_score)),
      ).toBe(true);
      const sum = fixture.rounds.reduce((total, round) => total + round.raw_score, 0);
      expect(sum).toBe(fixture.reported_total);
      expect(fixture.calculated_total).toBe(fixture.reported_total);
    }

    expect(fixtures.map(({ reported_total }) => reported_total).sort()).toEqual([360, 365]);
    expect(
      fixtures
        .flatMap(({ rounds }) => rounds)
        .some((round) => round.answer === null && round.raw_score === 0),
    ).toBe(true);
    expect(
      fixtures
        .flatMap(({ rounds }) => rounds)
        .some((round) => round.answer === '"e"' && round.raw_score === 0),
    ).toBe(true);
  });

  it("contains six internally consistent MapTap captures", async () => {
    const fixtures = await loadExpected("maptap");
    expect(fixtures).toHaveLength(6);

    for (const fixture of fixtures) {
      expect(fixture.game).toBe("maptap");
      expect(fixture.rounds).toHaveLength(5);
      expect(fixture.rounds.map(({ round_number }) => round_number)).toEqual([1, 2, 3, 4, 5]);
      expect(fixture.rounds.map(({ weight }) => weight)).toEqual([...MAPTAP_WEIGHTS]);
      expect(
        fixture.rounds.every(
          ({ raw_score, emoji }) => raw_score >= 0 && raw_score <= 100 && Boolean(emoji),
        ),
      ).toBe(true);
      const total = fixture.rounds.reduce(
        (sum, round, index) => sum + round.raw_score * MAPTAP_WEIGHTS[index],
        0,
      );
      expect(total).toBe(fixture.reported_total);
      expect(fixture.calculated_total).toBe(fixture.reported_total);
    }

    expect(fixtures.map(({ reported_total }) => reported_total).sort()).toEqual([
      780, 810, 834, 835, 858, 894,
    ]);
  });
});
