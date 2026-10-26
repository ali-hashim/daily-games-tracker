import {
  isWorldwideWindowOpen,
  latestWorldwideDay,
  pacificDay,
  previousCalendarDay,
} from "../../shared/day";
import {
  GAMES,
  KRILLION_PLACEMENT_BADGES,
  MAPTAP_PLACEMENT_BADGES,
} from "../../shared/game-config";
import { movement, rankPlayers } from "../../shared/rank";
import type {
  AllTimeDayReadModel,
  AllTimeGameReadModel,
  AllTimeLeaderboardReadModel,
  AllTimePlayerReadModel,
  DailyGameReadModel,
  DailyLeaderboardReadModel,
  DailyPlayerReadModel,
  DailyRoundReadModel,
  LeaderboardMovement,
} from "../../shared/leaderboard";
import type { GameKey } from "../../shared/types";
import { ApiError } from "./http";
import type { AppEnv } from "./runtime";

interface GameRow {
  id: string;
  key: GameKey;
  display_name: string;
  round_count: number;
  config_json: string;
}

interface PlayerRow {
  id: string;
  display_name: string;
}

interface DailyScoreRow extends PlayerRow {
  daily_score: number | null;
  submission_id: string | null;
  external_puzzle_key: string | null;
}

interface DailyRoundRow {
  player_id: string;
  round_number: number;
  prompt: string | null;
  answer: string | null;
  raw_score: number;
  original_emoji: string | null;
}

interface AllTimeScoreRow {
  player_id: string;
  display_name: string;
  game_key: GameKey;
  game_date: string;
  external_puzzle_key: string;
  final_score: number;
}

interface ScoreAccumulator {
  id: string;
  display_name: string;
  total: number;
  gamesPlayed: number;
  previousTotal: number;
  previousGamesPlayed: number;
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function assertCalendarDay(value: string, errorCode = "INVALID_DATE"): void {
  if (!ISO_DAY.test(value)) {
    throw new ApiError(400, errorCode, "Use a calendar date in YYYY-MM-DD format.");
  }

  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, errorCode, "Use a valid calendar date in YYYY-MM-DD format.");
  }
}

export function parseDailyDate(requestUrl: string): string {
  const url = new URL(requestUrl);
  const values = url.searchParams.getAll("date");
  if (values.length !== 1 || !values[0]) {
    throw new ApiError(400, "INVALID_DATE", "Provide exactly one date=YYYY-MM-DD query value.");
  }
  assertCalendarDay(values[0]);
  return values[0];
}

function gameIcon(row: GameRow): string {
  const configured = JSON.parse(row.config_json) as { icon?: unknown };
  return typeof configured.icon === "string" ? configured.icon : GAMES[row.key].icon;
}

async function activeGames(env: AppEnv): Promise<GameRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, key, display_name, round_count, config_json
     FROM games
     WHERE active = 1 AND key IN ('krillion', 'maptap')
     ORDER BY CASE key WHEN 'krillion' THEN 0 WHEN 'maptap' THEN 1 ELSE 2 END`,
  ).all<GameRow>();
  return results;
}

async function activePlayers(env: AppEnv): Promise<PlayerRow[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, display_name
     FROM players
     WHERE active = 1
     ORDER BY display_name COLLATE NOCASE, id`,
  ).all<PlayerRow>();
  return results;
}

function placementBadge(
  gameKey: GameKey,
  rank: number | null,
  score: number | null,
  currentDay = false,
): string {
  if (rank === null) return gameKey === "krillion" ? "⬛" : "—";
  if (currentDay && gameKey === "krillion" && score === 0) return "⬛";

  const badges = gameKey === "krillion" ? KRILLION_PLACEMENT_BADGES : MAPTAP_PLACEMENT_BADGES;
  return badges[Math.min(rank - 1, badges.length - 1)];
}

function roundReadModel(row: DailyRoundRow): DailyRoundReadModel {
  return {
    round_number: row.round_number,
    prompt: row.prompt,
    answer: row.answer,
    raw_score: row.raw_score,
    original_emoji: row.original_emoji,
  };
}

async function hasPlayerSubmission(
  env: AppEnv,
  playerId: string,
  gameId: string,
  date: string,
): Promise<boolean> {
  const row = await env.DB.prepare(
    `SELECT s.id AS submission_id
     FROM submissions s
     JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
     WHERE s.player_id = ? AND s.game_id = ? AND d.game_date = ?
     LIMIT 1`,
  )
    .bind(playerId, gameId, date)
    .first<{ submission_id: string }>();
  return Boolean(row);
}

