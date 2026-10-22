import { useEffect, useState, type FormEvent } from "react";
import { apiRequest, copyText } from "../lib/api";

interface Player {
  id: string;
  display_name: string;
  active: number;
}
interface Device {
  id: string;
  player_id: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
interface PlayerList {
  players: Player[];
  devices: Device[];
}
interface Invite {
  registration_url: string;
  expires_at: string;
}

export default function AdminPage() {
  const [list, setList] = useState<PlayerList>({ players: [], devices: [] });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<PlayerList>("/api/admin/players"),
      apiRequest<{ admin: { email: string } }>("/api/admin/me"),
    ])
      .then(([players, identity]) => {
        if (active) {
          setList(players);
          setEmail(identity.admin.email);
        }
      })
      .catch((err: Error) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
      setList(await apiRequest<PlayerList>("/api/admin/players"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The request failed.");
    } finally {
      setBusy(false);
    }
  }

  function create(event: FormEvent) {
    event.preventDefault();
    void perform(async () => {
      await apiRequest("/api/admin/players", {
        method: "POST",
        body: JSON.stringify({ display_name: name }),
      });
      setName("");
    });
  }

  return (
    <>
      <div className="eyebrow">PRIVATE MANAGEMENT</div>
      <h1>
        Player <span className="accent-italic">access.</span>
      </h1>
      {email && <p className="muted-note">Signed in as {email}</p>}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <form className="management-panel" onSubmit={create}>
        <h2>Create a player</h2>
        <label htmlFor="player-name">Display name</label>
        <input
          id="player-name"
          value={name}
          maxLength={80}
          required
          autoComplete="off"
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primary-action" disabled={busy || !name.trim() || !email}>
          Create player
        </button>
      </form>
      {invite && (
        <section className="management-panel" aria-label="New device invitation">
          <h2>Send this link privately</h2>
          <p>
            This invitation works once and expires {new Date(invite.expires_at).toLocaleString()}.
          </p>
          <input
            aria-label="Private registration link"
            value={invite.registration_url}
            readOnly
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => {
              void copyText(invite.registration_url).then(setCopied);
            }}
          >
            {copied ? "Copied" : "Copy invitation"}
          </button>
          <button type="button" onClick={() => setInvite(null)}>
            Dismiss link
          </button>
        </section>
      )}
      {list.players.map((player) => (
        <section className="management-panel" key={player.id}>
          <h2>
            {player.display_name} {!player.active && <small>(inactive)</small>}
          </h2>
          <div className="action-row">
            <button
              type="button"
              disabled={busy || !player.active}
              onClick={() => {
                void perform(async () => {
                  const result = await apiRequest<Invite>(
                    `/api/admin/players/${player.id}/devices/invite`,
                    { method: "POST", body: "{}" },
                  );
                  setInvite(result);
                  setCopied(false);
                });
              }}
            >
              Add Device
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (
                  player.active &&
                  !window.confirm(
                    `Deactivate ${player.display_name}? This revokes their devices, sessions, and pending invitations.`,
                  )
                )
                  return;
                void perform(async () => {
                  await apiRequest(`/api/admin/players/${player.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ active: !player.active }),
                  });
                });
              }}
            >
              {player.active ? "Deactivate player" : "Reactivate player"}
            </button>
          </div>
          <ul className="device-list">
            {list.devices
              .filter((device) => device.player_id === player.id)
              .map((device) => (
                <li key={device.id}>
                  <strong>{device.label || "Unnamed device"}</strong>
                  <p className="muted-note">
                    {device.revoked_at
                      ? "Revoked"
                      : `Last used: ${device.last_used_at ? new Date(device.last_used_at).toLocaleString() : "Not yet used"}`}
                  </p>
                  {!device.revoked_at && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm("Revoke this device and its browser sessions?")) return;
                        void perform(async () => {
                          await apiRequest(`/api/admin/devices/${device.id}/revoke`, {
                            method: "POST",
                            body: "{}",
                          });
                        });
                      }}
                    >
                      Revoke device
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </section>
      ))}
    </>
  );
}
