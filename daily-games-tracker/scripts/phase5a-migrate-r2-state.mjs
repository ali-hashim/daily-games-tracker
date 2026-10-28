import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createR2PrivateStore } from "./phase5a-r2-private-store.mjs";

export const MIGRATED_AMBIGUITY_OBJECT_KEY = "signing/migrated-ambiguity.json";
const MAX_MIGRATED_RECORD_BYTES = 1024 * 1024;
const GENERIC_FAILURE = "Private signing state migration failed closed";
const ALLOWED_RECORD_FIELDS = new Set([
  "schemaVersion",
  "status",
  "logicalSourceIdentity",
  "wireSha256",
  "targetOriginSha256",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateRecord(record) {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record) ||
    Object.keys(record).some((key) => !ALLOWED_RECORD_FIELDS.has(key)) ||
    record.schemaVersion !== 1 ||
    record.status !== "ambiguous" ||
    typeof record.logicalSourceIdentity !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.logicalSourceIdentity) ||
    typeof record.wireSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(record.wireSha256) ||
    (record.targetOriginSha256 !== undefined &&
      (typeof record.targetOriginSha256 !== "string" ||
        !/^[0-9a-f]{64}$/.test(record.targetOriginSha256)))
  ) {
    throw new Error(GENERIC_FAILURE);
  }
  return record;
}

function assertManualMigrationContext(env) {
  if (
    env.WHT_CONFIRM_MIGRATION !== "true" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    !/^[0-9a-f]{40}$/.test(env.GITHUB_SHA || "") ||
    env.GITHUB_RUN_ATTEMPT !== "1"
  ) {
    throw new Error(GENERIC_FAILURE);
  }
}

function getDecoderPath(env) {
  const runnerTemp = resolve(env.RUNNER_TEMP || process.cwd());
  const decoderPath = resolve(env.WHT_LEGACY_DECODER_PATH || "");
  const relativePath = relative(runnerTemp, decoderPath);
  if (!env.WHT_LEGACY_DECODER_PATH || relativePath.startsWith("..") || isAbsolute(relativePath)) {
    throw new Error(GENERIC_FAILURE);
  }
  return decoderPath;
}

async function loadLegacyDecoder(env, suppliedDecoder) {
  if (suppliedDecoder) return suppliedDecoder;
  return import(pathToFileURL(getDecoderPath(env)).href);
}

function decodeEnvelope(encoded, decoder, outputKey) {
  if (
    typeof encoded !== "string" ||
    !encoded.trim() ||
    typeof outputKey !== "string" ||
    !outputKey.trim()
  ) {
    throw new Error(GENERIC_FAILURE);
  }
  const normalized = encoded.trim();
  const encodedBytes = Buffer.from(normalized, "base64");
  if (
    !encodedBytes.length ||
    encodedBytes.length > MAX_MIGRATED_RECORD_BYTES ||
    encodedBytes.toString("base64") !== normalized
  ) {
    throw new Error(GENERIC_FAILURE);
  }
  const envelopeText = encodedBytes.toString("utf8");
  if (!Buffer.from(envelopeText, "utf8").equals(encodedBytes)) throw new Error(GENERIC_FAILURE);
  const envelope = JSON.parse(envelopeText);
  const decoded = validateRecord(decoder.decodeMigratedAmbiguityRecord(encoded, outputKey));
  const plaintext = decoder.decryptPrivateEnvelope(envelope, outputKey);
  if (
    !Buffer.isBuffer(plaintext) ||
    plaintext.length === 0 ||
    plaintext.length > MAX_MIGRATED_RECORD_BYTES ||
    !Buffer.from(plaintext.toString("utf8"), "utf8").equals(plaintext)
  ) {
    throw new Error(GENERIC_FAILURE);
  }
  const record = validateRecord(JSON.parse(plaintext.toString("utf8")));
  if (!isDeepStrictEqual(record, decoded)) throw new Error(GENERIC_FAILURE);
  return { bytes: plaintext, digest: sha256(plaintext) };
}

export async function migrateAmbiguityState({ env = process.env, store, legacyDecoder } = {}) {
  try {
    assertManualMigrationContext(env);
    const decoder = await loadLegacyDecoder(env, legacyDecoder);
    if (
      typeof decoder.decodeMigratedAmbiguityRecord !== "function" ||
      typeof decoder.decryptPrivateEnvelope !== "function"
    ) {
      throw new Error(GENERIC_FAILURE);
    }
    const { bytes, digest } = decodeEnvelope(
      env.WHT_AMBIGUOUS_SIGNING_RECORD,
      decoder,
      env.WHT_SIGNING_OUTPUT_KEY,
    );
    if (!store) store = createR2PrivateStore();
    if (typeof store.getOptional !== "function" || typeof store.putVerified !== "function") {
      throw new Error(GENERIC_FAILURE);
    }

    const existing = await store.getOptional(MIGRATED_AMBIGUITY_OBJECT_KEY);
    if (existing !== null) {
      if (!Buffer.isBuffer(existing) || !existing.equals(bytes)) throw new Error(GENERIC_FAILURE);
      return { sha256: digest, alreadyPresent: true };
    }

    const confirmedDigest = await store.putVerified(
      MIGRATED_AMBIGUITY_OBJECT_KEY,
      bytes,
      "application/json",
    );
    if (confirmedDigest !== digest) throw new Error(GENERIC_FAILURE);
    return { sha256: digest, alreadyPresent: false };
  } catch {
    throw new Error(GENERIC_FAILURE);
  }
}

async function main() {
  await migrateAmbiguityState();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    process.stderr.write(`${GENERIC_FAILURE}.\n`);
    process.exitCode = 1;
  });
}
