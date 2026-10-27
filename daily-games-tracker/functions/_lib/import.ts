import { parseCapture } from "../../parsers";
import { ParserError } from "../../parsers/errors";
import { GAMES, KRILLION_SCORE_EMOJI } from "../../shared/game-config";
import type { CaptureInput, NormalizedGameResult } from "../../shared/types";
import {
  authenticateDeviceWithShortcutPolicy,
  type DeviceIdentity,
  type DeviceWithShortcutPolicy,
} from "./devices";
import { ApiError, apiErrorResponse, apiJson, readJsonBody, requireMethod } from "./http";
import type { AppEnv } from "./runtime";
import { shortcutDownloadUrl } from "./shortcut-download";
import { SESSION_IDLE_MS } from "./sessions";
import { logRequestFailure } from "./logging";
import { submissionScoreboard } from "./scoreboard";

function problem(code: string, message: string, status = 422): ApiError {
  return new ApiError(status, code, `${message}\n\nNothing was submitted.`);
}
const alreadySavedMessage = "You already have a result saved for this game today.";

const identityConflict = () =>
  problem(
    "IDENTITY_CONFLICT",
    "The saved challenge identity conflicts with this capture. Contact the administrator.",
    409,
  );

export function confirmationText(player: string, r: NormalizedGameResult): string {
  const lines =
    r.gameKey === "krillion"
      ? r.rounds.map(
          (round) =>
            `${round.roundNumber}. ${round.answer ?? "—"} — ${KRILLION_SCORE_EMOJI[round.rawScore]} ${round.rawScore}`,
        )
      : r.rounds.map(
          (round) => `${round.roundNumber}. ${round.rawScore}${round.originalEmoji ?? ""}`,
        );
  return `${GAMES[r.gameKey].displayName} — ${r.gameDate}\nPuzzle: ${r.externalPuzzleKey}\nPlayer: ${player}\n${lines.join("\n")}\nTotal: ${r.finalScore}\n\nValidation passed. Submit results?`;
}

async function existing(env: AppEnv, player: string, r: NormalizedGameResult) {
  return env.DB.prepare(
    `SELECT s.id FROM submissions s
    JOIN game_days d ON d.id = s.game_day_id
    WHERE s.player_id = ? AND d.game_id = ? AND d.game_date = ?`,
  )
    .bind(player, r.gameKey, r.gameDate)
    .first<{ id: string }>();
}
async function checkDay(env: AppEnv, r: NormalizedGameResult) {
  const rows = await env.DB.prepare(
    `SELECT external_puzzle_key, game_date FROM game_days
    WHERE game_id = ? AND (game_date = ? OR external_puzzle_key = ?)`,
  )
    .bind(r.gameKey, r.gameDate, r.externalPuzzleKey)
    .all<{ external_puzzle_key: string; game_date: string }>();
  if (
    rows.results.some(
      (d) => d.game_date !== r.gameDate || d.external_puzzle_key !== r.externalPuzzleKey,
    )
  )
    throw identityConflict();
}

async function gameState(env: AppEnv, player: string, r: NormalizedGameResult) {
  return env.DB.prepare(
    `
    SELECT g.active,
      (SELECT s.id FROM submissions s JOIN game_days d ON d.id = s.game_day_id
       WHERE s.player_id = ? AND d.game_id = g.id AND d.game_date = ?) AS submission_id,
      EXISTS (SELECT 1 FROM game_days d WHERE d.game_id = g.id
        AND (d.game_date = ? OR d.external_puzzle_key = ?)
        AND (d.game_date != ? OR d.external_puzzle_key != ?)) AS identity_conflict
    FROM games g WHERE g.id = ?
  `,
  )
    .bind(
      player,
      r.gameDate,
      r.gameDate,
      r.externalPuzzleKey,
      r.gameDate,
      r.externalPuzzleKey,
      r.gameKey,
    )
    .first<{ active: number; submission_id: string | null; identity_conflict: number }>();
}

function activity(env: AppEnv, device: DeviceIdentity, now: Date) {
  const stamp = now.toISOString();
  const idle = new Date(now.getTime() + SESSION_IDLE_MS).toISOString();
  return [
    env.DB.prepare(
      `UPDATE device_credentials SET last_used_at = ? WHERE id = ? AND revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM players WHERE id = player_id AND active = 1)`,
    ).bind(stamp, device.id),
    env.DB.prepare(
      `UPDATE web_sessions SET last_activity_at = ?, idle_expires_at = min(absolute_expires_at, ?)
      WHERE player_id = ? AND revoked_at IS NULL AND idle_expires_at > ? AND absolute_expires_at > ?
      AND EXISTS (SELECT 1 FROM players WHERE id = web_sessions.player_id AND active = 1)
      AND EXISTS (SELECT 1 FROM device_credentials WHERE id = ? AND revoked_at IS NULL)
      AND (source_device_id IS NULL OR EXISTS (SELECT 1 FROM device_credentials WHERE id = source_device_id AND revoked_at IS NULL))`,
    ).bind(stamp, idle, device.player_id, stamp, stamp, device.id),
  ];
}