export async function playerSubmissionGameOnDate(
  env: AppEnv,
  playerId: string,
  date: string,
): Promise<GameKey | null> {
  const row = await env.DB.prepare(
    `SELECT g.key AS game_key
     FROM submissions s
     JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
     JOIN games g ON g.id = s.game_id
     WHERE s.player_id = ? AND d.game_date = ?
       AND g.active = 1 AND g.key IN ('krillion', 'maptap')
     ORDER BY CASE g.key WHEN 'krillion' THEN 0 WHEN 'maptap' THEN 1 ELSE 2 END
     LIMIT 1`,
  )
    .bind(playerId, date)
    .first<{ game_key: GameKey }>();
  return row?.game_key ?? null;
}

async function readUnlockedDailyGame(
  env: AppEnv,
  game: GameRow,
  date: string,
): Promise<DailyGameReadModel> {
  const { results: scoreRows } = await env.DB.prepare(
    `SELECT p.id, p.display_name, s.final_score AS daily_score,
            s.id AS submission_id, d.external_puzzle_key
     FROM players p
     LEFT JOIN game_days d ON d.game_id = ? AND d.game_date = ?
     LEFT JOIN submissions s
       ON s.player_id = p.id AND s.game_id = ? AND s.game_day_id = d.id
     WHERE p.active = 1
     ORDER BY p.display_name COLLATE NOCASE, p.id`,
  )
    .bind(game.id, date, game.id)
    .all<DailyScoreRow>();

  const { results: roundRows } = await env.DB.prepare(
    `SELECT s.player_id, r.round_number, r.prompt, r.answer, r.raw_score, r.original_emoji
     FROM players p
     JOIN submissions s ON s.player_id = p.id AND s.game_id = ?
     JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
     JOIN round_results r ON r.submission_id = s.id
     WHERE p.active = 1 AND d.game_date = ?
     ORDER BY s.player_id, r.round_number`,
  )
    .bind(game.id, date)
    .all<DailyRoundRow>();

  const roundsByPlayer = new Map<string, DailyRoundReadModel[]>();
  for (const row of roundRows) {
    const rounds = roundsByPlayer.get(row.player_id) ?? [];
    rounds.push(roundReadModel(row));
    roundsByPlayer.set(row.player_id, rounds);
  }

  const ranked = rankPlayers(
    scoreRows.map((row) => ({
      id: row.id,
      name: row.display_name,
      score: row.daily_score,
    })),
  );
  const externalPuzzleKey =
    scoreRows.find((row) => row.external_puzzle_key)?.external_puzzle_key ?? null;

  return {
    key: game.key,
    display_name: game.display_name,
    icon: gameIcon(game),
    round_count: game.round_count,
    external_puzzle_key: externalPuzzleKey,
    locked: false,
    players: ranked.map((player): DailyPlayerReadModel => ({
      id: player.id,
      display_name: player.name,
      daily_score: player.score,
      rank: player.rank,
      badge: placementBadge(game.key, player.rank, player.score, true),
      rounds: roundsByPlayer.get(player.id) ?? [],
    })),
  };
}

async function readDailyGame(
  env: AppEnv,
  game: GameRow,
  playerId: string,
  date: string,
  now: Date,
): Promise<DailyGameReadModel> {
  if (
    isWorldwideWindowOpen(date, now) &&
    !(await hasPlayerSubmission(env, playerId, game.id, date))
  ) {
    return {
      key: game.key,
      display_name: game.display_name,
      icon: gameIcon(game),
      round_count: game.round_count,
      external_puzzle_key: null,
      locked: true,
      lock_reason: `Play and submit the ${date} ${game.display_name} result to unlock this table.`,
    };
  }

  return readUnlockedDailyGame(env, game, date);
}

export async function readDailyLeaderboard(
  env: AppEnv,
  player: { id: string; display_name: string },
  date: string,
  now = new Date(),
): Promise<DailyLeaderboardReadModel> {
  assertCalendarDay(date);
  const currentDay = pacificDay(now);
  const latestAvailableDay = latestWorldwideDay(now);
  if (date > latestAvailableDay) {
    throw new ApiError(400, "DATE_IN_FUTURE", "Daily results are not available for a future date.");
  }

  const games = await activeGames(env);
  return {
    status: "ok",
    date,
    current_day: currentDay,
    latest_available_day: latestAvailableDay,
    player,
    copy_eligible: Boolean(await playerSubmissionGameOnDate(env, player.id, date)),
    games: await Promise.all(games.map((game) => readDailyGame(env, game, player.id, date, now))),
  };
}

