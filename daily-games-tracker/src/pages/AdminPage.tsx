import React, { type FormEvent } from "react";
import { apiRequest, copyText } from "../lib/api";
import { GAMES } from "../../shared/game-config";
import type { GameKey } from "../../shared/types";

interface Player {
  id: string;
  display_name: string;
  active: number;
  created_at: string;
  updated_at: string;
}
interface Device {
  id: string;
  player_id: string;
  display_name: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}
interface PlayerList {
  players: Player[];
  devices: Device[];
}
interface Invitation {
  id: string;
  player_id: string;
  display_name: string;
  expires_at: string;
  consumed_at: string | null;
  created_by: string;
  created_at: string;
}
interface Session {
  id: string;
  player_id: string;
  display_name: string;
  has_source_device: number;
  idle_expires_at: string;
  absolute_expires_at: string;
  last_activity_at: string;
  revoked_at: string | null;
  created_at: string;
}
interface Round {
  id: string;
  round_number: number;
  raw_score: number;
  original_emoji: string | null;
  prompt?: string | null;
  answer?: string | null;
}
interface Submission {
  id: string;
  player_id: string;
  display_name: string;
  game_key: "krillion" | "maptap";
  game_date: string;
  external_puzzle_key: string;
  final_score: number;
  parser_version: string;
  source_kind: string;
  submitted_at: string;
  updated_at: string;
  rounds: Round[];
}
interface Audit {
  id: string;
  admin_identity: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}
export interface AdminDashboard extends PlayerList {
  invitations: Invitation[];
  sessions: Session[];
  submissions: Submission[];
  audits: Audit[];
}
interface Invite {
  registration_url: string;
  expires_at: string;
}

function backfillRoundTemplate(gameKey: GameKey): string {
  return JSON.stringify(
    Array.from({ length: GAMES[gameKey].roundCount }, (_, index) => ({
      round_number: index + 1,
      raw_score: 0,
      original_emoji: null,
      ...(gameKey === "krillion" ? { prompt: "", answer: null } : {}),
    })),
    null,
    2,
  );
}

function parseBackfillRounds(value: string, gameKey: GameKey): unknown[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Enter valid JSON for the historical rounds.");
  }
  const expectedCount = GAMES[gameKey].roundCount;
  if (!Array.isArray(parsed) || parsed.length !== expectedCount) {
    throw new Error(`Enter exactly ${expectedCount} historical round objects.`);
  }
  const validShape = parsed.every((round, index) => {
    if (!round || typeof round !== "object" || Array.isArray(round)) return false;
    const candidate = round as Record<string, unknown>;
    return (
      candidate.round_number === index + 1 &&
      Number.isInteger(candidate.round_number) &&
      typeof candidate.raw_score === "number" &&
      Number.isFinite(candidate.raw_score)
    );
  });
  if (!validShape) {
    throw new Error(
      `Each round must be an object with round_number 1-${expectedCount} and a numeric raw_score.`,
    );
  }
  if (
    gameKey === "krillion" &&
    parsed.some((round) => {
      const prompt = (round as Record<string, unknown>).prompt;
      return typeof prompt !== "string" || !prompt.trim();
    })
  ) {
    throw new Error("Each Krillion round must include a non-empty prompt.");
  }
  return parsed;
}

const emptyDashboard: AdminDashboard = {
  players: [],
  devices: [],
  invitations: [],
  sessions: [],
  submissions: [],
  audits: [],
};

export interface AdminPageProps {
  initialData?: AdminDashboard;
}

