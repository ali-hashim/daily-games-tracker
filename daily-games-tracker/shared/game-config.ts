import type { GameKey } from "./types";

export const SHORTCUT_VERSION = {
  minimum: 1,
  latest: 1,
} as const;

export const PARSER_VERSIONS: Readonly<Record<GameKey, string>> = {
  krillion: "krillion.v1",
  maptap: "maptap.v1",
  farflung: "farflung.v1",
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

/** Farflung answer tiers (rarest first) and their distance points; a wrong pin is a Miss. */
export const FARFLUNG_TIERS = [
  { name: "Farflung", short: "FAR", points: 100 },
  { name: "Elusive", short: "ELU", points: 85 },
  { name: "Rare", short: "RAR", points: 70 },
  { name: "Uncommon", short: "UNC", points: 55 },
  { name: "Common", short: "COM", points: 40 },
  { name: "Miss", short: "MISS", points: 0 },
] as const;

export const FARFLUNG_ALLOWED_SCORES = Object.freeze(FARFLUNG_TIERS.map((tier) => tier.points));

export function farflungTierForScore(points: number): (typeof FARFLUNG_TIERS)[number] | null {
  return FARFLUNG_TIERS.find((tier) => tier.points === points) ?? null;
}

export const FARFLUNG_DATE_ANCHOR = {
  expeditionNumber: 39,
  gameDate: "2026-11-12",
} as const;

export const FARFLUNG_PLACEMENT_BADGES = ["🧭", "🏔️", "🗺️", "🎒", "🥾", "⛺", "🛶", "🐢"] as const;

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

/** Display and query order of the supported games. */
export const GAME_ORDER = ["krillion", "maptap", "farflung"] as const satisfies readonly GameKey[];

/** SQL fragments for the supported-game filter and order (trusted constants, not user input). */
export const GAME_KEYS_SQL = GAME_ORDER.map((key) => `'${key}'`).join(", ");
export const GAME_ORDER_SQL = (column: string) =>
  `CASE ${column} ${GAME_ORDER.map((key, i) => `WHEN '${key}' THEN ${i}`).join(" ")} ELSE ${GAME_ORDER.length} END`;

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
  farflung: {
    key: "farflung",
    displayName: "Farflung",
    icon: "🧭",
    roundCount: 5,
  },
} as const satisfies Record<
  GameKey,
  { key: GameKey; displayName: string; icon: string; roundCount: number }
>;