async function refreshActivity(env: AppEnv, device: DeviceIdentity, now: Date) {
  const touched = await env.DB.batch(activity(env, device, now));
  if (!touched[0].meta.changes)
    throw problem(
      "DEVICE_NOT_AUTHORIZED",
      "This device was revoked. Contact the administrator.",
      401,
    );
}

async function save(
  env: AppEnv,
  device: DeviceIdentity,
  r: NormalizedGameResult,
  source: CaptureInput["source_kind"],
  now: Date,
) {
  const id = crypto.randomUUID();
  const stamp = now.toISOString();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO game_days (id, game_id, game_date, external_puzzle_key)
        VALUES (?, ?, ?, ?) ON CONFLICT(game_id, game_date) DO NOTHING`,
      ).bind(crypto.randomUUID(), r.gameKey, r.gameDate, r.externalPuzzleKey),
      env.DB.prepare(
        `INSERT INTO submissions (id, player_id, game_id, game_day_id, final_score,
        parser_version, source_kind, submitted_via_device_id, submitted_at, updated_at)
        SELECT ?, ?, d.game_id, d.id, ?, ?, ?, ?, ?, ? FROM game_days d
        JOIN games g ON g.id = d.game_id AND g.active = 1
        WHERE d.game_id = ? AND d.game_date = ? AND d.external_puzzle_key = ?
        AND EXISTS (SELECT 1 FROM device_credentials c JOIN players p ON p.id = c.player_id
          WHERE c.id = ? AND c.player_id = ? AND c.revoked_at IS NULL AND p.active = 1)`,
      ).bind(
        id,
        device.player_id,
        r.finalScore,
        r.parserVersion,
        source,
        device.id,
        stamp,
        stamp,
        r.gameKey,
        r.gameDate,
        r.externalPuzzleKey,
        device.id,
        device.player_id,
      ),
      ...r.rounds.map((round) =>
        env.DB.prepare(
          `INSERT INTO round_results
        (id, submission_id, round_number, prompt, answer, raw_score, original_emoji) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          id,
          round.roundNumber,
          round.prompt ?? null,
          round.answer ?? null,
          round.rawScore,
          round.originalEmoji ?? null,
        ),
      ),
      ...activity(env, device, now),
    ]);
    return { id, created: true };
  } catch (error) {
    // The uniqueness guard may have rejected a race, or a committed response may have been lost.
    // Both are the same already-saved outcome; never compare or overwrite the existing result.
    await checkDay(env, r);
    const saved = await existing(env, device.player_id, r);
    if (saved) return { id: saved.id, created: false };
    const active = await env.DB.prepare(
      `SELECT c.id FROM device_credentials c JOIN players p ON p.id = c.player_id
      WHERE c.id = ? AND c.revoked_at IS NULL AND p.active = 1`,
    )
      .bind(device.id)
      .first();
    if (!active)
      throw problem(
        "DEVICE_NOT_AUTHORIZED",
        "This device was revoked. Contact the administrator.",
        401,
      );
    throw error;
  }
}

async function completion(
  request: Request,
  env: AppEnv,
  requestId: string,
  device: DeviceIdentity,
  result: NormalizedGameResult,
  saved: { id: string; created: boolean },
  support: Record<string, unknown>,
) {
  // Render from stored scores, including on repeats. A rendering failure cannot undo a save.
  const whtUrl = new URL(`/daily/${result.gameDate}`, request.url).href;
  let rank: number | null = null;
  let scoreboardText: string | null = null;
  try {
    const scoreboard = await submissionScoreboard(
      env,
      result.gameDate,
      device.player_id,
      result.gameKey,
    );
    rank = scoreboard.daily_rank;
    scoreboardText = scoreboard.scoreboard_text;
  } catch (error) {
    logRequestFailure({ requestId, request, error });
  }
  return apiJson(requestId, {
    status: saved.created ? "submitted" : "already_submitted",
    submission_id: saved.id,
    game: result.gameKey,
    game_date: result.gameDate,
    daily_rank: rank,
    ...(saved.created
      ? {
          final_score: result.finalScore,
          success_message: `✅ ${GAMES[result.gameKey].displayName} submitted!\nScore: ${result.finalScore}${rank === null ? "" : `\nCurrent daily rank: ${rank}`}`,
        }
      : { message: alreadySavedMessage }),
    scoreboard_text: scoreboardText,
    wht_url: whtUrl,
    // Show a copied message only after the native Copy to Clipboard action completes.
    completion_message: `${saved.created ? "Upload successful." : alreadySavedMessage} ${
      scoreboardText === null
        ? "Scoreboard copying is unavailable right now."
        : "Scoreboard copied to clipboard."
    }`,
    ...support,
  });
}

