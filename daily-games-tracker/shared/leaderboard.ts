import type { GameKey } from "./types";

export type LeaderboardMovement = "📈" | "📉" | "➖" | "NEW";

export interface DailyRoundReadModel {
  round_number: number;
  prompt: string | null;
  answer: string | null;
  raw_score: number;
  original_emoji: string | null;
}

export interface DailyPlayerReadModel {
  id: string;
  display_name: string;
  daily_score: number | null;
  rank: number | null;
  badge: string;
  rounds: DailyRoundReadModel[];
}

export interface DailyGameBaseReadModel {
  key: GameKey;
  display_name: string;
  icon: string;
  round_count: number;
  external_puzzle_key: string | null;
  locked: boolean;
}

export interface LockedDailyGameReadModel extends DailyGameBaseReadModel {
  locked: true;
  lock_reason: string;
  players?: never;
}

export interface UnlockedDailyGameReadModel extends DailyGameBaseReadModel {
  locked: false;
  players: DailyPlayerReadModel[];
  lock_reason?: never;
}

export type DailyGameReadModel = LockedDailyGameReadModel | UnlockedDailyGameReadModel;

export interface DailyLeaderboardReadModel {
  status: "ok";
  date: string;
  current_day: string;
  latest_available_day: string;
  player: { id: string; display_name: string };
  copy_eligible: boolean;
  games: DailyGameReadModel[];
}

export interface AllTimePlayerReadModel {
  id: string;
  display_name: string;
  total: number;
  games_played: number;
  average: number | null;
  rank: number | null;
  badge: string;
  movement: LeaderboardMovement;
}

export interface AllTimeDayReadModel {
  date: string;
  external_puzzle_key: string;
  scores: Record<string, number | null>;
}

export interface AllTimeGameReadModel {
  key: GameKey;
  display_name: string;
  icon: string;
  round_count: number;
  players: AllTimePlayerReadModel[];
  days: AllTimeDayReadModel[];
}

export interface AllTimeLeaderboardReadModel {
  status: "ok";
  as_of_date: string;
  games: AllTimeGameReadModel[];
}
