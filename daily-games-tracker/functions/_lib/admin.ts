import { PARSER_VERSIONS } from "../../shared/game-config";
import type { GameKey } from "../../shared/types";
import { ApiError } from "./http";
import type { AppEnv } from "./runtime";

export const ADMIN_REASON_MAX_LENGTH = 500;
const ADMIN_TEXT_MAX_LENGTH = 1_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface AdminRoundInput {
  round_number: number;
  prompt?: string | null;
  answer?: string | null;
  raw_score: number;
  original_emoji?: string | null;
}

export interface AdminSubmissionInput {
  final_score: number;
  rounds: AdminRoundInput[];
  reason: string;
}

export interface AdminBackfillInput extends AdminSubmissionInput {
  player_id: string;
  game_key: GameKey;
  game_date: string;
  external_puzzle_key: string;
}

export interface AdminPlayer {
  id: string;
  display_name: string;
  active: number;
  created_at: string;
  updated_at: string;
}

export interface AdminInvitation {
  id: string;
  player_id: string;
  display_name: string;
  expires_at: string;
  consumed_at: string | null;
  created_by: string;
  created_at: string;
}

export interface AdminDevice {
  id: string;
  player_id: string;
  display_name: string;
  label: string | null;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface AdminSession {
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

export interface AdminRound {
  id: string;
  round_number: number;
  raw_score: number;
  original_emoji: string | null;
  prompt?: string | null;
}

export interface AdminSubmission {
  id: string;
  player_id: string;
  display_name: string;
  game_key: GameKey;
  game_date: string;
  external_puzzle_key: string;
  final_score: number;
  parser_version: string;
  source_kind: string;
  submitted_at: string;
  updated_at: string;
  rounds: AdminRound[];
}

export interface AdminAudit {
  id: string;
  admin_identity: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown | null;
  after: unknown | null;
  reason: string | null;
  created_at: string;
}

interface GameConfig {
  id: string;
  key: GameKey;
  round_count: number;
  config_json: string;
}

interface StoredRound extends AdminRound {
  prompt: string | null;
  answer: string | null;
}

interface SubmissionRecord extends Omit<AdminSubmission, "rounds"> {
  game_id: string;
  game_day_id: string;
  rounds: StoredRound[];
}

interface GameConfigJson {
  parserVersion?: unknown;
  allowedScores?: unknown;
  weights?: unknown;
}

export async function listAdminPlayers(env: AppEnv): Promise<AdminPlayer[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, display_name, active, created_at, updated_at
     FROM players ORDER BY display_name COLLATE NOCASE, id`,
  ).all<AdminPlayer>();
  return results;
}

export async function listAdminInvitations(env: AppEnv): Promise<AdminInvitation[]> {
  const { results } = await env.DB.prepare(
    `SELECT i.id, i.player_id, p.display_name, i.expires_at, i.consumed_at,
            i.created_by, i.created_at
     FROM registration_invites i JOIN players p ON p.id = i.player_id
     ORDER BY i.created_at DESC, i.id`,
  ).all<AdminInvitation>();
  return results;
}

export async function listAdminDevices(env: AppEnv): Promise<AdminDevice[]> {
  const { results } = await env.DB.prepare(
    `SELECT d.id, d.player_id, p.display_name, d.label, d.created_at,
            d.last_used_at, d.revoked_at
     FROM device_credentials d JOIN players p ON p.id = d.player_id
     ORDER BY d.created_at DESC, d.id`,
  ).all<AdminDevice>();
  return results;
}

export async function listAdminSessions(env: AppEnv): Promise<AdminSession[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.player_id, p.display_name,
            CASE WHEN s.source_device_id IS NULL THEN 0 ELSE 1 END AS has_source_device,
            s.idle_expires_at, s.absolute_expires_at, s.last_activity_at,
            s.revoked_at, s.created_at
     FROM web_sessions s JOIN players p ON p.id = s.player_id
     ORDER BY s.created_at DESC, s.id`,
  ).all<AdminSession>();
  return results;
}

export async function listAdminSubmissions(env: AppEnv): Promise<AdminSubmission[]> {
  const { results } = await env.DB.prepare(
    `SELECT s.id, s.player_id, p.display_name, g.key AS game_key,
            d.game_date, d.external_puzzle_key, s.final_score, s.parser_version,
            s.source_kind, s.submitted_at, s.updated_at,
            r.id AS round_id, r.round_number, r.prompt, r.answer,
            r.raw_score, r.original_emoji
     FROM submissions s
     JOIN players p ON p.id = s.player_id
     JOIN games g ON g.id = s.game_id
     JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
     LEFT JOIN round_results r ON r.submission_id = s.id
     ORDER BY d.game_date DESC, p.display_name COLLATE NOCASE, s.id, r.round_number`,
  ).all<AdminSubmissionQueryRow>();
  return groupSubmissionRows(results);
}

export async function listAdminAudits(env: AppEnv): Promise<AdminAudit[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, admin_identity, action, entity_type, entity_id,
            before_json, after_json, reason, created_at
     FROM admin_audit_log ORDER BY created_at DESC, id DESC`,
  ).all<AdminAuditQueryRow>();
  return results.map((row) => ({
    id: row.id,
    admin_identity: row.admin_identity,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    before: parseJson(row.before_json),
    after: parseJson(row.after_json),
    reason: row.reason,
    created_at: row.created_at,
  }));
}

export async function correctSubmission(
  env: AppEnv,
  submissionId: string,
  input: AdminSubmissionInput,
  adminIdentity: string,
): Promise<AdminSubmission> {
  const reason = requireReason(input.reason);
  requireAdminIdentity(adminIdentity);
  const current = await findSubmission(env, submissionId);
  if (!current) throw submissionNotFound();
  const game = await findGame(env, current.game_key);
  const rounds = validateResult(game, input.final_score, input.rounds, current.rounds);
  const beforeUpdatedAt = current.updated_at;
  const timestamp = nextUpdatedAt(beforeUpdatedAt);
  const after: SubmissionRecord = {
    ...current,
    final_score: input.final_score,
    updated_at: timestamp,
    rounds: rounds.map((round) => ({ ...round, id: crypto.randomUUID() })),
  };
  const audit = auditStatement(
    env,
    adminIdentity,
    "submission.correct",
    "submission",
    submissionId,
    snapshot(current),
    snapshot(after),
    reason,
    timestamp,
    { submissionId, updatedAt: beforeUpdatedAt },
  );
  const results = await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM round_results WHERE submission_id = ? AND EXISTS
       (SELECT 1 FROM submissions WHERE id = ? AND updated_at = ?)`,
    ).bind(submissionId, submissionId, beforeUpdatedAt),
    ...after.rounds.map((round) => roundInsert(env, submissionId, round, beforeUpdatedAt)),
    audit,
    env.DB.prepare(
      "UPDATE submissions SET final_score = ?, updated_at = ? WHERE id = ? AND updated_at = ?",
    ).bind(input.final_score, timestamp, submissionId, beforeUpdatedAt),
  ]);
  if (results.at(-1)?.meta.changes !== 1) throw submissionConflict();
  return toAdminSubmission(after);
}

