import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiRequestError, apiRequest } from "../lib/api";
import { safeDailyReturnPath, safeReturnPath } from "../lib/login-return";

export interface Player {
  id: string;
  display_name: string;
}

export interface AuthenticatedRenderProps {
  player: Player;
  busy: boolean;
  logout: () => Promise<void>;
  sessionExpired: () => void;
}

type AuthenticatedRender = (props: AuthenticatedRenderProps) => ReactNode;

const AUTH_REVALIDATION_INTERVAL_MS = 60_000;

interface DeviceLoginProps {
  children?: ReactNode | AuthenticatedRender;
  redirectWhenSignedOut?: boolean;
  dailyReturnDate?: string;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 401;
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for auth-gate tests
export function shouldRedirectDaily(error: unknown): boolean {
  return isUnauthorized(error);
}

function authErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return "We could not check your login. Check your connection and try again.";
}

function returnPathFromLocation(): string {
  return safeReturnPath(new URLSearchParams(window.location.search).get("return_url"));
}

// eslint-disable-next-line react-refresh/only-export-components -- exported for return-url tests
export function dailySignInUrl(
  pathname = window.location.pathname,
  search = window.location.search,
  currentDay?: string,
) {
  const datedPath = safeDailyReturnPath(pathname, search);
  const currentPath = currentDay ? safeReturnPath(`/daily/${currentDay}`) : "/user";
  const returnPath = datedPath === "/user" ? currentPath : datedPath;
  return `/user?return_url=${encodeURIComponent(returnPath)}`;
}

