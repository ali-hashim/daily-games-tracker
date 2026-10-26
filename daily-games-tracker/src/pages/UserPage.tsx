import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError, apiRequest } from "../lib/api";
import type { AuthenticatedRenderProps } from "./DeviceLogin";

export interface UserStatsGame {
  key: "krillion" | "maptap";
  display_name: string;
  icon: string;
  total: number;
  games_played: number;
  average: number | null;
  rank: number | null;
}

export interface UserStatsResponse {
  status: "ok";
  player: { id: string; display_name: string };
  games: UserStatsGame[];
  install_url: string | null;
}

function formatTotal(total: number): string {
  return new Intl.NumberFormat("en-US").format(total);
}

function formatAverage(average: number | null): string {
  return average === null ? "—" : average.toFixed(2);
}

function formatRank(rank: number | null): string {
  return rank === null ? "—" : `#${rank}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "Your scorecard could not be loaded. Check your connection and try again.";
}

function UserLoading() {
  return (
    <p className="leaderboard-status" role="status" aria-live="polite">
      Loading your scorecard…
    </p>
  );
}

interface StatsError {
  playerId: string;
  value: unknown;
}

export default function UserPage({
  player,
  busy,
  logout,
  sessionExpired,
}: AuthenticatedRenderProps) {
  const [stats, setStats] = useState<UserStatsResponse | null>(null);
  const [statsPlayerId, setStatsPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<StatsError | null>(null);
  const [loading, setLoading] = useState(true);
  const statsRequestGeneration = useRef(0);

  const loadStats = useCallback(() => {
    const playerId = player.id;
    const requestGeneration = ++statsRequestGeneration.current;
    const controller = new AbortController();
    let active = true;
    setStats(null);
    setStatsPlayerId(null);
    setLoading(true);
    setError(null);
    void apiRequest<UserStatsResponse>("/api/user/stats", { signal: controller.signal })
      .then((result) => {
        if (!active || requestGeneration !== statsRequestGeneration.current) return;
        if (result.player.id !== playerId) return;
        setStats(result);
        setStatsPlayerId(playerId);
        setError(null);
      })
      .catch((reason: unknown) => {
        if (!active || requestGeneration !== statsRequestGeneration.current) return;
        if (controller.signal.aborted) return;
        setStats(null);
        setStatsPlayerId(null);
        if (reason instanceof ApiRequestError && reason.status === 401) {
          sessionExpired();
          return;
        }
        setError({ playerId, value: reason });
      })
      .finally(() => {
        if (active && requestGeneration === statsRequestGeneration.current) setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
      if (statsRequestGeneration.current === requestGeneration) {
        statsRequestGeneration.current += 1;
      }
    };
  }, [player.id, sessionExpired]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      cleanup = loadStats();
    }, 0);
    return () => {
      window.clearTimeout(timer);
      cleanup?.();
    };
  }, [loadStats]);

  async function signOut(): Promise<void> {
    statsRequestGeneration.current += 1;
    setStats(null);
    setStatsPlayerId(null);
    await logout();
  }

  const currentStats = statsPlayerId === player.id ? stats : null;
  const currentError = error?.playerId === player.id ? error.value : null;
  const currentLoading = loading || (!currentStats && !currentError);

  return (
    <>
      <div className="eyebrow">
        <span className="tiny-dot" /> PRIVATE SCORECARD
      </div>
      <h1>
        Your
        <br />
        <span className="accent-italic">scorecard.</span>
      </h1>
      <p className="page-intro">
        A private view of your all-time results across every active game.
      </p>

      <section className="user-welcome" aria-label="Signed-in player">
        <span className="user-avatar" aria-hidden="true">
          {player.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <span className="subtle">Signed in as</span>
          <strong>{player.display_name}</strong>
        </div>
      </section>

      {currentLoading && <UserLoading />}
      {!currentLoading && currentError && (
        <div className="notice error" role="alert">
          <strong>We could not load your scorecard.</strong>
          <span>{errorMessage(currentError)}</span>
          <button type="button" className="primary-action" onClick={() => loadStats()}>
            Try again
          </button>
        </div>
      )}
      {!currentLoading && !currentError && currentStats && (
        <>
          <div className="user-scorecards" aria-label="All-time game scorecards">
            {currentStats.games.map((game) => (
              <section
                className="user-scorecard"
                key={game.key}
                aria-labelledby={`user-${game.key}`}
              >
                <div className="user-scorecard-heading">
                  <span className={`game-badge ${game.key}`} aria-hidden="true">
                    {game.icon}
                  </span>
                  <div>
                    <h2 id={`user-${game.key}`}>{game.display_name}</h2>
                    <p className="subtle">All-time results</p>
                  </div>
                </div>
                <dl className="user-stat-grid">
                  <div>
                    <dt>Total</dt>
                    <dd>{formatTotal(game.total)}</dd>
                  </div>
                  <div>
                    <dt>Played</dt>
                    <dd>{game.games_played}</dd>
                  </div>
                  <div>
                    <dt>Average</dt>
                    <dd>{formatAverage(game.games_played === 0 ? null : game.average)}</dd>
                  </div>
                  <div>
                    <dt>Rank</dt>
                    <dd>{formatRank(game.games_played === 0 ? null : game.rank)}</dd>
                  </div>
                </dl>
              </section>
            ))}
          </div>

          {currentStats.games.length === 0 && (
            <div className="notice">
              No active games are available yet. Your scorecard will appear here when a game is
              enabled.
            </div>
          )}

          <section className="user-shortcut-card" aria-label="Shortcut installation">
            <div>
              <h2>Keep Upload to WHT handy</h2>
              <p className="subtle">
                Reinstall the supported Shortcut on a registered iPhone when you need it.
              </p>
            </div>
            {currentStats.install_url ? (
              <a className="secondary-action" href={currentStats.install_url} rel="noreferrer">
                Redownload Shortcut
              </a>
            ) : (
              <p className="muted-note">The supported install link is currently unavailable.</p>
            )}
          </section>
        </>
      )}

      <button
        type="button"
        className="primary-action user-logout"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? "Logging out…" : "Log out"}
      </button>
    </>
  );
}
