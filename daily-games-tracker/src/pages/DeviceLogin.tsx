import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ApiRequestError, apiRequest } from "../lib/api";

interface Player {
  id: string;
  display_name: string;
}

// This stores only navigation state, never authentication secrets. Storage can be disabled.
function rememberReturnPath() {
  const path = window.location.pathname;
  if (path === "/daily" || /^\/daily\/\d{4}-\d{2}-\d{2}$/.test(path)) {
    try {
      window.sessionStorage.setItem("wht_login_return", path);
    } catch {
      /* Manual return still works. */
    }
  }
}

function returnPath(): string {
  try {
    const path = window.sessionStorage.getItem("wht_login_return") ?? "";
    window.sessionStorage.removeItem("wht_login_return");
    if (path === "/daily" || /^\/daily\/\d{4}-\d{2}-\d{2}$/.test(path)) return path;
  } catch {
    /* Fall back to the daily page. */
  }
  return "/daily";
}

export default function DeviceLogin({ children }: { children?: ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [checked, setChecked] = useState(false);
  const [waiting, setWaiting] = useState(window.location.pathname === "/login");
  const [shortcut, setShortcut] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const loadPlayer = useCallback(async () => {
    try {
      const result = await apiRequest<{ player: Player }>("/api/auth/me");
      setPlayer(result.player);
      return true;
    } catch {
      setPlayer(null);
      return false;
    } finally {
      setChecked(true);
    }
  }, []);

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
        await loadPlayer();
        if (window.location.pathname === "/login") window.location.replace(returnPath());
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
    let active = true;
    void apiRequest<{ player: Player }>("/api/auth/me")
      .then((result) => {
        if (active) setPlayer(result.player);
      })
      .catch(() => {
        if (active) setPlayer(null);
      })
      .finally(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);
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
    rememberReturnPath();
    try {
      const result = await apiRequest<{ shortcut_url: string }>("/api/auth/device/start", {
        method: "POST",
        body: "{}",
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
    setBusy(true);
    try {
      await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
      setPlayer(null);
      setWaiting(false);
      setShortcut(null);
      setMessage("You are logged out.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!checked) return <p role="status">Checking your login…</p>;
  return (
    <>
      <section className="leaderboard-card" aria-label="Website login">
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
