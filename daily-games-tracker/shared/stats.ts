import { previousCalendarDay } from "./day";
import { rankPlayers } from "./rank";

/**
 * Stats-board definitions (also shown to players on the All-Time page):
 *
 * - A "day played" is a challenge date (game_days.game_date, a calendar date,
 *   not a timestamp) on which the player has at least one saved submission in
 *   any active game. Points for that day are the sum of its final scores.
 * - Average per game = total points / submissions. Days not played never count.
 * - Average per day = total points / calendar days from the player's FIRST
 *   played day through the end of the measured span. Days before the first
 *   submission are never counted. Skipped days after it count as zero points.
 * - The measured span ends on the latest day whose worldwide submission window
 *   has closed, or on the player's last played day if that is later. A day
 *   that can still be submitted somewhere in the world (up to three at once,
 *   including the Pacific day being played) is never charged as a zero day
 *   and never breaks a streak.
 * - Streaks are runs of consecutive played dates. The current streak is alive
 *   only if it reaches the end of the measured span; otherwise it is 0.
 */
export interface StatsScoreRow {
  player_id: string;
  game_date: string;
  final_score: number;
}

export interface PlayerStats {
  player_id: string;
  total_points: number;
  days_played: number;
  games_played: number;
  first_day: string | null;
  last_day: string | null;
  average_per_day: number | null;
  average_per_game: number | null;
  current_streak: number;
  longest_streak: number;
  best_day: { date: string; points: number } | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function dayNumber(isoDay: string): number {
  return Math.round(Date.parse(`${isoDay}T12:00:00.000Z`) / 86_400_000);
}

/** Inclusive count of calendar days from `from` to `to` (both YYYY-MM-DD). */
export function inclusiveDayCount(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from) + 1;
}

export function computePlayerStats(
  rows: readonly StatsScoreRow[],
  asOfDate: string,
  playerIds: readonly string[],
  lastClosedDay: string = previousCalendarDay(asOfDate),
): Record<string, PlayerStats> {
  const dayBeforeAsOf = previousCalendarDay(asOfDate);
  const spanEndIfUnplayed = lastClosedDay < dayBeforeAsOf ? lastClosedDay : dayBeforeAsOf;
  const byPlayer = new Map<string, { games: number; days: Map<string, number> }>();
  for (const id of playerIds) byPlayer.set(id, { games: 0, days: new Map() });

  for (const row of rows) {
    const entry = byPlayer.get(row.player_id);
    if (!entry || row.game_date > asOfDate) continue;
    entry.games += 1;
    entry.days.set(row.game_date, (entry.days.get(row.game_date) ?? 0) + row.final_score);
  }

  const result: Record<string, PlayerStats> = {};
  for (const id of playerIds) {
    const { games, days } = byPlayer.get(id)!;
    const dates = [...days.keys()].sort();
    if (dates.length === 0) {
      result[id] = {
        player_id: id,
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
      };
      continue;
    }

    let total = 0;
    let best: { date: string; points: number } | null = null;
    let longest = 0;
    let run = 0;
    let previous: string | null = null;
    for (const date of dates) {
      const points = days.get(date)!;
      total += points;
      if (!best || points > best.points) best = { date, points };
      run = previous !== null && previousCalendarDay(date) === previous ? run + 1 : 1;
      longest = Math.max(longest, run);
      previous = date;
    }

    const first = dates[0];
    const last = dates[dates.length - 1];
    const spanEnd = last > spanEndIfUnplayed ? last : spanEndIfUnplayed;
    const spanDays = Math.max(1, inclusiveDayCount(first, spanEnd));
    result[id] = {
      player_id: id,
      total_points: total,
      days_played: dates.length,
      games_played: games,
      first_day: first,
      last_day: last,
      average_per_day: round2(total / spanDays),
      average_per_game: round2(total / games),
      current_streak: last >= spanEnd ? run : 0,
      longest_streak: longest,
      best_day: best,
    };
  }
  return result;
}

export type RankedPlayerStats = PlayerStats & {
  display_name: string;
  id: string;
  rank: number | null;
};

/** Rank by cumulative points (ties share a rank); players with no plays are unranked and last. */
export function rankStats(
  stats: readonly PlayerStats[],
  names: Readonly<Record<string, string>>,
): RankedPlayerStats[] {
  return rankPlayers(
    stats.map((player) => ({
      ...player,
      id: player.player_id,
      name: names[player.player_id] ?? player.player_id,
      score: player.days_played === 0 ? null : player.total_points,
    })),
  ).map(({ name, score: _score, ...player }) => {
    void _score;
    return { ...player, display_name: name };
  });
}
