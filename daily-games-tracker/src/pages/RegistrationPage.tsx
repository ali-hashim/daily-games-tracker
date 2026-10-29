import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, copyText } from "../lib/api";
import PlayerHelp from "./PlayerHelp";

interface Registered {
  player: { display_name: string };
  device_code: string;
  shortcut_install_url: string | null;
}

export default function RegistrationPage() {
  const [token] = useState(() => window.location.pathname.split("/")[2] ?? "");
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Registered | null>(null);
  const [copyFeedback, setCopyFeedback] = useState("");
  useEffect(() => {
    let active = true;
    void apiRequest<{ player: { display_name: string } }>(
      `/api/register/${encodeURIComponent(token)}`,
    )
      .then((value) => {
        if (active) setName(value.player.display_name);
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function register(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const registration = await apiRequest<Registered>(
        `/api/register/${encodeURIComponent(token)}/redeem`,
        { method: "POST", body: JSON.stringify({ label }) },
      );
      setResult(registration);
      // Keep the credential only in component memory; remove the used invite from browser history.
      window.history.replaceState(null, "", "/register/complete");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration failed. Ask the administrator for a new invitation if this link was used.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="eyebrow">WELCOME TO WHT</div>
      <h1>{result ? "Device ready." : "Set up your device."}</h1>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {!result && name && (
        <form
          className="management-panel"
          onSubmit={(event) => {
            void register(event);
          }}
        >
          <p>
            This invitation registers a device for <strong>{name}</strong>.
          </p>
          <label htmlFor="device-label">Device name (optional)</label>
          <input
            id="device-label"
            value={label}
            maxLength={100}
            placeholder="My iPhone"
            autoComplete="off"
            onChange={(event) => setLabel(event.target.value)}
          />
          <p>
            Your private code will be shown once. Keep this page open until you have copied it into
            Upload to WHT.
          </p>
          <button className="primary-action" disabled={busy}>
            {busy ? "Registering…" : "Register this device"}
          </button>
        </form>
      )}
      {result && (
        <section className="management-panel">
          <h2>Welcome, {result.player.display_name}</h2>
          <ol className="setup-steps registration-completion-steps">
            <li>
              <span className="registration-step-instruction">
                Keep this result page open. Copy the one-time private code below; if copy fails,
                select the code and copy it manually.
              </span>
              <input
                className="private-code"
                aria-label="Private device code"
                value={result.device_code}
                readOnly
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => {
                  void copyText(result.device_code).then((copied) =>
                    setCopyFeedback(
                      copied
                        ? "Private device code copied. Enter it in the Shortcut Import Question."
                        : "Copy failed. Select the code above and copy it manually.",
                    ),
                  );
                }}
              >
                Copy device code
              </button>
              {copyFeedback && (
                <p className="notice" role="status" aria-live="polite">
                  {copyFeedback}
                </p>
              )}
            </li>
            <li>
              <span className="registration-step-instruction">
                Install Upload to WHT using the download link below.
              </span>
              {result.shortcut_install_url ? (
                <a
                  className="primary-action"
                  href={result.shortcut_install_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Install Upload to WHT
                </a>
              ) : (
                <p className="notice">
                  The supported Shortcut install link is unavailable. Ask the administrator before
                  completing setup. Keep this page open; the code cannot be recovered if you close
                  it.
                </p>
              )}
            </li>
            <li>
              <span className="registration-step-instruction">
                In Safari, open Downloads beside the address bar, then open the downloaded Shortcut.
              </span>
            </li>
            <li>
              <span className="registration-step-instruction">
                In the Shortcut’s Import Question, paste the one-time code and finish adding Upload
                to WHT.
              </span>
            </li>
            <li>
              <span className="registration-step-instruction">
                Return to Safari, open the Share sheet, scroll to Edit Actions, and add Upload to
                WHT to Favorites.
              </span>
            </li>
            <li>
              <span className="registration-step-instruction">Play a game.</span>
            </li>
          </ol>
          <p className="muted-note">
            Anyone who can inspect your configured Shortcut can read this code. Never share your
            configured copy. For a lost or leaked device, ask the administrator to revoke it.
          </p>
          <p>
            You're signed in on this browser. If this page closes before setup is complete, ask the
            administrator for a new invitation; WHT cannot recover the code.
          </p>
        </section>
      )}
      <PlayerHelp />
    </>
  );
}
