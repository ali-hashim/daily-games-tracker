import { GAMES, KRILLION_SCORE_EMOJI } from "../../shared/game-config";
import { movement, rankPlayers } from "../../shared/rank";
import type { GameKey } from "../../shared/types";
import type { AppEnv } from "./runtime";

interface ScoreboardRow {
  player_id: string;
  display_name: string;
  game_key: GameKey;
  external_puzzle_key: string | null;
  daily_score: number | null;
  cumulative_total: number;
  games_played: number;
  previous_total: number;
  previous_games: number;
  round_number: number | null;
  raw_score: number | null;
}
interface PlayerScore {
  id: string;
  name: string;
  score: number | null;
  total: number;
  played: number;
  previousTotal: number;
  previousPlayed: number;
  rounds: Map<number, number>;
}
const numbers = new Intl.NumberFormat("en-US");
const dates = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const gameDates = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const separator = "━━━━━━━━━━━━━━━━━━━━";

/** Internal score-only read. Called only after a new authenticated submission commits.
 * A single SQL statement gives a consistent snapshot; answers/prompts/original emojis
 * are deliberately absent from the SELECT, even for players whose details are locked.
 */
export async function submissionScoreboard(
  env: AppEnv,
  date: string,
  whtUrl: string,
  playerId: string,
  submittedGame: GameKey,
) {
  const rows = await env.DB.prepare(
    `
    WITH totals AS (
      SELECT s.player_id, s.game_id, SUM(s.final_score) AS cumulative_total,
        COUNT(*) AS games_played,
        SUM(CASE WHEN d.game_date < ? THEN s.final_score ELSE 0 END) AS previous_total,
        SUM(CASE WHEN d.game_date < ? THEN 1 ELSE 0 END) AS previous_games
      FROM submissions s JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
      WHERE d.game_date <= ? GROUP BY s.player_id, s.game_id
    )
    SELECT p.id AS player_id, p.display_name, g.key AS game_key, d.external_puzzle_key, s.final_score AS daily_score,
      COALESCE(t.cumulative_total, 0) AS cumulative_total, COALESCE(t.games_played, 0) AS games_played,
      COALESCE(t.previous_total, 0) AS previous_total, COALESCE(t.previous_games, 0) AS previous_games,
      r.round_number, r.raw_score
    FROM players p CROSS JOIN games g
    LEFT JOIN totals t ON t.player_id = p.id AND t.game_id = g.id
    LEFT JOIN game_days d ON d.game_id = g.id AND d.game_date = ?
    LEFT JOIN submissions s ON s.player_id = p.id AND s.game_day_id = d.id AND s.game_id = g.id
    LEFT JOIN round_results r ON r.submission_id = s.id
    WHERE p.active = 1 AND g.active = 1 AND g.key IN ('krillion','maptap')
  `,
  )
    .bind(date, date, date, date)
    .all<ScoreboardRow>();
  const games = new Map<GameKey, Map<string, PlayerScore>>();
  const puzzles = new Map<GameKey, string>();
  for (const row of rows.results) {
    if (row.external_puzzle_key !== null) puzzles.set(row.game_key, row.external_puzzle_key);
    if (!games.has(row.game_key)) games.set(row.game_key, new Map());
    const players = games.get(row.game_key)!;
    let player = players.get(row.player_id);
    if (!player) {
      player = {
        id: row.player_id,
        name: row.display_name,
        score: row.daily_score,
        total: row.cumulative_total,
        played: row.games_played,
        previousTotal: row.previous_total,
        previousPlayed: row.previous_games,
        rounds: new Map(),
      };
      players.set(row.player_id, player);
    }
    if (row.round_number !== null && row.raw_score !== null)
      player.rounds.set(row.round_number, row.raw_score);
  }
  const sections: string[] = [];
  let dailyRank: number | null = null;
  for (const gameKey of ["krillion", "maptap"] as const) {
    const players = games.get(gameKey);
    if (!players) continue;
    const values = [...players.values()];
    const current = new Map(
      rankPlayers(values.map((p) => ({ ...p, score: p.played ? p.total : null }))).map((p) => [
        p.id,
        p.rank,
      ]),
    );
    const prior = new Map(
      rankPlayers(
        values.map((p) => ({ ...p, score: p.previousPlayed ? p.previousTotal : null })),
      ).map((p) => [p.id, p.rank]),
    );
    const lines = rankPlayers(values).map((p) => {
      if (gameKey === submittedGame && p.id === playerId) dailyRank = p.rank;
      const rank = current.get(p.id) ?? null;
      const previous = prior.get(p.id) ?? null;
      const allTime =
        rank === null
          ? "— · 0 NEW"
          : `#${rank} · ${numbers.format(p.total)} ${movement(rank, previous) ?? "NEW"}`;
      const header =
        p.score === null
          ? `Not played — ${p.name} [${allTime}]`
          : `#${p.rank} · ${numbers.format(p.score)} — ${p.name} [${allTime}]`;
      if (p.score === null) return header;
      const expected = GAMES[gameKey].roundCount;
      if (p.rounds.size !== expected) throw new Error("Scoreboard round set incomplete");
      const roundValues = Array.from({ length: expected }, (_, i) => {
        const score = p.rounds.get(i + 1);
        if (score === undefined) throw new Error("Scoreboard round set incomplete");
        if (gameKey === "maptap") return String(score);
        const emoji = KRILLION_SCORE_EMOJI[score];
        if (!emoji) throw new Error("Scoreboard score unsupported");
        return emoji;
      });
      return `${header}\n${roundValues.join(gameKey === "krillion" ? " " : " · ")}`;
    });
    const gameDate = new Date(`${date}T12:00:00Z`);
    const detail =
      gameKey === "krillion"
        ? `#${puzzles.get(gameKey) ?? "—"}`
        : gameDates.format(gameDate).toUpperCase();
    sections.push(
      `${GAMES[gameKey].icon} ${gameKey.toUpperCase()} — ${detail}\n\n${lines.join("\n\n")}`,
    );
  }
  return {
    scoreboard_text: `📊 WHT Leaderboard — ${dates.format(new Date(`${date}T12:00:00Z`)).toUpperCase()}\n\n${sections.join(`\n\n${separator}\n\n`)}\n\n${separator}\n\n🔗 FULL DAILY LEADERBOARDS\n${whtUrl}`,
    daily_rank: dailyRank,
  };
}
