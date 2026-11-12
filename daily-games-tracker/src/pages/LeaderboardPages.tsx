import React, { useEffect, useMemo, useRef, useState } from "react";
import { ApiRequestError, apiRequest, copyText } from "../lib/api";
import {
  allTimeWindowSizeForWidth,
  createAllTimeDateWindow,
  type AllTimeWindowSize,
} from "../lib/all-time-window";
import { KRILLION_SCORE_EMOJI } from "../../shared/game-config";

void React;

type GameKey = "krillion" | "maptap";

interface DailyRound {
  round_number: number;
  prompt: string | null;
  answer: string | null;
  raw_score: number;
  original_emoji: string | null;
}

interface DailyPlayer {
  id: string;
  display_name: string;
  daily_score: number | null;
  rank: number | null;
  badge: string | null;
  rounds: DailyRound[];
}

interface DailyGame {
  key: GameKey;
  display_name: string;
  icon: string;
  round_count: number;
  external_puzzle_key: string | null;
  locked: boolean;
  lock_reason?: string;
  players?: DailyPlayer[];
}

interface DailyResponse {
  status: "ok";
  date: string;
  current_day: string;
  latest_available_day: string;
  player: { id: string; display_name: string };
  copy_eligible: boolean;
  games: DailyGame[];
}

interface CopyLeaderboardResponse {
  status: "ok";
  date: string;
  scoreboard_text: string;
}

export type CopyState =
  | { date: string | null; status: "idle" }
  | { date: string; status: "copying" | "success" | "error" };

export interface LeaderboardCopyController {
  invalidate: () => void;
  start: (date: string) => Promise<void>;
}

export function createLeaderboardCopyController(
  request: (date: string) => Promise<CopyLeaderboardResponse>,
  copy: (text: string) => Promise<boolean>,
  onStateChange: (state: CopyState) => void,
): LeaderboardCopyController {
  let generation = 0;

  const publish = (state: CopyState): void => {
    onStateChange(state);
  };

  return {
    invalidate(): void {
      generation += 1;
      publish({ date: null, status: "idle" });
    },
    async start(date: string): Promise<void> {
      const attempt = ++generation;
      publish({ date, status: "copying" });

      try {
        const response = await request(date);
        if (generation !== attempt) return;

        const copied = await copy(response.scoreboard_text);
        if (generation !== attempt) return;

        publish({ date, status: copied ? "success" : "error" });
      } catch {
        if (generation === attempt) publish({ date, status: "error" });
      }
    },
  };
}

interface AllTimePlayer {
  id: string;
  display_name: string;
  total: number;
  games_played: number;
  average: number | null;
  rank: number | null;
  badge: string | null;
  movement: "📈" | "📉" | "➖" | "NEW" | null;
}

interface AllTimeDay {
  date: string;
  external_puzzle_key: string | null;
  scores: Record<string, number | null>;
}

interface AllTimeGame {
  key: GameKey;
  display_name: string;
  icon: string;
  round_count: number;
  players: AllTimePlayer[];
  days: AllTimeDay[];
}

interface AllTimeResponse {
  status: "ok";
  as_of_date: string;
  games: AllTimeGame[];
}

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string | null): value is string {
  if (!value || !datePattern.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export interface DailyRoute {
  date: string | null;
  invalidDate: boolean;
}

export function parseDailyRoute(pathname: string, search: string): DailyRoute {
  if (pathname.startsWith("/daily/")) {
    const pathDate = pathname.slice("/daily/".length);
    return validDate(pathDate)
      ? { date: pathDate, invalidDate: false }
      : { date: null, invalidDate: Boolean(pathDate) };
  }

  if (pathname === "/daily") {
    const queryDate = new URLSearchParams(search).get("date");
    if (queryDate === null) return { date: null, invalidDate: false };
    return validDate(queryDate)
      ? { date: queryDate, invalidDate: false }
      : { date: null, invalidDate: true };
  }

  return { date: null, invalidDate: false };
}

function dateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function shortDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function allTimeDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(`${iso}T12:00:00Z`));
}

