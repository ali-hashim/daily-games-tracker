export interface RankablePlayer {
  id: string;
  name: string;
  score: number | null;
}

export type RankedPlayer<T extends RankablePlayer> = T & { rank: number | null };

export function rankPlayers<T extends RankablePlayer>(players: readonly T[]): RankedPlayer<T>[] {
  const rows = [...players].sort((a, b) => {
    const aMissing = a.score === null;
    const bMissing = b.score === null;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (!aMissing && a.score !== b.score) return (b.score ?? 0) - (a.score ?? 0);

    const nameOrder = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    return nameOrder || a.id.localeCompare(b.id);
  });

  let previousScore: number | null = null;
  let rank: number | null = null;

  return rows.map((player, index) => {
    if (player.score !== null && (previousScore === null || player.score !== previousScore)) {
      rank = index + 1;
    }
    if (player.score !== null) previousScore = player.score;
    return { ...player, rank: player.score === null ? null : rank };
  });
}

export type RankMovement = "📈" | "📉" | "➖";

export function movement(
  currentRank: number | null,
  yesterdayRank: number | null,
): RankMovement | null {
  if (currentRank === null || yesterdayRank === null) return null;
  if (currentRank < yesterdayRank) return "📈";
  if (currentRank > yesterdayRank) return "📉";
  return "➖";
}
