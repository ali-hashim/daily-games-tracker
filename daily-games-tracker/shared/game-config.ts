import type { GameKey } from "./types";

export const SHORTCUT_VERSION = {
  minimum: 1,
  latest: 1,
} as const;

export const PARSER_VERSIONS: Readonly<Record<GameKey, string>> = {
  krillion: "krillion.v1",
  maptap: "maptap.v1",
};

export const KRILLION_SCORE_EMOJI: Readonly<Record<number, string>> = {
  0: "⬛",
  10: "🫧",
  15: "🤡",
  30: "🐟",
  60: "🦑",
  85: "🏮",
  100: "🌟",
};

export const KRILLION_ALLOWED_SCORES = Object.freeze(Object.keys(KRILLION_SCORE_EMOJI).map(Number));

export const KRILLION_DATE_ANCHOR = {
  puzzleNumber: 97,
  gameDate: "2026-10-20",
} as const;

export const KRILLION_SUPPORTED_PUZZLE_RANGE = {
  min: 1,
  max: 1_000_000,
} as const;

export const MAPTAP_WEIGHTS = [1, 1, 2, 3, 3] as const;

export const KRILLION_PLACEMENT_BADGES = ["🌟", "🏮", "🦑", "🐟", "🤡", "🫧"] as const;

export const MAPTAP_PLACEMENT_BADGES = [
  "🎯",
  "🔥",
  "🏅",
  "🏆",
  "🎉",
  "👏",
  "🌞",
  "😁",
  "😂",
  "🫢",
  "🙈",
  "😒",
] as const;

export const GAMES = {
  krillion: {
    key: "krillion",
    displayName: "Krillion",
    icon: "🦐",
    roundCount: 7,
  },
  maptap: {
    key: "maptap",
    displayName: "MapTap",
    icon: "🌎",
    roundCount: 5,
  },
} as const satisfies Record<
  GameKey,
  { key: GameKey; displayName: string; icon: string; roundCount: number }
>;