export async function deleteSubmission(
  env: AppEnv,
  submissionId: string,
  reasonInput: string,
  adminIdentity: string,
): Promise<void> {
  const reason = requireReason(reasonInput);
  requireAdminIdentity(adminIdentity);
  const current = await findSubmission(env, submissionId);
  if (!current) throw submissionNotFound();
  const timestamp = new Date().toISOString();
  const results = await env.DB.batch([
    auditStatement(
      env,
      adminIdentity,
      "submission.delete",
      "submission",
      submissionId,
      snapshot(current),
      null,
      reason,
      timestamp,
      { submissionId, updatedAt: current.updated_at },
    ),
    env.DB.prepare("DELETE FROM submissions WHERE id = ? AND updated_at = ?").bind(
      submissionId,
      current.updated_at,
    ),
  ]);
  if (!results.at(-1)?.meta.changes) throw submissionConflict();
}

export async function backfillSubmission(
  env: AppEnv,
  input: AdminBackfillInput,
  adminIdentity: string,
): Promise<AdminSubmission> {
  const reason = requireReason(input.reason);
  requireAdminIdentity(adminIdentity);
  validateCalendarDay(input.game_date);
  validatePuzzleKey(input.external_puzzle_key);
  if (typeof input.player_id !== "string" || !input.player_id) throw invalidResult();
  const game = await findGame(env, input.game_key);
  const player = await env.DB.prepare(
    "SELECT id, display_name FROM players WHERE id = ? AND active = 1",
  )
    .bind(input.player_id)
    .first<{ id: string; display_name: string }>();
  if (!player) throw new ApiError(404, "PLAYER_NOT_FOUND", "Choose an active player.");
  const rounds = validateResult(game, input.final_score, input.rounds);
  const conflict = await env.DB.prepare(
    `SELECT s.id FROM submissions s JOIN game_days d ON d.id = s.game_day_id
     WHERE s.player_id = ? AND s.game_id = ? AND d.game_date = ?`,
  )
    .bind(input.player_id, game.id, input.game_date)
    .first<{ id: string }>();
  if (conflict) {
    throw submissionExists();
  }

  const days = await env.DB.prepare(
    `SELECT id, game_date, external_puzzle_key FROM game_days
     WHERE game_id = ? AND (game_date = ? OR external_puzzle_key = ?)`,
  )
    .bind(game.id, input.game_date, input.external_puzzle_key)
    .all<{ id: string; game_date: string; external_puzzle_key: string }>();
  if (
    days.results.some(
      (day) =>
        day.game_date !== input.game_date || day.external_puzzle_key !== input.external_puzzle_key,
    )
  ) {
    throw new ApiError(
      409,
      "GAME_DAY_CONFLICT",
      "That game date and puzzle key identify different game days.",
    );
  }
  const gameDayId = days.results[0]?.id ?? adminGameDayId(game.id, input.game_date);
  const submissionId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const record: SubmissionRecord = {
    id: submissionId,
    player_id: player.id,
    display_name: player.display_name,
    game_id: game.id,
    game_day_id: gameDayId,
    game_key: game.key,
    game_date: input.game_date,
    external_puzzle_key: input.external_puzzle_key,
    final_score: input.final_score,
    parser_version: configuredParserVersion(game),
    source_kind: "admin",
    submitted_at: timestamp,
    updated_at: timestamp,
    rounds: rounds.map((round) => ({ ...round, id: crypto.randomUUID() })),
  };
  const statements = [
    env.DB.prepare(
      `INSERT OR IGNORE INTO game_days(id, game_id, game_date, external_puzzle_key, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(gameDayId, game.id, input.game_date, input.external_puzzle_key, timestamp, timestamp),
    env.DB.prepare(
      `INSERT INTO submissions(id, player_id, game_id, game_day_id, final_score, parser_version,
       source_kind, submitted_via_device_id, submitted_at, updated_at)
       SELECT ?, ?, ?, d.id, ?, ?, 'admin', NULL, ?, ?
       FROM game_days d
       WHERE d.game_id = ? AND d.game_date = ? AND d.external_puzzle_key = ?
         AND EXISTS (SELECT 1 FROM players WHERE id = ? AND active = 1)
         AND NOT EXISTS (SELECT 1 FROM submissions s WHERE s.player_id = ? AND s.game_day_id = d.id)`,
    ).bind(
      record.id,
      record.player_id,
      record.game_id,
      record.final_score,
      record.parser_version,
      timestamp,
      timestamp,
      record.game_id,
      input.game_date,
      input.external_puzzle_key,
      record.player_id,
      record.player_id,
    ),
    ...record.rounds.map((round) => roundInsert(env, record.id, round, undefined, true)),
    canonicalSubmissionAuditStatement(
      env,
      adminIdentity,
      "submission.backfill",
      "submission",
      record.id,
      snapshot(record),
      reason,
      timestamp,
      record.id,
    ),
  ];
  const results = await env.DB.batch(statements);
  if (results[1]?.meta.changes !== 1) {
    const canonical = await env.DB.prepare(
      `SELECT id FROM game_days
       WHERE game_id = ? AND game_date = ? AND external_puzzle_key = ?`,
    )
      .bind(game.id, input.game_date, input.external_puzzle_key)
      .first<{ id: string }>();
    if (!canonical) {
      const conflict = await env.DB.prepare(
        `SELECT id FROM game_days
         WHERE game_id = ? AND (game_date = ? OR external_puzzle_key = ?)`,
      )
        .bind(game.id, input.game_date, input.external_puzzle_key)
        .first<{ id: string }>();
      if (conflict) throw gameDayConflict();
      throw backfillConflict();
    }
    const duplicate = await env.DB.prepare(
      "SELECT id FROM submissions WHERE player_id = ? AND game_day_id = ?",
    )
      .bind(record.player_id, canonical.id)
      .first<{ id: string }>();
    if (duplicate) throw submissionExists();
    throw backfillConflict();
  }
  return toAdminSubmission(record);
}

interface AdminSubmissionQueryRow {
  id: string;
  player_id: string;
  display_name: string;
  game_key: GameKey;
  game_date: string;
  external_puzzle_key: string;
  final_score: number;
  parser_version: string;
  source_kind: string;
  submitted_at: string;
  updated_at: string;
  round_id: string | null;
  round_number: number | null;
  prompt: string | null;
  answer: string | null;
  raw_score: number | null;
  original_emoji: string | null;
}

interface AdminAuditQueryRow {
  id: string;
  admin_identity: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  created_at: string;
}

function groupSubmissionRows(rows: AdminSubmissionQueryRow[]): AdminSubmission[] {
  const grouped = new Map<string, AdminSubmission>();
  for (const row of rows) {
    const existing = grouped.get(row.id);
    if (existing) {
      if (row.round_id !== null) existing.rounds.push(roundFromRow(row));
      continue;
    }
    grouped.set(row.id, {
      id: row.id,
      player_id: row.player_id,
      display_name: row.display_name,
      game_key: row.game_key,
      game_date: row.game_date,
      external_puzzle_key: row.external_puzzle_key,
      final_score: row.final_score,
      parser_version: row.parser_version,
      source_kind: row.source_kind,
      submitted_at: row.submitted_at,
      updated_at: row.updated_at,
      rounds: row.round_id === null ? [] : [roundFromRow(row)],
    });
  }
  return [...grouped.values()];
}

function roundFromRow(row: AdminSubmissionQueryRow): AdminRound {
  const round: AdminRound = {
    id: row.round_id!,
    round_number: row.round_number!,
    raw_score: row.raw_score!,
    original_emoji: row.original_emoji,
  };
  if (row.game_key === "krillion") round.prompt = row.prompt;
  return round;
}

function storedRoundFromRow(row: AdminSubmissionQueryRow): StoredRound {
  return {
    ...roundFromRow(row),
    prompt: row.prompt,
    answer: row.answer,
  };
}

async function findSubmission(env: AppEnv, id: string): Promise<SubmissionRecord | null> {
  const row = await env.DB.prepare(
    `SELECT s.id, s.player_id, p.display_name, s.game_id, s.game_day_id,
            g.key AS game_key, d.game_date, d.external_puzzle_key, s.final_score,
            s.parser_version, s.source_kind, s.submitted_at, s.updated_at
     FROM submissions s JOIN players p ON p.id = s.player_id
     JOIN games g ON g.id = s.game_id
     JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
     WHERE s.id = ?`,
  )
    .bind(id)
    .first<Omit<SubmissionRecord, "rounds">>();
  if (!row) return null;
  const { results } = await env.DB.prepare(
    `SELECT id AS round_id, round_number, prompt, answer, raw_score, original_emoji
     FROM round_results WHERE submission_id = ? ORDER BY round_number`,
  )
    .bind(id)
    .all<AdminSubmissionQueryRow>();
  return { ...row, rounds: results.map(storedRoundFromRow) };
}

async function findGame(env: AppEnv, key: GameKey): Promise<GameConfig> {
  if (key !== "krillion" && key !== "maptap") throw invalidResult();
  const game = await env.DB.prepare(
    "SELECT id, key, round_count, config_json FROM games WHERE id = ? AND active = 1",
  )
    .bind(key)
    .first<GameConfig>();
  if (!game) throw new ApiError(404, "GAME_NOT_FOUND", "The selected game does not exist.");
  try {
    JSON.parse(game.config_json) as GameConfigJson;
  } catch {
    throw new ApiError(500, "GAME_CONFIG_INVALID", "The selected game configuration is invalid.");
  }
  return game;
}

function validateResult(
  game: GameConfig,
  finalScore: number,
  inputRounds: AdminRoundInput[],
  existingRounds?: StoredRound[],
): StoredRound[] {
  if (!Number.isSafeInteger(finalScore) || finalScore < 0 || finalScore > 1_000)
    throw invalidResult();
  if (!Array.isArray(inputRounds) || inputRounds.length !== game.round_count) throw invalidResult();
  const config = JSON.parse(game.config_json) as GameConfigJson;
  const allowedScores = game.key === "krillion" ? configuredNumbers(config.allowedScores) : null;
  const weights = game.key === "maptap" ? configuredNumbers(config.weights) : null;
  if (game.key === "krillion" && !allowedScores) throw invalidResult();
  if (game.key === "maptap" && (!weights || weights.length !== game.round_count))
    throw invalidResult();
  const rounds = inputRounds.map((input, index) =>
    normalizeRound(input, game.key, index + 1, existingRounds?.[index]),
  );
  if (rounds.some((round, index) => round.round_number !== index + 1)) throw invalidResult();
  if (
    rounds.some(
      (round) =>
        !Number.isSafeInteger(round.raw_score) ||
        round.raw_score < 0 ||
        round.raw_score > 100 ||
        (allowedScores !== null && !allowedScores.includes(round.raw_score)),
    )
  )
    throw invalidResult();
  const calculated = rounds.reduce(
    (sum, round, index) => sum + round.raw_score * (weights?.[index] ?? 1),
    0,
  );
  if (calculated !== finalScore) throw invalidResult();
  return rounds;
}

function configuredNumbers(value: unknown): number[] | null {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => !Number.isSafeInteger(item) || item < 0)
  )
    return null;
  return value as number[];
}

function normalizeRound(
  input: AdminRoundInput,
  game: GameKey,
  expectedNumber: number,
  existing?: StoredRound,
): StoredRound {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw invalidResult();
  const keys = Object.keys(input as object);
  if (
    keys.some(
      (key) => !["round_number", "prompt", "answer", "raw_score", "original_emoji"].includes(key),
    )
  )
    throw invalidResult();
  const round = input as unknown as Record<string, unknown>;
  if (!Number.isSafeInteger(round.round_number) || round.round_number !== expectedNumber)
    throw invalidResult();
  const prompt =
    game === "krillion"
      ? optionalText(round.prompt, "prompt")
      : existing
        ? existing.prompt
        : optionalText(round.prompt, "prompt");
  const answer = existing ? existing.answer : optionalText(round.answer, "answer");
  const originalEmoji = optionalText(round.original_emoji, "original_emoji", 64);
  if (game === "maptap" && (prompt !== null || answer !== null)) throw invalidResult();
  if (game === "krillion" && prompt === null) throw invalidResult();
  return {
    id: typeof round.id === "string" ? round.id : "",
    round_number: expectedNumber,
    prompt,
    answer,
    raw_score: round.raw_score as number,
    original_emoji: originalEmoji,
  };
}

function optionalText(value: unknown, field: string, max = ADMIN_TEXT_MAX_LENGTH): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw invalidResult();
  const text = value.trim().normalize("NFC");
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) {
    throw new ApiError(400, "INVALID_RESULT", `The ${field} field is invalid.`);
  }
  return text;
}

function validatePuzzleKey(value: string): void {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 100)
    throw invalidResult();
}

function validateCalendarDay(value: string): void {
  if (!ISO_DAY.test(value)) throw invalidResult();
  const parsed = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value)
    throw invalidResult();
}

function requireReason(value: unknown): string {
  if (typeof value !== "string") throw invalidReason();
  const reason = value.trim().normalize("NFC");
  if (!reason || reason.length > ADMIN_REASON_MAX_LENGTH || /[\u0000-\u001f\u007f]/.test(reason))
    throw invalidReason();
  return reason;
}

function requireAdminIdentity(value: unknown): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 320) {
    throw new ApiError(
      403,
      "ADMIN_ACCESS_DENIED",
      "Sign in with the authorized administrator account.",
    );
  }
}

function configuredParserVersion(game: GameConfig): string {
  const config = JSON.parse(game.config_json) as GameConfigJson;
  return typeof config.parserVersion === "string"
    ? config.parserVersion
    : PARSER_VERSIONS[game.key];
}

function snapshot(record: SubmissionRecord): Record<string, unknown> {
  return {
    submission: {
      id: record.id,
      player_id: record.player_id,
      game_id: record.game_id,
      game_day_id: record.game_day_id,
      game_key: record.game_key,
      game_date: record.game_date,
      external_puzzle_key: record.external_puzzle_key,
      final_score: record.final_score,
      parser_version: record.parser_version,
      source_kind: record.source_kind,
      submitted_at: record.submitted_at,
      updated_at: record.updated_at,
    },
    rounds: record.rounds.map(({ id, round_number, raw_score, original_emoji }) => ({
      id,
      round_number,
      raw_score,
      original_emoji,
    })),
  };
}

function roundInsert(
  env: AppEnv,
  submissionId: string,
  round: StoredRound,
  updatedAt?: string,
  requireSubmission = false,
) {
  const guard =
    updatedAt === undefined && !requireSubmission
      ? ""
      : updatedAt === undefined
        ? " WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)"
        : " WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND updated_at = ?)";
  const values = [
    round.id || crypto.randomUUID(),
    submissionId,
    round.round_number,
    round.prompt,
    round.answer,
    round.raw_score,
    round.original_emoji,
  ];
  return env.DB.prepare(
    `INSERT INTO round_results(id, submission_id, round_number, prompt, answer, raw_score, original_emoji)
     SELECT ?, ?, ?, ?, ?, ?, ?${guard}`,
  ).bind(...values, ...(updatedAt === undefined ? [submissionId] : [submissionId, updatedAt]));
}

function auditStatement(
  env: AppEnv,
  adminIdentity: string,
  action: string,
  entityType: string,
  entityId: string,
  before: unknown,
  after: unknown,
  reason: string | null,
  timestamp: string,
  guard?: { submissionId: string; updatedAt?: string },
) {
  const guardSql = guard
    ? guard.updatedAt === undefined
      ? " WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)"
      : " WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ? AND updated_at = ?)"
    : "";
  return env.DB.prepare(
    `INSERT INTO admin_audit_log
     (id, admin_identity, action, entity_type, entity_id, before_json, after_json, reason, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?${guardSql}`,
  ).bind(
    crypto.randomUUID(),
    adminIdentity,
    action,
    entityType,
    entityId,
    before === null ? null : JSON.stringify(before),
    after === null ? null : JSON.stringify(after),
    reason,
    timestamp,
    ...(guard?.updatedAt === undefined
      ? guard
        ? [guard.submissionId]
        : []
      : [guard.submissionId, guard.updatedAt]),
  );
}

function canonicalSubmissionAuditStatement(
  env: AppEnv,
  adminIdentity: string,
  action: string,
  entityType: string,
  entityId: string,
  after: unknown,
  reason: string,
  timestamp: string,
  submissionId: string,
) {
  return env.DB.prepare(
    `INSERT INTO admin_audit_log
     (id, admin_identity, action, entity_type, entity_id, before_json, after_json, reason, created_at)
     SELECT ?, ?, ?, ?, ?, NULL,
       (SELECT json_set(
          ?,
          '$.submission.game_id', s.game_id,
          '$.submission.game_key', g.key,
          '$.submission.game_day_id', s.game_day_id,
          '$.submission.game_date', d.game_date,
          '$.submission.external_puzzle_key', d.external_puzzle_key
        )
        FROM submissions s
        JOIN games g ON g.id = s.game_id
        JOIN game_days d ON d.id = s.game_day_id AND d.game_id = s.game_id
        WHERE s.id = ?),
       ?, ?
     WHERE EXISTS (SELECT 1 FROM submissions WHERE id = ?)`,
  ).bind(
    crypto.randomUUID(),
    adminIdentity,
    action,
    entityType,
    entityId,
    JSON.stringify(after),
    submissionId,
    reason,
    timestamp,
    submissionId,
  );
}

function toAdminSubmission(record: SubmissionRecord): AdminSubmission {
  return {
    id: record.id,
    player_id: record.player_id,
    display_name: record.display_name,
    game_key: record.game_key,
    game_date: record.game_date,
    external_puzzle_key: record.external_puzzle_key,
    final_score: record.final_score,
    parser_version: record.parser_version,
    source_kind: record.source_kind,
    submitted_at: record.submitted_at,
    updated_at: record.updated_at,
    rounds: record.rounds.map(({ id, round_number, raw_score, original_emoji, prompt }) => ({
      id,
      round_number,
      raw_score,
      original_emoji,
      ...(record.game_key === "krillion" ? { prompt } : {}),
    })),
  };
}

function parseJson(value: string | null): unknown | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function nextUpdatedAt(previous: string): string {
  const previousMs = Date.parse(previous);
  const nowMs = Date.now();
  return new Date(
    Math.max(nowMs, Number.isFinite(previousMs) ? previousMs + 1 : nowMs),
  ).toISOString();
}

function adminGameDayId(gameId: string, gameDate: string): string {
  return `admin-${gameId}-${gameDate}`;
}

function invalidReason(): ApiError {
  return new ApiError(
    400,
    "INVALID_REASON",
    "Provide a non-empty reason no longer than 500 characters.",
  );
}

function invalidResult(): ApiError {
  return new ApiError(
    422,
    "INVALID_RESULT",
    "The rounds and total do not match the selected game configuration.",
  );
}

function submissionNotFound(): ApiError {
  return new ApiError(404, "SUBMISSION_NOT_FOUND", "The selected submission does not exist.");
}

function submissionExists(): ApiError {
  return new ApiError(
    409,
    "SUBMISSION_EXISTS",
    "This player already has a result for that game day.",
  );
}

function submissionConflict(): ApiError {
  return new ApiError(
    409,
    "SUBMISSION_CONFLICT",
    "This submission changed while it was being edited. Reload and try again.",
  );
}

function gameDayConflict(): ApiError {
  return new ApiError(
    409,
    "GAME_DAY_CONFLICT",
    "That game date and puzzle key identify different game days.",
  );
}

function backfillConflict(): ApiError {
  return new ApiError(
    409,
    "BACKFILL_CONFLICT",
    "The historical result could not be saved because the game day changed. Reload and try again.",
  );
}