function shiftDate(iso: string, amount: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function formatScore(score: number | null): string {
  return score === null ? "—" : new Intl.NumberFormat("en-US").format(score);
}

function formatAverage(average: number | null): string {
  if (average === null) return "—";
  return average.toFixed(1).replace(/\.0$/, "");
}

export function krillionRoundEmoji(rawScore: number, originalEmoji: string | null): string {
  return KRILLION_SCORE_EMOJI[rawScore] ?? originalEmoji ?? "—";
}

export function historicalScoreLink(
  date: string,
  playerName: string,
  score: number | null,
): { href: string; ariaLabel: string } | null {
  if (score === null) return null;
  return {
    href: `/daily/${date}`,
    ariaLabel: `${playerName} score on ${shortDateLabel(date)}: ${formatScore(score)}`,
  };
}

export function orderDailyPlayers(players: DailyPlayer[]): DailyPlayer[] {
  return [...players].sort((a, b) => {
    const aScore = a.daily_score;
    const bScore = b.daily_score;
    const aMissing = aScore === null;
    const bMissing = bScore === null;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aScore !== null && bScore !== null && aScore !== bScore) {
      return bScore - aScore;
    }

    const nameOrder = a.display_name.localeCompare(b.display_name, "en", {
      sensitivity: "base",
    });
    return nameOrder || a.id.localeCompare(b.id);
  });
}

function moveToDaily(date: string): void {
  window.location.assign(`/daily/${date}`);
}

function ErrorNotice({ error }: { error: unknown }) {
  const message =
    error instanceof ApiRequestError
      ? error.message
      : "The leaderboard could not be loaded. Try again in a moment.";
  return (
    <div className="notice error" role="alert">
      {message}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <p className="leaderboard-status" role="status" aria-live="polite">
      {label}
    </p>
  );
}

function InvalidDateNotice() {
  return (
    <div className="notice error" role="alert">
      That date is not valid. Choose a real calendar date.
    </div>
  );
}

function PlayerHeading({ player, kind }: { player: DailyPlayer; kind: "daily" | "all-time" }) {
  return (
    <div className="player-heading">
      <span className="player-heading-top">
        <span className="rank-badge" aria-hidden="true">
          {player.badge ?? "—"}
        </span>
        <span className="player-rank">{player.rank === null ? "—" : `#${player.rank}`}</span>
      </span>
      <strong>{player.display_name}</strong>
      <span className="player-heading-score">
        {kind === "daily" ? formatScore(player.daily_score) : ""}
      </span>
    </div>
  );
}

function dailyCell(
  game: DailyGame,
  player: DailyPlayer,
  roundNumber: number,
  openPopover: string | null,
  onToggle: (popoverId: string) => void,
) {
  if (player.daily_score === null) return <span className="cell-muted">Not played</span>;
  const round = player.rounds.find((item) => item.round_number === roundNumber);
  if (!round) return <span className="cell-muted">—</span>;

  if (game.key === "krillion") {
    const emoji = krillionRoundEmoji(round.raw_score, round.original_emoji);
    const popoverId = `daily-krillion-answer-${player.id}-${roundNumber}`;
    const open = openPopover === popoverId;
    return (
      <button
        type="button"
        className="round-result krillion-result"
        aria-label={`${player.display_name} R${roundNumber} score: ${round.raw_score}`}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-describedby={open ? popoverId : undefined}
        onClick={() => onToggle(popoverId)}
      >
        <strong>{round.raw_score}</strong>
        <span className="round-meta">
          <span aria-hidden="true">{emoji}</span>
        </span>
      </button>
    );
  }

  return (
    <span className="round-result">
      <strong>{round.raw_score}</strong>
      <span className="round-meta">{round.original_emoji ?? ""}</span>
    </span>
  );
}

