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
const DEVICE_LOGIN_INSTRUCTIONS =
  "Tap Login with your device to verify this login. This request lasts two minutes.";
const SESSION_EXPIRED_MESSAGE = "Your login expired or was revoked. Login with Device to continue.";
const LOGGED_OUT_MESSAGE = "You are logged out.";
type PlayerLoadResult = "authenticated" | "unauthenticated" | "redirected" | "unavailable";

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
  const [deviceError, setDeviceError] = useState<unknown>(null);
  const [logoutError, setLogoutError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const startInFlight = useRef(false);
  const preserveMessageWhileWaiting = useRef(false);
  const deviceFlowGeneration = useRef(0);
  const authRequestGeneration = useRef(0);
  const authInFlightGeneration = useRef<number | null>(null);
  const playerRef = useRef<Player | null>(null);
  const initialLoadStarted = useRef(false);

  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const start = useCallback(
    async (successMessage = DEVICE_LOGIN_INSTRUCTIONS, preserveMessage = false) => {
      if (startInFlight.current) return;
      startInFlight.current = true;
      const flowGeneration = ++deviceFlowGeneration.current;
      authRequestGeneration.current += 1;
      authInFlightGeneration.current = null;
      inFlight.current = false;
      preserveMessageWhileWaiting.current = preserveMessage;
      setBusy(true);
      if (!preserveMessage) setMessage("");
      setAuthError(null);
      setDeviceError(null);
      setWaiting(false);
      setShortcut(null);
      try {
        const result = await apiRequest<{ shortcut_url: string }>("/api/auth/device/start", {
          method: "POST",
          body: JSON.stringify({ return_url: returnPathFromLocation() }),
        });
        if (flowGeneration !== deviceFlowGeneration.current) return;
        setShortcut(result.shortcut_url);
        setWaiting(true);
        setMessage(successMessage);
      } catch (error) {
        if (flowGeneration !== deviceFlowGeneration.current) return;
        preserveMessageWhileWaiting.current = false;
        setDeviceError(error);
        setMessage(error instanceof Error ? error.message : "Try again.");
      } finally {
        startInFlight.current = false;
        if (flowGeneration === deviceFlowGeneration.current) setBusy(false);
      }
    },
    [],
  );

  const sessionExpired = useCallback(() => {
    authRequestGeneration.current += 1;
    authInFlightGeneration.current = null;
    playerRef.current = null;
    setPlayer(null);
    setWaiting(false);
    setShortcut(null);
    setMessage(SESSION_EXPIRED_MESSAGE);
    setAuthError(null);
    setDeviceError(null);
    void start(SESSION_EXPIRED_MESSAGE, true);
  }, [start]);

  const loadPlayer = useCallback(
    async (expectedDeviceFlowGeneration?: number): Promise<PlayerLoadResult> => {
      const isExpectedFlowCurrent = () =>
        expectedDeviceFlowGeneration === undefined ||
        expectedDeviceFlowGeneration === deviceFlowGeneration.current;
      if (!isExpectedFlowCurrent()) return "unavailable";
      if (authInFlightGeneration.current !== null) return "unavailable";
      const requestGeneration = ++authRequestGeneration.current;
      authInFlightGeneration.current = requestGeneration;
      try {
        const result = await apiRequest<{ player: Player }>("/api/auth/me");
        if (requestGeneration !== authRequestGeneration.current || !isExpectedFlowCurrent()) {
          return "unavailable";
        }
        setPlayer(result.player);
        playerRef.current = result.player;
        setAuthError(null);
        return "authenticated";
      } catch (error) {
        if (requestGeneration !== authRequestGeneration.current || !isExpectedFlowCurrent()) {
          return "unavailable";
        }
        const unauthorized = shouldRedirectDaily(error);
        if (unauthorized || !playerRef.current) setPlayer(null);
        if (redirectWhenSignedOut && unauthorized) {
          setAuthError(null);
          window.location.assign(
            dailySignInUrl(window.location.pathname, window.location.search, dailyReturnDate),
          );
          return "redirected";
        } else if (unauthorized) {
          setAuthError(null);
          return "unauthenticated";
        } else {
          setAuthError(error);
          return "unavailable";
        }
      } finally {
        if (authInFlightGeneration.current === requestGeneration) {
          authInFlightGeneration.current = null;
        }
        if (requestGeneration === authRequestGeneration.current && isExpectedFlowCurrent()) {
          setChecked(true);
        }
      }
    },
    [dailyReturnDate, redirectWhenSignedOut],
  );

  const complete = useCallback(async () => {
    if (inFlight.current || document.visibilityState === "hidden") return;
    inFlight.current = true;
    const flowGeneration = deviceFlowGeneration.current;
    try {
      const result = await apiRequest<{ status: string }>("/api/auth/device/complete", {
        method: "POST",
        body: "{}",
      });
      if (flowGeneration !== deviceFlowGeneration.current) return;
      if (result.status === "authenticated") {
        preserveMessageWhileWaiting.current = false;
        setWaiting(false);
        setShortcut(null);
        setMessage("");
        setDeviceError(null);
        const returnPath = returnPathFromLocation();
        if (returnPath !== "/user") {
          window.location.assign(returnPath);
        } else {
          const playerLoadResult = await loadPlayer(flowGeneration);
          if (flowGeneration !== deviceFlowGeneration.current) return;
          if (playerLoadResult === "unauthenticated") {
            void start(SESSION_EXPIRED_MESSAGE, true);
          }
        }
      } else {
        setDeviceError(null);
        if (!preserveMessageWhileWaiting.current) {
          setMessage(
            "Waiting for your registered device. After approval, return to this window and tap Check login.",
          );
        }
      }
    } catch (error) {
      if (flowGeneration !== deviceFlowGeneration.current) return;
      preserveMessageWhileWaiting.current = false;
      // Another tab/request may have completed first; check the session before showing expiry.
      const playerLoadResult = await loadPlayer(flowGeneration);
      if (flowGeneration !== deviceFlowGeneration.current) return;
      if (playerLoadResult === "authenticated") {
        setMessage("");
        setWaiting(false);
        setShortcut(null);
        setDeviceError(null);
      } else if (error instanceof ApiRequestError && error.status < 500) {
        setDeviceError(error);
        setMessage(error.message);
        setWaiting(false);
        setShortcut(null);
      } else {
        setDeviceError(error);
        setMessage(
          "Connection interrupted. Return to this window and tap Check login when you are online.",
        );
      }
    } finally {
      if (flowGeneration === deviceFlowGeneration.current) inFlight.current = false;
    }
  }, [loadPlayer, start]);

  const retryAuth = useCallback(async () => {
    const result = await loadPlayer();
    if (result === "unauthenticated") await start();
  }, [loadPlayer, start]);

  useEffect(() => {
    if (initialLoadStarted.current) return;
    initialLoadStarted.current = true;
    void retryAuth();
  }, [retryAuth]);

  useEffect(() => {
    if (!checked || !player) return;
    const revalidate = () => {
      if (document.visibilityState === "hidden") return;
      void loadPlayer().then((result) => {
        if (result === "unauthenticated") void start(SESSION_EXPIRED_MESSAGE, true);
      });
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
  }, [checked, loadPlayer, player, start]);

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

  const logout = useCallback(async () => {
    deviceFlowGeneration.current += 1;
    authRequestGeneration.current += 1;
    authInFlightGeneration.current = null;
    playerRef.current = null;
    setPlayer(null);
    setWaiting(false);
    setShortcut(null);
    setMessage("");
    setAuthError(null);
    setDeviceError(null);
    setLogoutError(null);
    setBusy(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
      await start(LOGGED_OUT_MESSAGE, true);
    } catch (error) {
      setLogoutError(error);
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      setPlayer(null);
      setBusy(false);
    }
  }, [start]);

  if (!checked) return <p role="status">Checking your login…</p>;
  if (!player && redirectWhenSignedOut && authError) {
    return (
      <div className="notice error" role="alert">
        {authErrorMessage(authError)}
        <button type="button" className="primary-action" onClick={() => void retryAuth()}>
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
            {(authError || deviceError || logoutError) && (
              <button
                type="button"
                className="primary-action"
                disabled={busy}
                onClick={() => void (logoutError ? logout() : deviceError ? start() : retryAuth())}
              >
                Try again
              </button>
            )}
            {shortcut && (
              <a className="primary-action" href={shortcut}>
                Login with your device
              </a>
            )}
            <div className="device-login-advisory">
              <p>Already logged in? Tap Check login below.</p>
              <p>Shortcut unavailable? Contact your administrator.</p>
            </div>
            {waiting && (
              <button type="button" className="primary-action" onClick={() => void complete()}>
                Check login
              </button>
            )}
          </>
        )}
        {message && <p role="status">{message}</p>}
      </section>
      {player && children}
    </>
  );
}
