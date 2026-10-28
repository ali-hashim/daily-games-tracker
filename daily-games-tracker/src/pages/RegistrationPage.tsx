import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, copyText } from "../lib/api";

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
  const [copied, setCopied] = useState(false);
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
          <ol className="setup-steps">
            <li>Copy your private device code below.</li>
            <li>
              Install <strong>Upload to WHT</strong>, then paste the code into its setup question.
            </li>
          </ol>
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
              void copyText(result.device_code).then(setCopied);
            }}
          >
            {copied ? "Copied" : "Copy device code"}
          </button>
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
              The Shortcut download is currently unavailable. Keep this code until it is ready.
            </p>
          )}
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
    </>
  );
}