export default function AdminPage({ initialData = emptyDashboard }: AdminPageProps = {}) {
  const [list, setList] = React.useState<AdminDashboard>(initialData);
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(true);
  const [invite, setInvite] = React.useState<Invite | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [correctionReasons, setCorrectionReasons] = React.useState<Record<string, string>>({});
  const [correctionPrompts, setCorrectionPrompts] = React.useState<Record<string, string[]>>({});
  const [deleteReasons, setDeleteReasons] = React.useState<Record<string, string>>({});
  const [correctionTotals, setCorrectionTotals] = React.useState<Record<string, string>>({});
  const [roundScores, setRoundScores] = React.useState<Record<string, number[]>>({});
  const [backfill, setBackfill] = React.useState({
    player_id: "",
    game_key: "maptap" as "krillion" | "maptap",
    game_date: "",
    external_puzzle_key: "",
    final_score: "",
    rounds: backfillRoundTemplate("maptap"),
    reason: "",
  });

  React.useEffect(() => {
    let active = true;
    void Promise.all([
      apiRequest<AdminDashboard>("/api/admin/dashboard"),
      apiRequest<{ admin: { email: string } }>("/api/admin/me"),
    ])
      .then(([dashboard, identity]) => {
        if (active) {
          setList(dashboard);
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
      setList(await apiRequest<AdminDashboard>("/api/admin/dashboard"));
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

  function editableScores(submission: Submission): number[] {
    return roundScores[submission.id] ?? submission.rounds.map((round) => round.raw_score);
  }

  function editablePrompts(submission: Submission): string[] {
    return correctionPrompts[submission.id] ?? submission.rounds.map((round) => round.prompt ?? "");
  }

  function updateRoundScore(submission: Submission, index: number, value: string) {
    const scores = [...editableScores(submission)];
    scores[index] = Number(value);
    setRoundScores((current) => ({ ...current, [submission.id]: scores }));
  }

  function updateRoundPrompt(submission: Submission, index: number, value: string) {
    const prompts = [...editablePrompts(submission)];
    prompts[index] = value;
    setCorrectionPrompts((current) => ({ ...current, [submission.id]: prompts }));
  }

  function submitCorrection(event: FormEvent, submission: Submission) {
    event.preventDefault();
    const reason = (correctionReasons[submission.id] ?? "").trim();
    if (!reason) {
      setError("Enter a reason for the correction.");
      return;
    }
    const prompts = editablePrompts(submission);
    if (submission.game_key === "krillion" && prompts.some((prompt) => !prompt.trim())) {
      setError("Enter a non-empty prompt for every Krillion round.");
      return;
    }
    if (!window.confirm(`Correct ${submission.display_name}'s ${submission.game_key} result?`))
      return;
    void perform(async () => {
      await apiRequest(`/api/admin/submissions/${submission.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          final_score: Number(correctionTotals[submission.id] ?? submission.final_score),
          rounds: submission.rounds.map((round, index) => ({
            round_number: round.round_number,
            raw_score: editableScores(submission)[index],
            original_emoji: round.original_emoji,
            ...(submission.game_key === "krillion" ? { prompt: prompts[index].trim() } : {}),
          })),
          reason,
        }),
      });
    });
  }

  function submitDeletion(event: FormEvent, submission: Submission) {
    event.preventDefault();
    const reason = (deleteReasons[submission.id] ?? "").trim();
    if (!reason) {
      setError("Enter a reason for the deletion.");
      return;
    }
    if (!window.confirm(`Delete ${submission.display_name}'s ${submission.game_key} result?`))
      return;
    void perform(async () => {
      await apiRequest(`/api/admin/submissions/${submission.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason }),
      });
    });
  }

  function submitBackfill(event: FormEvent) {
    event.preventDefault();
    const reason = backfill.reason.trim();
    if (!reason) {
      setError("Enter a reason for the historical backfill.");
      return;
    }
    let rounds: unknown[];
    try {
      rounds = parseBackfillRounds(backfill.rounds, backfill.game_key);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enter valid historical rounds.");
      return;
    }
    if (!window.confirm("Backfill this historical result?")) return;
    void perform(async () => {
      await apiRequest("/api/admin/submissions/manual", {
        method: "POST",
        body: JSON.stringify({
          ...backfill,
          final_score: Number(backfill.final_score),
          rounds,
          reason,
        }),
      });
      setBackfill((current) => ({
        ...current,
        rounds: backfillRoundTemplate(current.game_key),
        reason: "",
      }));
    });
  }

  return (
    <>
      <div className="eyebrow">PRIVATE MANAGEMENT</div>
      <h1>
        Players <span className="accent-italic">access.</span>
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
      <section
        className="management-panel admin-section"
        aria-labelledby="admin-invitations-heading"
      >
        <h2 id="admin-invitations-heading">Invitations</h2>
        {list.invitations.length === 0 ? (
          <p className="muted-note">No invitations have been created.</p>
        ) : (
          <ul className="admin-record-list">
            {list.invitations.map((item) => (
              <li key={item.id}>
                <strong>{item.display_name}</strong>
                <span>
                  {item.consumed_at ? "Used" : "Pending"} · expires{" "}
                  {new Date(item.expires_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="muted-note">
          Invitation links are shown only once after creation; tokens are never listed here.
        </p>
      </section>

      <section className="management-panel admin-section" aria-labelledby="admin-devices-heading">
        <h2 id="admin-devices-heading">Devices</h2>
        {list.devices.length === 0 ? (
          <p className="muted-note">No devices have been registered.</p>
        ) : (
          <ul className="admin-record-list">
            {list.devices.map((device) => (
              <li key={device.id}>
                <strong>{device.label || "Unnamed device"}</strong>
                <span>
                  {device.display_name} · {device.revoked_at ? "Revoked" : "Active"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="management-panel admin-section" aria-labelledby="admin-sessions-heading">
        <h2 id="admin-sessions-heading">Sessions</h2>
        {list.sessions.length === 0 ? (
          <p className="muted-note">No browser sessions have been created.</p>
        ) : (
          <ul className="admin-record-list">
            {list.sessions.map((session) => (
              <li key={session.id}>
                <strong>{session.display_name}</strong>
                <span>
                  {session.revoked_at ? "Revoked" : "Active"} ·{" "}
                  {session.has_source_device ? "device linked" : "browser only"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="management-panel admin-section" aria-labelledby="admin-backfill-heading">
        <h2 id="admin-backfill-heading">Historical backfill</h2>
        <form onSubmit={submitBackfill}>
          <label htmlFor="backfill-player">Player</label>
          <select
            id="backfill-player"
            required
            value={backfill.player_id}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, player_id: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, player_id: value }));
            }}
          >
            <option value="">Choose a player</option>
            {list.players
              .filter((player) => player.active)
              .map((player) => (
                <option key={player.id} value={player.id}>
                  {player.display_name}
                </option>
              ))}
          </select>
          <label htmlFor="backfill-game">Game</label>
          <select
            id="backfill-game"
            value={backfill.game_key}
            onChange={(event) => {
              const gameKey = event.target.value as GameKey;
              setBackfill((current) => ({
                ...current,
                game_key: gameKey,
                rounds: backfillRoundTemplate(gameKey),
              }));
            }}
            onInput={(event) => {
              const gameKey = event.currentTarget.value as GameKey;
              setBackfill((current) => ({
                ...current,
                game_key: gameKey,
                rounds: backfillRoundTemplate(gameKey),
              }));
            }}
          >
            <option value="maptap">MapTap</option>
            <option value="krillion">Krillion</option>
          </select>
          <label htmlFor="backfill-date">Game date (America/Los_Angeles)</label>
          <input
            id="backfill-date"
            type="date"
            required
            value={backfill.game_date}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, game_date: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, game_date: value }));
            }}
          />
          <label htmlFor="backfill-puzzle">Puzzle key</label>
          <input
            id="backfill-puzzle"
            required
            value={backfill.external_puzzle_key}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, external_puzzle_key: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, external_puzzle_key: value }));
            }}
          />
          <label htmlFor="backfill-total">Final score</label>
          <input
            id="backfill-total"
            type="number"
            required
            value={backfill.final_score}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, final_score: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, final_score: value }));
            }}
          />
          <label htmlFor="backfill-rounds">Rounds (JSON)</label>
          <p id="backfill-rounds-help" className="muted-note">
            Enter a JSON array with exactly {GAMES[backfill.game_key].roundCount} objects. Each
            object must include sequential <code>round_number</code> values starting at 1 and a
            numeric <code>raw_score</code>; <code>original_emoji</code> is optional. Krillion also
            requires a non-empty <code>prompt</code> for every round; <code>answer</code> is
            optional. A matching {GAMES[backfill.game_key].displayName} template is prefilled.
          </p>
          <textarea
            id="backfill-rounds"
            required
            rows={5}
            aria-describedby="backfill-rounds-help"
            value={backfill.rounds}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, rounds: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, rounds: value }));
            }}
          />
          <label htmlFor="backfill-reason">Reason</label>
          <textarea
            id="backfill-reason"
            required
            maxLength={500}
            rows={3}
            value={backfill.reason}
            onChange={(event) =>
              setBackfill((current) => ({ ...current, reason: event.target.value }))
            }
            onInput={(event) => {
              const value = event.currentTarget.value;
              setBackfill((current) => ({ ...current, reason: value }));
            }}
          />
          <button className="primary-action" disabled={busy}>
            Backfill result
          </button>
        </form>
      </section>

      <section
        className="management-panel admin-section"
        aria-labelledby="admin-submissions-heading"
      >
        <h2 id="admin-submissions-heading">Submissions</h2>
        {list.submissions.length === 0 ? (
          <p className="muted-note">No normalized submissions have been saved.</p>
        ) : (
          list.submissions.map((submission) => (
            <article className="admin-record" key={submission.id}>
              <h3>
                {submission.display_name} · {submission.game_key} · {submission.game_date}
              </h3>
              <p className="muted-note">
                Puzzle {submission.external_puzzle_key} · source {submission.source_kind}
              </p>
              <form onSubmit={(event) => submitCorrection(event, submission)}>
                <fieldset>
                  <legend>Correct normalized score</legend>
                  <label htmlFor={`correction-total-${submission.id}`}>Final score</label>
                  <input
                    id={`correction-total-${submission.id}`}
                    type="number"
                    required
                    value={correctionTotals[submission.id] ?? submission.final_score}
                    onChange={(event) =>
                      setCorrectionTotals((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                  />
                  {submission.rounds.map((round, index) => (
                    <React.Fragment key={round.id}>
                      <label htmlFor={`correction-round-${submission.id}-${round.round_number}`}>
                        Round {round.round_number} raw score
                        <input
                          id={`correction-round-${submission.id}-${round.round_number}`}
                          type="number"
                          min={0}
                          max={100}
                          required
                          value={editableScores(submission)[index] ?? ""}
                          onChange={(event) =>
                            updateRoundScore(submission, index, event.target.value)
                          }
                        />
                      </label>
                      {submission.game_key === "krillion" && (
                        <label htmlFor={`correction-prompt-${submission.id}-${round.round_number}`}>
                          Round {round.round_number} prompt
                          <textarea
                            id={`correction-prompt-${submission.id}-${round.round_number}`}
                            required
                            maxLength={1_000}
                            rows={2}
                            value={editablePrompts(submission)[index] ?? ""}
                            onChange={(event) =>
                              updateRoundPrompt(submission, index, event.target.value)
                            }
                            onInput={(event) =>
                              updateRoundPrompt(submission, index, event.currentTarget.value)
                            }
                          />
                        </label>
                      )}
                    </React.Fragment>
                  ))}
                  <label htmlFor={`correction-reason-${submission.id}`}>
                    Reason for correction
                  </label>
                  <textarea
                    id={`correction-reason-${submission.id}`}
                    required
                    maxLength={500}
                    rows={3}
                    value={correctionReasons[submission.id] ?? ""}
                    onChange={(event) =>
                      setCorrectionReasons((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                    onInput={(event) => {
                      const value = event.currentTarget.value;
                      setCorrectionReasons((current) => ({
                        ...current,
                        [submission.id]: value,
                      }));
                    }}
                  />
                  <button type="submit" disabled={busy}>
                    Save correction
                  </button>
                </fieldset>
              </form>
              <form onSubmit={(event) => submitDeletion(event, submission)}>
                <fieldset>
                  <legend>Delete submission</legend>
                  <label htmlFor={`delete-reason-${submission.id}`}>Reason for deletion</label>
                  <textarea
                    id={`delete-reason-${submission.id}`}
                    required
                    maxLength={500}
                    rows={3}
                    value={deleteReasons[submission.id] ?? ""}
                    onChange={(event) =>
                      setDeleteReasons((current) => ({
                        ...current,
                        [submission.id]: event.target.value,
                      }))
                    }
                    onInput={(event) => {
                      const value = event.currentTarget.value;
                      setDeleteReasons((current) => ({
                        ...current,
                        [submission.id]: value,
                      }));
                    }}
                  />
                  <button type="submit" disabled={busy}>
                    Delete submission
                  </button>
                </fieldset>
              </form>
            </article>
          ))
        )}
      </section>

      <section className="management-panel admin-section" aria-labelledby="admin-audits-heading">
        <h2 id="admin-audits-heading">Audit history</h2>
        {list.audits.length === 0 ? (
          <p className="muted-note">No administrator actions have been recorded.</p>
        ) : (
          <ul className="admin-record-list">
            {list.audits.map((audit) => (
              <li key={audit.id}>
                <strong>
                  {audit.action} · {audit.entity_type}
                </strong>
                <span>
                  {audit.admin_identity} · {audit.reason || "No reason recorded"}
                </span>
                <pre>{JSON.stringify({ before: audit.before, after: audit.after })}</pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