interface InfoPopoverProps {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
}

function InfoPopover({ id, label, open, onToggle }: InfoPopoverProps) {
  return (
    <span className="daily-info-popover">
      <button
        type="button"
        className="daily-info-control"
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onClick={onToggle}
      >
        {label}
      </button>
    </span>
  );
}

export function DailyGameTable({ game, date }: { game: DailyGame; date: string }) {
  const [openPopover, setOpenPopover] = useState<string | null>(null);
  const players = game.players ?? [];
  const orderedPlayers = orderDailyPlayers(players);
  const roundNumbers = Array.from({ length: game.round_count }, (_, index) => index + 1);
  const roundPrompt = (roundNumber: number) =>
    players.flatMap((player) => player.rounds).find((round) => round.round_number === roundNumber)
      ?.prompt ?? null;
  const togglePopover = (popoverId: string) =>
    setOpenPopover((current) => (current === popoverId ? null : popoverId));
  const roundPopoverPrefix = `daily-${game.key}-round-`;
  const answerPopoverPrefix = "daily-krillion-answer-";
  const openRoundNumber = openPopover?.startsWith(roundPopoverPrefix)
    ? Number(openPopover.slice(roundPopoverPrefix.length))
    : null;
  const openAnswer = openPopover?.startsWith(answerPopoverPrefix)
    ? (players
        .flatMap((player) => player.rounds.map((round) => ({ player, round })))
        .find(
          ({ player, round }) =>
            `daily-krillion-answer-${player.id}-${round.round_number}` === openPopover,
        ) ?? null)
    : null;
  const openPopoverContent =
    openRoundNumber !== null ? (
      <>
        <strong>R{openRoundNumber} Question:</strong>{" "}
        {roundPrompt(openRoundNumber) ?? "Prompt unavailable."}
      </>
    ) : openAnswer ? (
      <>
        <strong>{`${openAnswer.player.display_name}'s R${openAnswer.round.round_number} Answer:`}</strong>{" "}
        {openAnswer.round.answer ?? "No answer"}
      </>
    ) : null;

  useEffect(() => {
    if (openPopover === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPopover(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPopover]);

  return (
    <section
      className={`leaderboard-card live-leaderboard ${game.key}-daily-leaderboard`}
      aria-labelledby={`daily-${game.key}`}
    >
      <div className="leaderboard-card-heading">
        <div className={`game-badge ${game.key}`} aria-hidden="true">
          {game.icon}
        </div>
        <div className="flex-1">
          <h2 id={`daily-${game.key}`} className="game-title">
            {game.display_name}
          </h2>
          <p className="subtle">
            {game.key === "krillion" && game.external_puzzle_key
              ? `Puzzle #${game.external_puzzle_key} · ${game.round_count} rounds`
              : `${game.round_count} rounds · Daily results`}
          </p>
        </div>
        <span className="pill live">{game.locked ? "Locked" : "Unlocked"}</span>
      </div>

      {!game.locked && openPopover && openPopoverContent && (
        <div className="daily-info-popover-layer">
          <span id={openPopover} className="daily-info-popover-panel" role="tooltip">
            {openPopoverContent}
          </span>
        </div>
      )}

      {game.locked ? (
        <div className="leaderboard-lock" role="status">
          <span className="lock-symbol" aria-hidden="true">
            🔒
          </span>
          <strong>
            {game.lock_reason ??
              `Play and submit the ${date} ${game.display_name} result to unlock this table.`}
          </strong>
          <span>Scores and round details stay private until this game is submitted.</span>
        </div>
      ) : (
        <div
          className="leaderboard-scroll daily-leaderboard-scroll"
          tabIndex={0}
          aria-label={`${game.display_name} daily table`}
        >
          <table className="leaderboard-table daily-table">
            <caption className="sr-only">{game.display_name} daily results</caption>
            <thead>
              <tr>
                <th className="sticky-column player-heading-column" scope="col">
                  Player
                </th>
                {roundNumbers.map((roundNumber) => {
                  const popoverId = `daily-${game.key}-round-${roundNumber}`;
                  const prompt = roundPrompt(roundNumber);
                  return (
                    <th key={roundNumber} scope="col" className="round-heading round-column">
                      {game.key === "krillion" ? (
                        <InfoPopover
                          id={popoverId}
                          label={`R${roundNumber}`}
                          open={openPopover === popoverId}
                          onToggle={() => togglePopover(popoverId)}
                        />
                      ) : (
                        <>
                          <span>R{roundNumber}</span>
                          {prompt && <small>{prompt}</small>}
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {orderedPlayers.map((player) => (
                <tr key={player.id}>
                  <th className="sticky-column player-row-heading" scope="row">
                    <PlayerHeading player={player} kind="daily" />
                  </th>
                  {roundNumbers.map((roundNumber) => {
                    const hasKrillionResult =
                      game.key === "krillion" &&
                      player.daily_score !== null &&
                      player.rounds.some((round) => round.round_number === roundNumber);
                    return (
                      <td
                        key={roundNumber}
                        className={hasKrillionResult ? "krillion-result-cell" : undefined}
                      >
                        {dailyCell(game, player, roundNumber, openPopover, togglePopover)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export type DailyView = "single" | "multi";

export function getDailyView(search: string, pathname = "/daily"): DailyView {
  if (pathname === "/daily/multi" || pathname === "/daily/multi/") return "multi";
  return new URLSearchParams(search).get("view") === "multi" ? "multi" : "single";
}

export function LeaderboardViewSwitch({ view }: { view: DailyView }) {
  const options = [
    { id: "single", label: "Single Day", href: "/daily" },
    { id: "multi", label: "Multiple Days", href: "/daily/multi" },
  ] as const;
  return (
    <nav className="view-switch" aria-label="Leaderboard view">
      {options.map((option) => (
        <a
          key={option.id}
          href={option.href}
          className={`view-switch-option${view === option.id ? " active" : ""}`}
          aria-current={view === option.id ? "page" : undefined}
        >
          {option.label}
        </a>
      ))}
    </nav>
  );
}

export function DailyLeaderboardPage({ currentDay }: { currentDay?: string }) {
  const route = parseDailyRoute(window.location.pathname, window.location.search);
  const date = route.invalidDate ? null : (route.date ?? currentDay ?? null);
  const [result, setResult] = useState<DailyResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loadedDate, setLoadedDate] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<CopyState>({ date: null, status: "idle" });
  const copyController = useMemo(
    () =>
      createLeaderboardCopyController(
        (copyDate) =>
          apiRequest<CopyLeaderboardResponse>(
            `/api/leaderboards/copy?date=${encodeURIComponent(copyDate)}`,
          ),
        copyText,
        setCopyState,
      ),
    [],
  );

  useEffect(() => {
    if (window.location.pathname === "/daily" && route.date) {
      window.history.replaceState({}, "", `/daily/${route.date}`);
    }
  }, [route.date]);

  useEffect(() => {
    if (!date) return;
    let active = true;
    void apiRequest<DailyResponse>(`/api/leaderboards/daily?date=${encodeURIComponent(date)}`)
      .then((response) => {
        if (active) {
          setError(null);
          setResult(response);
          setLoadedDate(date);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(reason);
          setLoadedDate(date);
        }
      });
    return () => {
      active = false;
      copyController.invalidate();
    };
  }, [copyController, date]);

  const copyLeaderboard = async (): Promise<void> => {
    if (!result || !result.copy_eligible) return;
    await copyController.start(result.date);
  };

  if (route.invalidDate) return <InvalidDateNotice />;
  if (!date) return <LoadingState label="Preparing today's leaderboard…" />;
  if (loadedDate !== date) return <LoadingState label="Loading daily standings…" />;
  if (error) return <ErrorNotice error={error} />;
  if (!result) return <LoadingState label="Loading daily standings…" />;

  const isCurrent = result.date === result.current_day;
  return (
    <>
      <LeaderboardViewSwitch view="single" />
      <div className="eyebrow">
        <span className="tiny-dot" /> DAILY RANKINGS
      </div>
      <h1>
        {isCurrent ? "Today's" : "Daily"}
        <br />
        <span className="accent-italic">standings.</span>
      </h1>
      <p className="page-intro">
        {isCurrent ? "Two games. One friendly rivalry." : "A look back at the day's results."}
      </p>
      <div className="date-strip daily-date-nav">
        <button type="button" onClick={() => moveToDaily(shiftDate(result.date, -1))}>
          ← <span className="sr-only">Previous day</span>
        </button>
        <span className="date-strip-label">{dateLabel(result.date)}</span>
        <button
          type="button"
          disabled={result.date >= result.latest_available_day}
          onClick={() => moveToDaily(shiftDate(result.date, 1))}
        >
          <span className="sr-only">Next day</span> →
        </button>
        <span className="date-right">Challenge date</span>
      </div>
      <label className="date-picker-label">
        Jump to a date
        <input
          type="date"
          value={result.date}
          max={result.latest_available_day}
          onChange={(event) => {
            if (validDate(event.target.value)) moveToDaily(event.target.value);
          }}
        />
      </label>
      {result.copy_eligible && (
        <div className="leaderboard-copy-panel">
          <button
            type="button"
            className="leaderboard-copy-control"
            disabled={copyState.status === "copying"}
            onClick={() => void copyLeaderboard()}
          >
            {copyState.status === "copying" ? "Copying…" : "Copy Leaderboard"}
          </button>
          {copyState.status === "success" && (
            <p className="leaderboard-copy-status" role="status" aria-live="polite">
              Leaderboard copied to clipboard.
            </p>
          )}
          {copyState.status === "error" && (
            <p className="leaderboard-copy-status error" role="alert">
              Could not copy the leaderboard. Try again.
            </p>
          )}
        </div>
      )}
      {result.games.map((game) => (
        <DailyGameTable key={game.key} game={game} date={result.date} />
      ))}
      <div className="info-strip">
        <span aria-hidden="true">🔐</span>
        <span>
          Round details unlock independently for each game after you submit that game's result for
          the selected challenge date.
        </span>
      </div>
    </>
  );
}

function AllTimePlayerHeading({
  player,
  popoverId,
  open,
  onToggle,
}: {
  player: AllTimePlayer;
  popoverId: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="player-heading all-time-player-heading">
      <span className="player-heading-top">
        <span className="rank-badge" aria-hidden="true">
          {player.badge ?? "—"}
        </span>
        <span className="player-rank">{player.rank === null ? "—" : `#${player.rank}`}</span>
      </span>
      <button
        type="button"
        className="all-time-player-name"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-describedby={open ? popoverId : undefined}
        onClick={onToggle}
      >
        {player.display_name}
      </button>
    </div>
  );
}

interface AllTimeGameTableProps {
  game: AllTimeGame;
  visibleDates?: readonly string[];
  allTimeScrollRef?: React.RefObject<HTMLDivElement | null>;
}

export function AllTimeGameTable({ game, visibleDates, allTimeScrollRef }: AllTimeGameTableProps) {
  const [openPlayerId, setOpenPlayerId] = useState<string | null>(null);
  const openPlayer = game.players.find((player) => player.id === openPlayerId) ?? null;
  const playerInfoId = `all-time-${game.key}-player-info`;
  const selectedDates = visibleDates ?? game.days.slice(0, 4).map((day) => day.date);
  const visibleDays = selectedDates.map(
    (date) =>
      game.days.find((candidate) => candidate.date === date) ?? {
        date,
        external_puzzle_key: null,
        scores: {},
      },
  );

  useEffect(() => {
    if (openPlayerId === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPlayerId(null);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openPlayerId]);

  return (
    <section className="leaderboard-card live-leaderboard" aria-labelledby={`all-time-${game.key}`}>
      <div className="leaderboard-card-heading">
        <div className={`game-badge ${game.key}`} aria-hidden="true">
          {game.icon}
        </div>
        <div className="flex-1">
          <h2 id={`all-time-${game.key}`} className="game-title">
            {game.display_name}
          </h2>
          <p className="subtle">Cumulative standings · live through the latest worldwide date</p>
        </div>
        <span className="pill public">Public</span>
      </div>
      {openPlayer && (
        <div id={playerInfoId} className="all-time-player-popover" role="tooltip">
          <strong>{openPlayer.display_name}</strong>
          <span>
            {formatScore(openPlayer.total)} pts · {openPlayer.games_played} played · avg{" "}
            {formatAverage(openPlayer.average)}
          </span>
          {openPlayer.movement && <span>{openPlayer.movement}</span>}
        </div>
      )}
      <div
        ref={allTimeScrollRef}
        className="leaderboard-scroll all-time-leaderboard-scroll"
        tabIndex={0}
        aria-label={`${game.display_name} all-time table`}
      >
        <table className="leaderboard-table all-time-table">
          <caption className="sr-only">{game.display_name} all-time scores</caption>
          <thead>
            <tr>
              <th className="sticky-column player-column player-heading-column" scope="col">
                Player
              </th>
              {visibleDays.length ? (
                visibleDays.map((day) => (
                  <th key={day.date} scope="col" className="round-heading all-time-date-column">
                    <a
                      className="all-time-date-link"
                      href={`/daily/${day.date}`}
                      aria-label={`View ${dateLabel(day.date)} daily results`}
                    >
                      <span>{allTimeDateLabel(day.date)}</span>
                      {game.key === "krillion" && day.external_puzzle_key && (
                        <small>#{day.external_puzzle_key}</small>
                      )}
                    </a>
                  </th>
                ))
              ) : (
                <th className="round-heading all-time-date-column" scope="col">
                  History
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {game.players.length ? (
              game.players.map((player) => (
                <tr key={player.id}>
                  <th className="sticky-column player-column player-row-heading" scope="row">
                    <AllTimePlayerHeading
                      player={player}
                      popoverId={playerInfoId}
                      open={openPlayerId === player.id}
                      onToggle={() =>
                        setOpenPlayerId((current) => (current === player.id ? null : player.id))
                      }
                    />
                  </th>
                  {visibleDays.length ? (
                    visibleDays.map((day) => {
                      const score = day.scores[player.id] ?? null;
                      const scoreLink = historicalScoreLink(day.date, player.display_name, score);
                      return (
                        <td key={day.date} className={score === null ? "cell-muted" : undefined}>
                          {scoreLink ? (
                            <a href={scoreLink.href} aria-label={scoreLink.ariaLabel}>
                              {formatScore(score)}
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      );
                    })
                  ) : (
                    <td className="cell-muted">No results yet</td>
                  )}
                </tr>
              ))
            ) : (
              <tr>
                <td className="cell-muted" colSpan={visibleDays.length + 1}>
                  No active players or results yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="table-note">
        Scores are included as soon as their worldwide window is accepted. Answers never appear
        here.
      </p>
    </section>
  );
}

export function MultiDayLeaderboardPage() {
  const [result, setResult] = useState<AllTimeResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [windowStartIndex, setWindowStartIndex] = useState(0);
  const [windowSize, setWindowSize] = useState<AllTimeWindowSize>(4);
  const allTimeScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<AllTimeResponse>("/api/leaderboards/all-time")
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((reason) => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, []);

  const games = useMemo(() => result?.games ?? [], [result]);
  const allTimeDays = useMemo(
    () =>
      Array.from(new Set(games.flatMap((game) => game.days.map((day) => day.date))))
        .sort((a, b) => b.localeCompare(a))
        .map((date) => ({ date })),
    [games],
  );
  const dateWindow = useMemo(
    () => createAllTimeDateWindow(allTimeDays, windowSize, windowStartIndex),
    [allTimeDays, windowSize, windowStartIndex],
  );
  const dateRangeLabel = dateWindow.dates.length
    ? `${shortDateLabel(dateWindow.dates[dateWindow.dates.length - 1])} – ${shortDateLabel(dateWindow.dates[0])}`
    : "No dates available";

  useEffect(() => {
    const element = allTimeScrollRef.current;
    if (!element || games.length === 0 || typeof ResizeObserver === "undefined") return;

    const updateWindowSize = (width: number): void => {
      setWindowSize(allTimeWindowSizeForWidth(width));
    };

    updateWindowSize(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? element.getBoundingClientRect().width;
      updateWindowSize(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [games.length]);

  if (error) return <ErrorNotice error={error} />;
  if (!result) return <LoadingState label="Loading multiple-day standings…" />;

  return (
    <>
      <LeaderboardViewSwitch view="multi" />
      <div className="eyebrow">
        <span className="tiny-dot" /> THE LONG GAME
      </div>
      <h1>
        Multiple Day <span className="accent-italic">Leaderboard</span>
      </h1>
      <p className="page-intro">Every point counts. Every day adds up.</p>
      <div className="date-strip daily-date-nav" aria-label="All-time date-window controls">
        <button
          type="button"
          aria-label="Next all-time date window"
          disabled={!dateWindow.canMoveNewer}
          onClick={() => setWindowStartIndex(dateWindow.startIndex - windowSize)}
        >
          ← <span className="sr-only">Next date window</span>
        </button>
        <span className="date-strip-label all-time-date-range-label" aria-live="polite">
          {dateRangeLabel}
        </span>
        <button
          type="button"
          aria-label="Previous all-time date window"
          disabled={!dateWindow.canMoveOlder}
          onClick={() => setWindowStartIndex(dateWindow.startIndex + windowSize)}
        >
          <span className="sr-only">Previous date window</span> →
        </button>
        <span className="date-right">Date range</span>
      </div>
      {games.map((game, index) => (
        <AllTimeGameTable
          key={game.key}
          game={game}
          visibleDates={dateWindow.dates}
          allTimeScrollRef={index === 0 ? allTimeScrollRef : undefined}
        />
      ))}
    </>
  );
}

/** Former name of the Multiple Day Leaderboard, kept for existing imports. */
export const AllTimeLeaderboardPage = MultiDayLeaderboardPage;

interface StatsPlayer {
  id: string;
  display_name: string;
  rank: number | null;
  total_points: number;
  average_per_day: number | null;
  average_per_game: number | null;
  current_streak: number;
  longest_streak: number;
  days_played: number;
  games_played: number;
  first_day: string | null;
  best_day: { date: string; points: number } | null;
}

interface StatsGame {
  key: string;
  display_name: string;
  icon: string;
  players: StatsPlayer[];
}

interface StatsResponse {
  status: "ok";
  as_of_date: string;
  players: StatsPlayer[];
  games?: StatsGame[];
}

function compactDateLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(`${iso}T12:00:00Z`));
}

/** Averages: whole numbers from 100 up (they are large and narrow columns), one decimal below. */
function formatStat(value: number | null): string {
  if (value === null) return "—";
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString("en-US");
  return value.toFixed(1).replace(/\.0$/, "");
}

function StatsTable({
  id,
  title,
  subtitle,
  icon,
  gameKey,
  players,
}: {
  id: string;
  title: string;
  subtitle: string;
  icon?: string;
  gameKey?: string;
  players: StatsPlayer[];
}) {
  return (
    <section className="leaderboard-card live-leaderboard stats-board" aria-labelledby={id}>
      <div className="leaderboard-card-heading">
        {icon && gameKey && (
          <div className={`game-badge ${gameKey}`} aria-hidden="true">
            {icon}
          </div>
        )}
        <div className="flex-1">
          <h2 id={id} className="game-title">
            {title}
          </h2>
          <p className="subtle">{subtitle}</p>
        </div>
        <span className="pill public">Public</span>
      </div>
      <div className="leaderboard-scroll stats-board-scroll" aria-label={`${title} stats table`}>
        <table className="leaderboard-table stats-table">
          <caption className="sr-only">{title} player stats</caption>
          <thead>
            <tr>
              <th className="sticky-column player-column player-heading-column" scope="col">
                Player
              </th>
              <th scope="col">Points</th>
              <th scope="col">
                Avg
                <wbr />
                /day
              </th>
              <th scope="col">
                Avg
                <wbr />
                /game
              </th>
              <th scope="col">Days</th>
              <th scope="col">
                Best
                <wbr /> day
              </th>
            </tr>
          </thead>
          <tbody>
            {players.length ? (
              players.map((player) => (
                <tr key={player.id}>
                  <th className="sticky-column player-column player-row-heading" scope="row">
                    <span className="player-rank">
                      {player.rank === null ? "—" : `#${player.rank}`}
                    </span>
                    <strong className="stats-player-name" title={player.display_name}>
                      {player.display_name}
                    </strong>
                  </th>
                  <td>{formatScore(player.days_played ? player.total_points : null)}</td>
                  <td>{formatStat(player.average_per_day)}</td>
                  <td>{formatStat(player.average_per_game)}</td>
                  <td>{player.days_played || "—"}</td>
                  <td>
                    {player.best_day ? (
                      <>
                        {formatScore(player.best_day.points)}
                        <small className="stats-best-date">
                          {compactDateLabel(player.best_day.date)}
                        </small>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="cell-muted" colSpan={6}>
                  No active players or results yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StatsBoardPage() {
  const [result, setResult] = useState<StatsResponse | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    void apiRequest<StatsResponse>("/api/leaderboards/stats")
      .then((response) => {
        if (active) setResult(response);
      })
      .catch((reason) => {
        if (active) setError(reason);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) return <ErrorNotice error={error} />;
  if (!result) return <LoadingState label="Loading all-time stats…" />;
  const through = `through ${compactDateLabel(result.as_of_date)}`;

  return (
    <>
      <div className="eyebrow">
        <span className="tiny-dot" /> THE LONG GAME
      </div>
      <h1>
        All-Time <span className="accent-italic">Stats</span>
      </h1>
      <p className="page-intro">Every game counts, across every game you play.</p>
      <StatsTable
        id="stats-board"
        title="All games"
        subtitle={`Krillion and MapTap combined · ${through}`}
        players={result.players}
      />
      {(result.games ?? []).map((game) => (
        <StatsTable
          key={game.key}
          id={`stats-board-${game.key}`}
          title={game.display_name}
          subtitle={`${game.display_name} only · ${through}`}
          icon={game.icon}
          gameKey={game.key}
          players={game.players}
        />
      ))}
      <div className="table-note stats-help">
        <p>
          <strong>How these are measured.</strong> A day counts as played when you save at least one
          game for that challenge date. Points add up every game you submit, ranked by total points.
          Each game&apos;s table uses only that game&apos;s results.
        </p>
        <ul>
          <li>
            <strong>Avg/day:</strong> total points divided by the calendar days from your first
            submission to the latest day that is closed for submissions. Days before a player&apos;s
            first submission never count against them; days you skipped after starting count as
            zero. A day that can still be submitted somewhere in the world, including today, never
            counts as a zero.
          </li>
          <li>
            <strong>Avg/game:</strong> total points divided by games submitted. Days you did not
            play are left out, not counted as zeros.
          </li>
          <li>
            <strong>Days:</strong> days played.
          </li>
          <li>
            <strong>Best day:</strong> your highest score on a single day, with its date.
          </li>
        </ul>
      </div>
    </>
  );
}