function average(total: number, gamesPlayed: number): number | null {
  if (gamesPlayed === 0) return null;
  return Math.round((total / gamesPlayed) * 100) / 100;
}

function allTimeMovement(
  currentRank: number | null,
  previousRank: number | null,
): LeaderboardMovement {
  return currentRank === null || previousRank === null
    ? "NEW"
    : (movement(currentRank, previousRank) ?? "NEW");
}

function makeAccumulator(player: PlayerRow): ScoreAccumulator {
  return {
    id: player.id,
    display_name: player.display_name,
    total: 0,
    gamesPlayed: 0,
    previousTotal: 0,
    previousGamesPlayed: 0,
  };
}

function rankAllTimePlayers(
  gameKey: GameKey,
  players: ScoreAccumulator[],
): AllTimePlayerReadModel[] {
  const current = rankPlayers(
    players.map((player) => ({
      id: player.id,
      name: player.display_name,
      score: player.gamesPlayed === 0 ? null : player.total,
    })),
  );
  const previous = new Map(
    rankPlayers(
      players.map((player) => ({
        id: player.id,
        name: player.display_name,
        score: player.previousGamesPlayed === 0 ? null : player.previousTotal,
      })),
    ).map((player) => [player.id, player.rank]),
  );
  const byId = new Map(players.map((player) => [player.id, player]));

  return current.map((ranked) => {
    const player = byId.get(ranked.id)!;
    return {
      id: player.id,
      display_name: player.display_name,
      total: player.total,
      games_played: player.gamesPlayed,
      average: average(player.total, player.gamesPlayed),
      rank: ranked.rank,
      badge: placementBadge(
        gameKey,
        ranked.rank,
        player.gamesPlayed === 0 ? null : player.total,
        false,
      ),
      movement: allTimeMovement(ranked.rank, previous.get(player.id) ?? null),
    };
  });
}

function emptyScores(players: readonly PlayerRow[]): Record<string, number | null> {
  return Object.fromEntries(players.map((player) => [player.id, null]));
}

export async function readAllTimeLeaderboard(
  env: AppEnv,
  asOfDate: string | undefined = undefined,
  now = new Date(),
): Promise<AllTimeLeaderboardReadModel> {
  const effectiveAsOfDate = asOfDate ?? latestWorldwideDay(now);
  assertCalendarDay(effectiveAsOfDate);
  const priorDate = previousCalendarDay(effectiveAsOfDate);
  const [games, players, scoreRows] = await Promise.all([
    activeGames(env),
    activePlayers(env),
    env.DB.prepare(
      `SELECT s.player_id, p.display_name, g.key AS game_key,
              d.game_date, d.external_puzzle_key, s.final_score
       FROM submissions s
       JOIN players p ON p.id = s.player_id AND p.active = 1
       JOIN games g ON g.id = s.game_id AND g.active = 1
       JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
       WHERE d.game_date <= ?
       ORDER BY d.game_date DESC, s.player_id`,
    )
      .bind(effectiveAsOfDate)
      .all<AllTimeScoreRow>(),
  ]);

  const rowsByGame = new Map<GameKey, AllTimeScoreRow[]>();
  for (const row of scoreRows.results) {
    const rows = rowsByGame.get(row.game_key) ?? [];
    rows.push(row);
    rowsByGame.set(row.game_key, rows);
  }

  const resultGames: AllTimeGameReadModel[] = [];
  for (const game of games) {
    const accumulators = players.map(makeAccumulator);
    const byPlayer = new Map(accumulators.map((player) => [player.id, player]));
    const days = new Map<string, AllTimeDayReadModel>();

    for (const row of rowsByGame.get(game.key) ?? []) {
      const player = byPlayer.get(row.player_id);
      if (!player) continue;
      player.total += row.final_score;
      player.gamesPlayed += 1;
      if (row.game_date <= priorDate) {
        player.previousTotal += row.final_score;
        player.previousGamesPlayed += 1;
      }

      const day = days.get(row.game_date) ?? {
        date: row.game_date,
        external_puzzle_key: row.external_puzzle_key,
        scores: emptyScores(players),
      };
      day.scores[row.player_id] = row.final_score;
      days.set(row.game_date, day);
    }

    resultGames.push({
      key: game.key,
      display_name: game.display_name,
      icon: gameIcon(game),
      round_count: game.round_count,
      players: rankAllTimePlayers(game.key, accumulators),
      days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
    });
  }

  return { status: "ok", as_of_date: effectiveAsOfDate, games: resultGames };
}