export async function importRequest(
  request: Request,
  env: AppEnv,
  requestId: string,
  mode: "validate" | "submit",
  now = new Date(),
): Promise<Response> {
  try {
    requireMethod(request, ["POST"]);
    const origin = request.headers.get("Origin");
    if (
      (origin && origin !== new URL(request.url).origin) ||
      request.headers.get("Sec-Fetch-Site") === "cross-site"
    )
      throw problem("ORIGIN_REJECTED", "Open WHT on its own website and try again.", 403);
    let device: DeviceWithShortcutPolicy;
    try {
      device = await authenticateDeviceWithShortcutPolicy(request, env);
    } catch (error) {
      if (error instanceof ApiError && error.errorCode === "DEVICE_UNAUTHORIZED")
        throw problem(
          "DEVICE_NOT_AUTHORIZED",
          "This device is not authorized. Ask the administrator for a new device invitation.",
          401,
        );
      throw error;
    }
    const body = await readJsonBody<Record<string, unknown>>(request);
    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.keys(body).some((key) => !["shortcut_version", "capture"].includes(key)) ||
      !Number.isSafeInteger(body.shortcut_version) ||
      Number(body.shortcut_version) < 1
    )
      throw problem("INVALID_REQUEST", "Share the completed game using Upload to WHT again.", 400);
    const minimum = Number(device.minimum_shortcut_version);
    const latest = Number(device.latest_shortcut_version);
    if (
      !Number.isSafeInteger(minimum) ||
      minimum < 1 ||
      !Number.isSafeInteger(latest) ||
      latest < minimum
    )
      throw new Error("Invalid Shortcut policy");
    const installUrlValue = shortcutDownloadUrl(env);
    const support = {
      shortcut_support:
        Number(body.shortcut_version) < minimum
          ? "update_required"
          : Number(body.shortcut_version) < latest
            ? "update_available"
            : "supported",
      latest_version: latest,
      install_url: installUrlValue,
    };
    if (support.shortcut_support === "update_required") {
      if (!installUrlValue)
        throw problem(
          "SHORTCUT_UPDATE_UNAVAILABLE",
          "This Shortcut needs an update, but its download is unavailable. Contact the administrator for the latest Upload to WHT Shortcut.",
          503,
        );
      return apiJson(
        requestId,
        {
          status: "update_required",
          ...support,
          error_message:
            "Install the latest Upload to WHT Shortcut, then share again.\n\nNothing was submitted.",
        },
        { status: 426 },
      );
    }
    const result = parseCapture(body.capture, now);
    const game = await gameState(env, device.player_id, result);
    if (!game?.active)
      throw problem(
        "PARSER_UNSUPPORTED",
        "This game is temporarily unavailable. Contact the administrator.",
      );
    if (game.identity_conflict) throw identityConflict();
    if (game.submission_id)
      return completion(
        request,
        env,
        requestId,
        device,
        result,
        { id: game.submission_id, created: false },
        support,
      );
    if (mode === "validate") {
      await refreshActivity(env, device, now);
      return apiJson(requestId, {
        status: "valid",
        game: result.gameKey,
        player: device.display_name,
        game_date: result.gameDate,
        round_count: result.rounds.length,
        final_score: result.finalScore,
        summary: result,
        confirmation_text: confirmationText(device.display_name, result),
        ...support,
      });
    }
    const outcome = await save(
      env,
      device,
      result,
      (body.capture as CaptureInput).source_kind,
      now,
    );
    return completion(request, env, requestId, device, result, outcome, support);
  } catch (error) {
    if (error instanceof ParserError)
      return apiErrorResponse(requestId, new ApiError(422, error.code, error.message));
    if (error instanceof ApiError)
      return apiErrorResponse(
        requestId,
        error.publicMessage.includes("Nothing was submitted.")
          ? error
          : new ApiError(
              error.statusCode,
              error.errorCode,
              `${error.publicMessage}\n\nNothing was submitted.`,
              { headers: error.headers },
            ),
      );
    logRequestFailure({ requestId, request, error });
    // A submit may have committed before a transport/service error. Do not promise that nothing was saved.
    return apiErrorResponse(
      requestId,
      new ApiError(
        503,
        "IMPORT_UNAVAILABLE",
        mode === "submit"
          ? "Submission could not be confirmed. Retry once; if a result was saved, WHT will tell you it already exists. Contact the administrator if this continues."
          : "Validation is unavailable. Try again or contact the administrator.\n\nNothing was submitted.",
      ),
    );
  }
}