export default function DeviceLogin({
  children,
  redirectWhenSignedOut = false,
  dailyReturnDate,
}: DeviceLoginProps) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [checked, setChecked] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [authError, setAuthError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const authRequestGeneration = useRef(0);
  const authInFlightGeneration = useRef<number | null>(null);
  const playerRef = useRef<Player | null>(null);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const sessionExpired = useCallback(() => {
    authRequestGeneration.current += 1;
    authInFlightGeneration.current = null;
    playerRef.current = null;
    setPlayer(null);
    setWaiting(false);
    setShortcut(null);
    setMessage("Your login expired or was revoked. Start a new login to continue.");
    setAuthError(null);
  }, []);

  const loadPlayer = useCallback(async () => {
    if (authInFlightGeneration.current !== null) return false;
    const requestGeneration = ++authRequestGeneration.current;
    authInFlightGeneration.current = requestGeneration;
    try {
      const result = await apiRequest<{ player: Player }>("/api/auth/me");
      if (requestGeneration !== authRequestGeneration.current) return false;
      setPlayer(result.player);
      playerRef.current = result.player;
      setAuthError(null);
      return true;
    } catch (error) {
      if (requestGeneration !== authRequestGeneration.current) return false;
      const unauthorized = shouldRedirectDaily(error);
      if (unauthorized || !playerRef.current) setPlayer(null);
      if (redirectWhenSignedOut && unauthorized) {
        setAuthError(null);
        window.location.assign(
          dailySignInUrl(window.location.pathname, window.location.search, dailyReturnDate),
        );
      } else if (unauthorized) {
        setAuthError(null);
      } else {
        setAuthError(error);
      }
      return false;
    } finally {
      if (authInFlightGeneration.current === requestGeneration) {
        authInFlightGeneration.current = null;
      }
      if (requestGeneration === authRequestGeneration.current) setChecked(true);
    }
  }, [dailyReturnDate, redirectWhenSignedOut]);

  const complete = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    try {
      const result = await apiRequest<{ status: string }>("/api/auth/device/complete", {
        method: "POST",
        body: "{}",
      });
      if (result.status === "authenticated") {
        setWaiting(false);
        setShortcut(null);
        setMessage("");
        const returnPath = returnPathFromLocation();
        if (returnPath !== "/user") {
          window.location.assign(returnPath);
        } else {
          await loadPlayer();
        }
      } else {
        setMessage(
          "Waiting for your registered device. After approval, return to this window and tap Check login.",
        );
      }
    } catch (error) {
      // Another tab/request may have completed first; check the session before showing expiry.
      if (await loadPlayer()) {
        setMessage("");
        setWaiting(false);
        setShortcut(null);
      } else if (error instanceof ApiRequestError && error.status < 500) {
        setMessage(error.message);
        setWaiting(false);
        setShortcut(null);
      } else {
        setMessage(
          "Connection interrupted. Return to this window and tap Check login when you are online.",
        );
      }
    } finally {
      inFlight.current = false;
    }
  }, [loadPlayer]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadPlayer(), 0);
    return () => window.clearTimeout(timer);
  }, [loadPlayer]);

  useEffect(() => {
    if (!checked || !player) return;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      void loadPlayer();
    };
    const interval = window.setInterval(revalidate, AUTH_REVALIDATION_INTERVAL_MS);
    window.addEventListener("focus", revalidate);
    window.addEventListener("pageshow", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      window.removeEventListener("pageshow", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
    };
  }, [checked, loadPlayer, player]);

  useEffect(() => {
    if (!waiting || player) return;
    const check = () => {
      void complete();
    };
    const interval = window.setInterval(check, 2500);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", check);
    check();
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [waiting, player, complete]);

  async function start() {
    setBusy(true);
    setMessage("");
    setAuthError(null);
    try {
      const result = await apiRequest<{ shortcut_url: string }>("/api/auth/device/start", {
        method: "POST",
        body: JSON.stringify({ return_url: returnPathFromLocation() }),
      });
      setShortcut(result.shortcut_url);
      setWaiting(true);
      setMessage("Tap Open Upload to WHT to verify this login. This request lasts two minutes.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    authRequestGeneration.current += 1;
    authInFlightGeneration.current = null;
    playerRef.current = null;
    setPlayer(null);
    setBusy(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
      setMessage("You are logged out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      setPlayer(null);
      setWaiting(false);
      setShortcut(null);
      setAuthError(null);
      setBusy(false);
    }
  }

  if (!checked) return <p role="status">Checking your login…</p>;
  if (!player && redirectWhenSignedOut && authError) {
    return (
      <div className="notice error" role="alert">
        {authErrorMessage(authError)}
        <button type="button" className="primary-action" onClick={() => void loadPlayer()}>
          Try again
        </button>
      </div>
    );
  }

  if (player && typeof children === "function") {
    // The render-prop receives callbacks whose auth-generation refs are read only when invoked.
    // eslint-disable-next-line react-hooks/refs
    return <>{children({ player, busy, logout, sessionExpired })}</>;
  }

  return (
    <>
      <section className="leaderboard-card device-login-card" aria-label="Website login">
        {player ? (
          <>
            <p>
              Signed in as <strong>{player.display_name}</strong>.
            </p>
            <button
              type="button"
              className="primary-action"
              disabled={busy}
              onClick={() => void logout()}
            >
              Log out
            </button>
            {window.location.pathname === "/login" && <a href="/daily">Continue to Daily</a>}
          </>
        ) : (
          <>
            <h2>Login with Device</h2>
            <p>Your registered Upload to WHT Shortcut verifies your login in this window.</p>
            {authError && <p className="notice error">{authErrorMessage(authError)}</p>}
            <button
              type="button"
              className="primary-action"
              disabled={busy}
              onClick={() => void start()}
            >
              {busy ? "Preparing…" : waiting ? "Start a new login" : "Login with Device"}
            </button>
            {shortcut && (
              <a className="primary-action" href={shortcut}>
                Open Upload to WHT
              </a>
            )}
            {waiting && (
              <button type="button" className="primary-action" onClick={() => void complete()}>
                Check login
              </button>
            )}
            <p>
              If Shortcuts opens Safari instead of your Home Screen app, return manually to this
              original window and tap Check login. Keep it open while approving.
            </p>
            <p>
              Shortcut unavailable? Reinstall your configured Shortcut or ask the administrator for
              a new device invitation.
            </p>
          </>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      {player && children}
    </>
  );
}
