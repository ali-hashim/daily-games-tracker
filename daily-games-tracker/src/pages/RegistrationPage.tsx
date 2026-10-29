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
        <section
          className="registration-completion"
          aria-labelledby="registration-completion-heading"
        >
          <h2 id="registration-completion-heading">Welcome, {result.player.display_name}</h2>
          <p className="registration-completion-intro">
            Follow these six steps in order. Keep this page open until setup is complete.
          </p>
          <ol className="registration-step-flow" aria-label="Six setup steps">
            <li className="registration-step-card" aria-labelledby="registration-step-1-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 1</span>
                <h3 id="registration-step-1-title">Copy your device code</h3>
              </div>
              <p>
                Copy this one-time private code. If copying fails, select the code and copy it
                manually.
              </p>
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
                        ? "Private device code copied. Continue to Step 2."
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
            <li className="registration-step-card" aria-labelledby="registration-step-2-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 2</span>
                <h3 id="registration-step-2-title">Download Upload to WHT</h3>
              </div>
              <p>Download the Shortcut file from this page.</p>
              {result.shortcut_install_url ? (
                <a
                  className="primary-action"
                  href={result.shortcut_install_url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download Upload to WHT
                </a>
              ) : (
                <p className="notice">
                  The supported Shortcut download link is unavailable. Ask the administrator before
                  completing setup. Keep this page open; the code cannot be recovered if you close
                  it.
                </p>
              )}
            </li>
            <li className="registration-step-card" aria-labelledby="registration-step-3-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 3</span>
                <h3 id="registration-step-3-title">Open your download</h3>
              </div>
              <p>
                In Safari, tap Downloads beside the address bar, then tap the downloaded Shortcut to
                open it.
              </p>
            </li>
            <li className="registration-step-card" aria-labelledby="registration-step-4-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 4</span>
                <h3 id="registration-step-4-title">Install and set up</h3>
              </div>
              <p>
                In Shortcuts, add the downloaded Shortcut. When its Import Question asks for your
                code, paste the code you copied in Step 1 and finish adding it.
              </p>
            </li>
            <li className="registration-step-card" aria-labelledby="registration-step-5-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 5</span>
                <h3 id="registration-step-5-title">Add Upload to WHT to Favorites</h3>
              </div>
              <p>
                Return to Safari. Tap Share in the bottom toolbar, scroll to Edit Actions, then add
                Upload to WHT to Favorites.
              </p>
              <figure className="player-help-figure">
                <img
                  className="player-help-image"
                  src="/images/player-help/safari-share-button.jpg"
                  alt="Safari bottom toolbar with the Share button highlighted"
                />
                <figcaption className="player-help-image-caption">Tap Share in Safari.</figcaption>
              </figure>
              <figure className="player-help-figure">
                <img
                  className="player-help-image"
                  src="/images/player-help/edit-actions-button.jpg"
                  alt="Edit Actions button in Safari's share sheet"
                />
                <figcaption className="player-help-image-caption">
                  Tap Edit Actions, then add Upload to WHT to Favorites.
                </figcaption>
              </figure>
            </li>
            <li className="registration-step-card" aria-labelledby="registration-step-6-title">
              <div className="registration-step-heading">
                <span className="registration-step-number">Step 6</span>
                <h3 id="registration-step-6-title">Play</h3>
              </div>
              <p>Setup is complete. Open Play and choose a game.</p>
              <a className="primary-action" href="/">
                Play
              </a>
            </li>
          </ol>
          <aside className="registration-security-note" aria-label="Code privacy and recovery">
            <p>
              <strong>Keep your code private.</strong> Anyone who can inspect your configured
              Shortcut can read this code. Never share your configured copy. If a device is lost or
              the code is leaked, ask the administrator to revoke it.
            </p>
            <p>
              You&apos;re signed in on this browser. If this page closes before setup is complete,
              ask the administrator for a new invitation; WHT cannot recover the code.
            </p>
          </aside>
        </section>
      )}
      <PlayerHelp />
    </>
  );
}
