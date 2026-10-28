/*
 * GitHub Actions-only protected signing state machine.
 *
 * The runner stores a private R2 intent before the provider request, sends
 * exactly one fixed HubSign request, and stores result metadata and delivery
 * bytes in the private bucket.
 * GitHub commit status is the durable lease: pending means permanently
 * ambiguous and blocks every later attempt for the same logical operation.
 * A digest-bound private migrated record blocks the prior ambiguous logical
 * package for automatic and legacy-recovery runs. A separately confirmed
 * manual re-sign request gets a distinct actor/run-bound lease while leaving
 * the migrated record unchanged. The legacy recovery path still permanently
 * blocks its exact old wire; a record without a target hash otherwise requires
 * exact current-run authorization or successful prior-run proof for a
 * different target. A populated target hash scopes that block to the target.
 * Current-target status and protected first-attempt recovery checks remain
 * mandatory, and the status lease blocks reruns.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createR2PrivateStore } from './phase5a-r2-private-store.mjs';

export const HUBSIGN_ENDPOINT = 'https://hubsign.routinehub.services/sign';
export const MAX_SIGNED_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_BODY_EVIDENCE_BYTES = 8 * 1024 * 1024;
const STATUS_PREFIX = 'wht-shortcut-signing/';
const KEY_PREFIX = 'wht-shortcut-signing-v3\n';
const RESIGN_KEY_PREFIX = 'wht-shortcut-manual-resign-v1\n';
const RESIGN_STATUS_PREFIX = 'wht-shortcut-resign/';
const RESIGN_SEND_STATUS_PREFIX = 'wht-shortcut-resign-send/';
export const MANUAL_RESIGN_REASON_CODES = Object.freeze([
  'delivery-verification-failed',
  'prior-signature-unavailable',
  'previous-outcome-ambiguous',
  'post-delivery-integrity-check-failed',
]);
const MANUAL_RESIGN_REASON_CODE_SET = new Set(MANUAL_RESIGN_REASON_CODES);
export const MIGRATED_AMBIGUITY_OBJECT_KEY = 'signing/migrated-ambiguity.json';
export const LATEST_MANIFEST_OBJECT_KEY = 'latest.json';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const STATUS_PAGE_SIZE = 100;
const STATUS_STATES = new Set(['error', 'failure', 'pending', 'success']);

function assertHex(value, length, label) {
  if (typeof value !== 'string' || !new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`invalid ${label}`);
  }
  return value;
}

function assertCommit(value) {
  return assertHex(value, 40, 'source commit');
}

function validateManualResignRequestId(value) {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new Error('manual re-sign request ID must be a lowercase UUIDv4');
  }
  return value;
}

export function manualResignAuthorizationFromEnvironment(environment, sourceCommit) {
  if (environment.WHT_MANUAL_RESIGN_REQUESTED !== 'true') return null;
  if (environment.WHT_AMBIGUOUS_RECOVERY_REQUESTED === 'true') {
    throw new Error('manual re-sign cannot be combined with migrated ambiguity recovery');
  }
  if (environment.GITHUB_EVENT_NAME !== 'workflow_dispatch') {
    throw new Error('manual re-sign authorization requires workflow_dispatch');
  }
  if (environment.GITHUB_RUN_ATTEMPT !== '1') {
    throw new Error('manual re-sign authorization cannot be rerun');
  }
  const requestedCommit = assertCommit(environment.WHT_MANUAL_RESIGN_SOURCE_COMMIT);
  const workflowCommit = assertCommit(environment.GITHUB_SHA);
  if (requestedCommit !== workflowCommit || requestedCommit !== assertCommit(sourceCommit)) {
    throw new Error('manual re-sign source commit does not match the protected workflow commit');
  }
  const requestId = validateManualResignRequestId(environment.WHT_MANUAL_RESIGN_REQUEST_ID);
  if (environment.WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED !== 'true') {
    throw new Error('manual re-sign requires confirmation that an earlier request may have completed');
  }
  const reason = environment.WHT_MANUAL_RESIGN_REASON;
  if (typeof reason !== 'string' || !MANUAL_RESIGN_REASON_CODE_SET.has(reason)) {
    throw new Error('manual re-sign reason must match a reviewed workflow choice');
  }
  const actor = environment.GITHUB_ACTOR;
  if (typeof actor !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(actor)) {
    throw new Error('manual re-sign actor context is invalid');
  }
  const runId = environment.GITHUB_RUN_ID;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
    throw new Error('manual re-sign workflow run context is missing');
  }
  return {
    requestIdSha256: sha256(Buffer.from(requestId, 'utf8')),
    sourceCommit: requestedCommit,
    reason,
    actor,
    runId,
    runAttempt: 1,
  };
}

function assertManualResignAuthorization(authorization, sourceCommit) {
  const current = manualResignAuthorizationFromEnvironment(process.env, sourceCommit);
  if (current === null) {
    if (authorization !== undefined && authorization !== null) throw new Error('manual re-sign authorization is not active');
    return null;
  }
  const fields = ['requestIdSha256', 'sourceCommit', 'reason', 'actor', 'runId', 'runAttempt'];
  if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization)
    || Object.keys(authorization).length !== fields.length
    || fields.some(field => !Object.hasOwn(authorization, field) || authorization[field] !== current[field])
    || assertCommit(authorization.sourceCommit) !== sourceCommit
    || assertHex(authorization.requestIdSha256, 64, 'manual re-sign request ID SHA-256') !== current.requestIdSha256) {
    throw new Error('manual re-sign authorization does not match this actor, run, or source commit');
  }
  return current;
}

function authorizedPackageMetadata(metadata, authorization) {
  const logicalOperationKey = metadata.key;
  return {
    ...metadata,
    logicalOperationKey,
    key: authorization
      ? manualResignKeyFromHash(logicalOperationKey, authorization.requestIdSha256)
      : logicalOperationKey,
  };
}

function assertActionPin(value, label) {
  if (!value || typeof value !== 'object'
    || typeof value.repository !== 'string' || !value.repository
    || typeof value.version !== 'string' || !value.version
    || !/^[0-9a-f]{40}$/.test(value.commit)) {
    throw new Error(`invalid ${label} pin`);
  }
  return { repository: value.repository, version: value.version, commit: value.commit };
}

export function semanticToolchainProjection(buildManifest) {
  if (!buildManifest || typeof buildManifest !== 'object') throw new Error('build provenance is missing');
  const sourceSha256 = assertHex(buildManifest.sourceSha256, 64, 'source SHA-256');
  const captureSha256 = assertHex(buildManifest.captureSha256, 64, 'capture SHA-256');
  const nativeContractSha256 = assertHex(buildManifest.nativeContractSha256, 64, 'native contract SHA-256');
  const semantic = buildManifest.toolchainSemantic;
  if (!semantic || semantic.schemaVersion !== 1 || typeof semantic !== 'object') {
    throw new Error('semantic toolchain projection is missing');
  }
  const compiler = semantic.compiler;
  if (!compiler || compiler.name !== 'Cherri' || typeof compiler.version !== 'string' || !compiler.version) {
    throw new Error('invalid Cherri toolchain pin');
  }
  const compilerCommit = assertCommit(compiler.commit);
  const goVersion = semantic.go?.version;
  if (typeof goVersion !== 'string' || !/^1\.\d+\.\d+$/.test(goVersion)) {
    throw new Error('invalid Go toolchain version');
  }
  if (typeof semantic.runner !== 'string' || !semantic.runner) throw new Error('invalid CI runner pin');
  if (!Array.isArray(semantic.flags) || semantic.flags.length === 0
    || semantic.flags.some(value => typeof value !== 'string' || !value.startsWith('--'))
    || new Set(semantic.flags).size !== semantic.flags.length) {
    throw new Error('invalid compiler flags');
  }
  if (buildManifest.compilerCommit !== compilerCommit || buildManifest.goVersion !== goVersion
    || !Array.isArray(buildManifest.flags)
    || JSON.stringify(buildManifest.flags) !== JSON.stringify(semantic.flags)) {
    throw new Error('semantic toolchain projection conflicts with build provenance');
  }
  const actions = semantic.actions;
  if (!actions || typeof actions !== 'object') throw new Error('semantic Actions pins are missing');
  const projection = {
    schemaVersion: 1,
    sourceSha256,
    captureSha256,
    nativeContractSha256,
    compiler: {
      name: compiler.name,
      version: compiler.version,
      commit: compilerCommit,
    },
    go: { version: goVersion },
    runner: semantic.runner,
    flags: [...semantic.flags],
    actions: {
      checkout: assertActionPin(actions.checkout, 'checkout'),
      setupGo: assertActionPin(actions.setupGo, 'setup-go'),
      uploadArtifact: assertActionPin(actions.uploadArtifact, 'upload-artifact'),
    },
  };
  return projection;
}

export function logicalSourceIdentity(buildManifest) {
  return sha256(JSON.stringify(semanticToolchainProjection(buildManifest)));
}

export function operationKey(sourceIdentity, targetOriginSha256) {
  assertHex(sourceIdentity, 64, 'logical source identity');
  assertHex(targetOriginSha256, 64, 'target origin SHA-256');
  return sha256(`${KEY_PREFIX}${sourceIdentity}\n${targetOriginSha256}`);
}

export function statusContext(key) {
  assertHex(key, 64, 'operation key');
  return `${STATUS_PREFIX}${key}`;
}

export function manualResignOperationKey(logicalOperationKey, requestId) {
  assertHex(logicalOperationKey, 64, 'logical operation key');
  const id = validateManualResignRequestId(requestId);
  return manualResignKeyFromHash(logicalOperationKey, sha256(Buffer.from(id, 'utf8')));
}

function manualResignKeyFromHash(logicalOperationKey, requestIdSha256) {
  assertHex(logicalOperationKey, 64, 'logical operation key');
  assertHex(requestIdSha256, 64, 'manual re-sign request ID SHA-256');
  return sha256(`${RESIGN_KEY_PREFIX}${logicalOperationKey}\n${requestIdSha256}`);
}

export function manualResignStatusContext(requestIdSha256) {
  return `${RESIGN_STATUS_PREFIX}${assertHex(requestIdSha256, 64, 'manual re-sign request ID SHA-256')}`;
}

export function manualResignSendStatusContext(requestIdSha256) {
  return `${RESIGN_SEND_STATUS_PREFIX}${assertHex(requestIdSha256, 64, 'manual re-sign request ID SHA-256')}`;
}

export function statusBlocks(statuses, context) {
  return Array.isArray(statuses) && statuses.some(value => value?.context === context);
}

export function intentObjectKey(key) {
  assertHex(key, 64, 'operation key');
  return `signing/intents/${key}.json`;
}

export function providerOutcomeObjectKey(key) {
  assertHex(key, 64, 'operation key');
  return `signing/outcomes/${key}.json`;
}

export function resultMetadataObjectKey(key) {
  assertHex(key, 64, 'operation key');
  return `signing/results/${key}.json`;
}

export function signedShortcutObjectKey(sourceCommit, signedSha256) {
  assertCommit(sourceCommit);
  assertHex(signedSha256, 64, 'signed Shortcut SHA-256');
  return `shortcuts/${sourceCommit}/${signedSha256}.shortcut`;
}

export function validateSignedShortcut(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 4 || bytes.length > MAX_SIGNED_BYTES) {
    throw new Error('signed response is outside the allowed size');
  }
  if (!bytes.subarray(0, 4).equals(Buffer.from('AEA1'))) {
    throw new Error('signed response is missing the AEA1 container');
  }
  return { valid: true };
}

export function hubSignRequestOptions(wire, compilerVersion = 'v2.3.0') {
  if (!Buffer.isBuffer(wire) || wire.length === 0) throw new Error('HubSign wire must be non-empty bytes');
  if (typeof compilerVersion !== 'string' || !/^v\d+\.\d+\.\d+$/.test(compilerVersion)) {
    throw new Error('Cherri compiler version is invalid');
  }
  return {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'content-type': 'application/json',
      'content-length': String(wire.length),
      'user-agent': `cherri/${compilerVersion}`,
    },
    body: wire,
  };
}

export function hubSignResponseAccepted(status, contentType) {
  const accepted = new Set(['application/octet-stream', 'application/x-plist', 'application/x-apple-shortcut']);
  return status === 200 && typeof contentType === 'string'
    && accepted.has(contentType.split(';', 1)[0].trim().toLowerCase());
}

export function migratedRecordBlocks(record, sourceIdentity, targetOriginSha256, wireSha256) {
  if (!record || record.schemaVersion !== 1 || record.status !== 'ambiguous') return false;
  if (record.wireSha256 === wireSha256) return true;
  if (record.logicalSourceIdentity !== sourceIdentity) return false;
  return !record.targetOriginSha256 || record.targetOriginSha256 === targetOriginSha256;
}

function migratedRecordMatchesLogicalPackage(record, sourceIdentity, targetOriginSha256) {
  return record?.schemaVersion === 1
    && record.status === 'ambiguous'
    && record.logicalSourceIdentity === sourceIdentity
    && (!record.targetOriginSha256 || record.targetOriginSha256 === targetOriginSha256);
}

function validateMigratedRecord(record) {
  const allowed = new Set(['schemaVersion', 'status', 'logicalSourceIdentity', 'wireSha256', 'targetOriginSha256']);
  if (!record || typeof record !== 'object' || Array.isArray(record)
    || Object.keys(record).some(key => !allowed.has(key))
    || record.schemaVersion !== 1 || record.status !== 'ambiguous') {
    throw new Error('migrated ambiguous signing record is invalid');
  }
  assertHex(record.logicalSourceIdentity, 64, 'migrated logical source identity');
  assertHex(record.wireSha256, 64, 'migrated wire SHA-256');
  if (record.targetOriginSha256 !== undefined) assertHex(record.targetOriginSha256, 64, 'migrated target origin SHA-256');
  return record;
}

function validateRuntimeOrigin(value) {
  if (typeof value !== 'string' || value !== value.trim() || value.endsWith('/')) {
    throw new Error('protected runtime origin is invalid');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('protected runtime origin is invalid');
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (parsed.protocol !== 'https:' || !parsed.hostname || parsed.username || parsed.password
    || !['', '/'].includes(parsed.pathname) || parsed.search || parsed.hash
    || host === 'localhost' || host.endsWith('.invalid') || host.endsWith('.example') || host.endsWith('.test')) {
    throw new Error('protected runtime origin is invalid');
  }
  return value;
}

function outputPath(name) {
  if (!name) throw new Error('private output path is invalid');
  const root = resolve(process.env.RUNNER_TEMP || process.cwd());
  const target = resolve(name);
  const relativeTarget = relative(root, target);
  if (relativeTarget.startsWith('..') || isAbsolute(relativeTarget)) {
    throw new Error('private output path is invalid');
  }
  return target;
}

function privateStore(args) {
  return args.r2Store || createR2PrivateStore();
}

async function readMigratedAmbiguityRecord(store) {
  const expectedSha256 = process.env.WHT_AMBIGUITY_RECORD_SHA256;
  if (typeof expectedSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(expectedSha256)) {
    throw new Error('migrated ambiguous signing record is not configured');
  }
  let bytes;
  try {
    bytes = await store.get(MIGRATED_AMBIGUITY_OBJECT_KEY);
  } catch {
    throw new Error('migrated ambiguous signing record is unavailable');
  }
  if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024) {
    throw new Error('migrated ambiguous signing record is invalid');
  }
  if (sha256(bytes) !== expectedSha256) {
    throw new Error('migrated ambiguous signing record digest mismatch');
  }
  try {
    return validateMigratedRecord(JSON.parse(bytes.toString('utf8')));
  } catch {
    throw new Error('migrated ambiguous signing record is invalid');
  }
}

async function readPrivateJson(store, key, label) {
  let bytes;
  try {
    bytes = await store.get(key);
  } catch {
    throw new Error(`${label} is unavailable`);
  }
  if (!Buffer.isBuffer(bytes) || bytes.length > 1024 * 1024) throw new Error(`${label} is invalid`);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`${label} is invalid`);
  }
}

async function writePrivateJson(store, key, value, label) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  try {
    const digest = await store.putVerified(key, bytes, 'application/json');
    if (digest !== sha256(bytes)) throw new Error('digest mismatch');
  } catch {
    throw new Error(`${label} could not be confirmed in private storage`);
  }
}

function decodeRecoveryAuthorization(encoded) {
  if (typeof encoded !== 'string' || !encoded.trim()) {
    throw new Error('recovery authorization is invalid');
  }
  let authorization;
  try {
    const normalized = encoded.trim();
    const bytes = Buffer.from(normalized, 'base64');
    if (!bytes.length || bytes.toString('base64') !== normalized) throw new Error('invalid authorization encoding');
    authorization = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('recovery authorization is invalid');
  }
  const expectedKeys = new Set([
    'schemaVersion', 'runId', 'runAttempt', 'sourceCommit',
    'logicalSourceIdentity', 'targetOriginSha256', 'operationKey', 'migratedWireSha256',
  ]);
  if (!authorization || typeof authorization !== 'object'
    || Object.keys(authorization).some(key => !expectedKeys.has(key))
    || authorization.schemaVersion !== 1
    || typeof authorization.runId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(authorization.runId)
    || !Number.isInteger(authorization.runAttempt) || authorization.runAttempt < 1
  ) {
    throw new Error('recovery authorization is invalid');
  }
  assertCommit(authorization.sourceCommit);
  assertHex(authorization.logicalSourceIdentity, 64, 'recovery logical source identity');
  assertHex(authorization.targetOriginSha256, 64, 'recovery target origin SHA-256');
  assertHex(authorization.operationKey, 64, 'recovery operation key');
  assertHex(authorization.migratedWireSha256, 64, 'recovery migrated wire SHA-256');
  return authorization;
}

function recoveryAuthorizationMatches(authorization, record, metadata, sourceCommit) {
  return authorization.runAttempt === 1
    && process.env.GITHUB_RUN_ID === authorization.runId
    && process.env.GITHUB_RUN_ATTEMPT === '1'
    && authorization.sourceCommit === sourceCommit
    && authorization.logicalSourceIdentity === record.logicalSourceIdentity
    && authorization.logicalSourceIdentity === metadata.sourceIdentity
    && authorization.targetOriginSha256 === metadata.targetOriginSha256
    && (!record.targetOriginSha256 || authorization.targetOriginSha256 === record.targetOriginSha256)
    && authorization.operationKey === metadata.key
    && authorization.migratedWireSha256 === record.wireSha256;
}

function historicalRecoveryAuthorizationMatches(authorization, record, metadata) {
  return authorization.runAttempt === 1
    && process.env.GITHUB_RUN_ATTEMPT === '1'
    && authorization.runId !== process.env.GITHUB_RUN_ID
    && authorization.logicalSourceIdentity === record.logicalSourceIdentity
    && authorization.logicalSourceIdentity === metadata.sourceIdentity
    && authorization.migratedWireSha256 === record.wireSha256
    && record.wireSha256 !== metadata.wireSha
    && authorization.targetOriginSha256 !== metadata.targetOriginSha256
    && (!record.targetOriginSha256 || authorization.targetOriginSha256 === record.targetOriginSha256)
    && authorization.operationKey === operationKey(authorization.logicalSourceIdentity, authorization.targetOriginSha256);
}

function githubRepository() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GitHub repository context is missing');
  return repository;
}

function statusSha() {
  return assertCommit(process.env.WHT_SIGNING_STATUS_ANCHOR || process.env.GITHUB_SHA);
}

async function githubApi(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error('GitHub token is not configured');
  const base = process.env.GITHUB_API_URL || 'https://api.github.com';
  const response = await fetch(`${base}${path}`, {
    method,
    redirect: 'error',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'wht-actions-signing/1',
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => {
    throw new Error('GitHub private state request failed');
  });
  if (!response.ok) throw new Error('GitHub private state request failed');
  try {
    return await response.json();
  } catch {
    throw new Error('GitHub private state response was invalid');
  }
}

function validateCombinedStatusPage(payload, anchor, page) {
  if (!payload || typeof payload !== 'object' || payload.sha !== anchor
    || !Number.isInteger(payload.total_count) || payload.total_count < 0
    || !Array.isArray(payload.statuses) || payload.statuses.length > STATUS_PAGE_SIZE
    || !STATUS_STATES.has(payload.state)
    || (payload.statuses.length === 0 && payload.state !== 'pending')) {
    throw new Error(`GitHub status page ${page} is malformed or anchored incorrectly`);
  }
  for (const status of payload.statuses) {
    if (!status || typeof status !== 'object' || typeof status.context !== 'string' || !status.context
      || !Number.isInteger(status.id) || status.id <= 0 || !STATUS_STATES.has(status.state)) {
      throw new Error(`GitHub status page ${page} contains a malformed status`);
    }
  }
  return payload;
}

export async function readStatusLedger() {
  const repository = githubRepository();
  const anchor = statusSha();
  const values = [];
  const seenContexts = new Set();
  const seenIds = new Set();
  let totalCount;
  for (let page = 1; ; page += 1) {
    const payload = validateCombinedStatusPage(
      await githubApi('GET', `/repos/${repository}/commits/${anchor}/status?per_page=${STATUS_PAGE_SIZE}&page=${page}`),
      anchor,
      page,
    );
    if (totalCount === undefined) totalCount = payload.total_count;
    if (payload.total_count !== totalCount) throw new Error('GitHub status ledger count changed while reading');
    for (const status of payload.statuses) {
      if (seenContexts.has(status.context)) throw new Error('GitHub status ledger contains a duplicate context');
      if (seenIds.has(status.id)) throw new Error('GitHub status ledger contains a duplicate status id');
      seenContexts.add(status.context);
      seenIds.add(status.id);
    }
    values.push(...payload.statuses);
    if (values.length > totalCount) throw new Error('GitHub status ledger exceeded its declared count');
    if (values.length === totalCount) return values;
    if (payload.statuses.length < STATUS_PAGE_SIZE) {
      throw new Error('GitHub status ledger is truncated');
    }
    const maxPages = Math.max(1, Math.ceil(totalCount / STATUS_PAGE_SIZE) + 1);
    if (page >= maxPages) throw new Error('GitHub status ledger pagination did not terminate');
  }
}

export async function currentStatus(context) {
  const values = await readStatusLedger();
  return statusBlocks(values, context) ? values.find(value => value.context === context) : undefined;
}

async function createStatus(context, state, description) {
  const repository = githubRepository();
  const response = await githubApi('POST', `/repos/${repository}/statuses/${statusSha()}`, {
    state,
    context,
    description,
  });
  if (!response || typeof response !== 'object' || response.state !== state || response.context !== context) {
    throw new Error('GitHub status write was not acknowledged');
  }
}

async function packageMetadata(packageDirectory, runtimeOrigin, expectedManifestSha, expectedWireSha) {
  const packagePath = resolve(packageDirectory);
  const manifestBytes = await readFile(resolve(packagePath, 'approval-manifest.json'));
  const manifestSha = sha256(manifestBytes);
  if (expectedManifestSha && manifestSha !== expectedManifestSha) throw new Error('frozen manifest digest mismatch');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.signing !== 'not performed' || manifest.transfer !== 'not performed') {
    throw new Error('signing package is not unsigned');
  }
  const wire = await readFile(resolve(packagePath, 'hubsign-request.json'));
  const wireSha = sha256(wire);
  if (expectedWireSha && wireSha !== expectedWireSha) throw new Error('frozen wire digest mismatch');
  const declaredWire = manifest.futureSigningPayload?.jsonWireSha256;
  if (declaredWire !== wireSha) throw new Error('manifest wire digest mismatch');
  const buildManifest = JSON.parse(await readFile(resolve(packagePath, 'provenance/build-manifest.json'), 'utf8'));
  const lockBytes = await readFile(resolve(packagePath, 'provenance/toolchain.lock.json'));
  const lockSha = sha256(lockBytes);
  if (buildManifest.lockSha256 !== lockSha || manifest.toolchain?.lockSha256 !== lockSha) {
    throw new Error('toolchain lock provenance digest mismatch');
  }
  const semanticProjection = semanticToolchainProjection(buildManifest);
  const sourceIdentity = logicalSourceIdentity(buildManifest);
  const origin = validateRuntimeOrigin(runtimeOrigin);
  const targetOriginSha256 = sha256(Buffer.from(origin, 'utf8'));
  const key = operationKey(sourceIdentity, targetOriginSha256);
  return {
    packagePath,
    manifestBytes,
    manifest,
    manifestSha,
    wire,
    wireSha,
    sourceIdentity,
    compilerVersion: semanticProjection.compiler.version,
    targetOriginSha256,
    key,
  };
}

const INTENT_FIELDS = [
  'schemaVersion', 'status', 'operationKey', 'sourceCommit', 'logicalSourceIdentity',
  'compilerVersion', 'statusAnchor', 'runId', 'runAttempt', 'targetOriginSha256',
  'manifestSha256', 'wireSha256',
];
const RESIGN_INTENT_FIELDS = [
  ...INTENT_FIELDS,
  'logicalOperationKey', 'authorizationIdSha256', 'authorizationActor', 'authorizationReason',
];

function intentFields(intent) {
  return intent?.schemaVersion === 2 ? RESIGN_INTENT_FIELDS : INTENT_FIELDS;
}

function resultFields(intent) {
  return [
    ...intentFields(intent).filter(field => field !== 'status'), 'status', 'signedShortcutSha256',
    'signedShortcutLength', 'signedShortcutObjectKey',
  ];
}

function statusContextForIntent(intent) {
  return intent.schemaVersion === 2
    ? manualResignStatusContext(intent.authorizationIdSha256)
    : statusContext(intent.operationKey);
}

function manualResignLeaseDescription() {
  return 'Manual re-sign authorization reserved';
}

function manualResignSendDescription() {
  return 'Manual re-sign provider POST consumed';
}

function hasExactFields(value, fields) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length
    && fields.every(field => Object.hasOwn(value, field));
}

function validateIntent(intent) {
  const isResign = intent?.schemaVersion === 2;
  const fields = isResign ? RESIGN_INTENT_FIELDS : INTENT_FIELDS;
  if (!hasExactFields(intent, fields) || ![1, 2].includes(intent.schemaVersion) || intent.status !== 'pending') {
    throw new Error('private signing intent is invalid');
  }
  assertHex(intent.operationKey, 64, 'operation key');
  assertCommit(intent.sourceCommit);
  assertCommit(intent.statusAnchor);
  if (typeof intent.runId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(intent.runId)
    || !Number.isInteger(intent.runAttempt) || intent.runAttempt < 1) {
    throw new Error('private signing intent run binding is invalid');
  }
  assertHex(intent.logicalSourceIdentity, 64, 'logical source identity');
  assertHex(intent.targetOriginSha256, 64, 'target origin SHA-256');
  assertHex(intent.manifestSha256, 64, 'manifest SHA-256');
  assertHex(intent.wireSha256, 64, 'wire SHA-256');
  if (typeof intent.compilerVersion !== 'string' || !/^v\d+\.\d+\.\d+$/.test(intent.compilerVersion)) {
    throw new Error('private signing intent Cherri version is invalid');
  }
  const logicalOperationKey = operationKey(intent.logicalSourceIdentity, intent.targetOriginSha256);
  if (!isResign && logicalOperationKey !== intent.operationKey) {
    throw new Error('private signing intent key mismatch');
  }
  if (isResign) {
    assertHex(intent.logicalOperationKey, 64, 'logical operation key');
    assertHex(intent.authorizationIdSha256, 64, 'manual re-sign request ID SHA-256');
    if (intent.logicalOperationKey !== logicalOperationKey
      || manualResignKeyFromHash(intent.logicalOperationKey, intent.authorizationIdSha256) !== intent.operationKey
      || typeof intent.authorizationActor !== 'string' || !/^[A-Za-z0-9-]{1,39}$/.test(intent.authorizationActor)
      || typeof intent.authorizationReason !== 'string'
      || !MANUAL_RESIGN_REASON_CODE_SET.has(intent.authorizationReason)) {
      throw new Error('private manual re-sign intent identity is invalid');
    }
  }
  return intent;
}

function assertIntentMatchesPackage(intent, metadata, sourceCommit, manualResign) {
  if (intent.sourceCommit !== assertCommit(sourceCommit)
    || intent.operationKey !== metadata.key
    || intent.logicalSourceIdentity !== metadata.sourceIdentity
    || intent.compilerVersion !== metadata.compilerVersion
    || intent.statusAnchor !== statusSha()
    || intent.targetOriginSha256 !== metadata.targetOriginSha256
    || intent.manifestSha256 !== metadata.manifestSha
    || intent.wireSha256 !== metadata.wireSha) {
    throw new Error('private signing intent does not match the frozen package');
  }
  if (intent.schemaVersion === 2) {
    if (!manualResign
      || intent.logicalOperationKey !== metadata.logicalOperationKey
      || intent.authorizationIdSha256 !== manualResign.requestIdSha256
      || intent.authorizationActor !== manualResign.actor
      || intent.authorizationReason !== manualResign.reason
      || intent.sourceCommit !== manualResign.sourceCommit) {
      throw new Error('private manual re-sign intent does not match this authorization');
    }
  } else if (manualResign) {
    throw new Error('manual re-sign authorization has no matching private intent');
  }
  if (process.env.GITHUB_RUN_ID !== intent.runId
    || process.env.GITHUB_RUN_ATTEMPT !== String(intent.runAttempt)) {
    throw new Error('private signing intent belongs to a different workflow run');
  }
  if (intent.schemaVersion === 2 && (process.env.GITHUB_ACTOR !== intent.authorizationActor
    || intent.runId !== manualResign.runId || intent.runAttempt !== manualResign.runAttempt)) {
    throw new Error('private manual re-sign intent belongs to a different actor or workflow run');
  }
}

async function assertPendingLease(intent) {
  const context = statusContextForIntent(intent);
  const latest = await currentStatus(context);
  if (!latest || latest.state !== 'pending'
    || (intent.schemaVersion === 2 && latest.description !== manualResignLeaseDescription())) {
    throw new Error('pending signing lease is not active');
  }
}

async function readIntent(store, key) {
  return validateIntent(await readPrivateJson(store, intentObjectKey(key), 'private signing intent'));
}

async function persistProviderOutcome(store, intent, fields) {
  const outcome = {
    schemaVersion: 1,
    status: 'ambiguous',
    operationKey: intent.operationKey,
    sourceCommit: intent.sourceCommit,
    logicalSourceIdentity: intent.logicalSourceIdentity,
    statusAnchor: intent.statusAnchor,
    targetOriginSha256: intent.targetOriginSha256,
    manifestSha256: intent.manifestSha256,
    wireSha256: intent.wireSha256,
    ...fields,
  };
  await writePrivateJson(store, providerOutcomeObjectKey(intent.operationKey), outcome, 'provider outcome');
}

async function responseBodyLimited(response, limit) {
  if (!response.body) return { bytes: Buffer.alloc(0), tooLarge: false };
  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return { bytes: Buffer.concat(chunks, length), tooLarge: false };
      const chunk = Buffer.from(value);
      if (length + chunk.length > limit) {
        await reader.cancel().catch(() => {});
        return { bytes: null, tooLarge: true };
      }
      chunks.push(chunk);
      length += chunk.length;
    }
  } catch {
    await reader.cancel().catch(() => {});
    throw new Error('provider response body could not be read');
  }
}

async function responseEvidence(response) {
  const contentType = response.headers.get('content-type');
  try {
    const { bytes, tooLarge } = await responseBodyLimited(response, MAX_PROVIDER_BODY_EVIDENCE_BYTES);
    if (tooLarge) {
      return {
        providerContentType: contentType,
        providerBodyLength: null,
        providerBodySha256: null,
        providerBodyBase64: null,
        providerBodyTooLarge: true,
      };
    }
    return {
      providerContentType: contentType,
      providerBodyLength: bytes.length,
      providerBodySha256: sha256(bytes),
      providerBodyBase64: bytes.toString('base64'),
      providerBodyReadFailure: false,
    };
  } catch {
    return {
      providerContentType: contentType,
      providerBodyLength: null,
      providerBodySha256: null,
      providerBodyBase64: null,
      providerBodyReadFailure: true,
    };
  }
}

async function authorizedMigratedRecord(args, store, metadata, sourceCommit, statuses, existingRecord) {
  const migratedRecord = existingRecord || await readMigratedAmbiguityRecord(store);
  if (!migratedRecordBlocks(migratedRecord, metadata.sourceIdentity, metadata.targetOriginSha256, metadata.wireSha)) {
    return migratedRecord;
  }
  if (migratedRecord.wireSha256 === metadata.wireSha) {
    throw new Error('exact migrated wire is permanently blocked');
  }
  if (args.recoveryRequested !== true) throw new Error('known ambiguous logical package is permanently blocked');
  const authorization = decodeRecoveryAuthorization(args.recoveryAuthorization);
  const currentAuthorizationMatches = recoveryAuthorizationMatches(authorization, migratedRecord, {
    sourceIdentity: metadata.sourceIdentity,
    targetOriginSha256: metadata.targetOriginSha256,
    key: metadata.key,
  }, sourceCommit);
  const historicalAuthorizationMatches = !currentAuthorizationMatches
    && historicalRecoveryAuthorizationMatches(authorization, migratedRecord, metadata);
  if (!currentAuthorizationMatches && !historicalAuthorizationMatches) {
    throw new Error('recovery authorization does not match the protected ambiguous operation');
  }
  if (historicalAuthorizationMatches
    && statuses.find(status => status.context === statusContext(authorization.operationKey))?.state !== 'success') {
    throw new Error('prior ambiguous recovery operation has no successful status');
  }
  return migratedRecord;
}

export async function prepareSigning(args) {
  const sourceCommit = assertCommit(args.sourceCommit);
  const authorization = assertManualResignAuthorization(args.manualResign, sourceCommit);
  const metadata = authorizedPackageMetadata(
    await packageMetadata(args.package, args.runtimeOrigin, args.manifestSha, args.wireSha),
    authorization,
  );
  const store = privateStore(args);
  const statuses = await readStatusLedger();
  if (authorization) {
    const migratedRecord = await readMigratedAmbiguityRecord(store);
    const priorStatusExists = statusBlocks(statuses, statusContext(metadata.logicalOperationKey));
    const migratedRecordMatches = migratedRecordMatchesLogicalPackage(
      migratedRecord,
      metadata.sourceIdentity,
      metadata.targetOriginSha256,
    );
    if (!priorStatusExists && !migratedRecordMatches) {
      throw new Error('manual re-sign requires prior logical-package evidence');
    }
    if (statusBlocks(statuses, manualResignStatusContext(authorization.requestIdSha256))) {
      throw new Error('manual re-sign request ID has already been used');
    }
    if (statusBlocks(statuses, manualResignSendStatusContext(authorization.requestIdSha256))) {
      throw new Error('manual re-sign provider lease has already been consumed');
    }
    // Manual confirmation authorizes a fresh attempt for the same frozen
    // logical package. Require either its original status or the matching
    // legacy ambiguity record as prior evidence. Keep validating the legacy
    // record and its digest, but let this new request ID create a separate
    // lease without modifying that record.
  } else {
    const context = statusContext(metadata.key);
    if (statusBlocks(statuses, context)) throw new Error('existing signing status blocks this operation');
    await authorizedMigratedRecord(args, store, metadata, sourceCommit, statuses);
  }
  const intentKey = intentObjectKey(metadata.key);
  if (await store.getOptional(intentKey)) throw new Error('private signing intent already exists; operation is permanently leased');

  const statusAnchor = statusSha();
  const runId = process.env.GITHUB_RUN_ID;
  if (typeof runId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(runId)) {
    throw new Error('GitHub workflow run context is missing');
  }
  const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
  if (!Number.isInteger(runAttempt) || runAttempt < 1) throw new Error('GitHub workflow attempt context is missing');
  const intent = {
    schemaVersion: authorization ? 2 : 1,
    status: 'pending',
    operationKey: metadata.key,
    sourceCommit,
    logicalSourceIdentity: metadata.sourceIdentity,
    compilerVersion: metadata.compilerVersion,
    statusAnchor,
    runId,
    runAttempt,
    targetOriginSha256: metadata.targetOriginSha256,
    manifestSha256: metadata.manifestSha,
    wireSha256: metadata.wireSha,
    ...(authorization ? {
      logicalOperationKey: metadata.logicalOperationKey,
      authorizationIdSha256: authorization.requestIdSha256,
      authorizationActor: authorization.actor,
      authorizationReason: authorization.reason,
    } : {}),
  };
  await createStatus(
    statusContextForIntent(intent),
    'pending',
    authorization ? manualResignLeaseDescription() : 'Signing attempt reserved; interruption remains ambiguous',
  );
  await writePrivateJson(store, intentKey, intent, 'private signing intent');
  process.stdout.write('private R2 signing intent recorded\n');
}

async function readRecoveryResult(store, key) {
  const intent = await readIntent(store, key);
  const result = await readPrivateJson(store, resultMetadataObjectKey(key), 'private signing result');
  if (!hasExactFields(result, resultFields(intent)) || result.schemaVersion !== intent.schemaVersion || result.status !== 'completed') {
    throw new Error('private signing result is invalid');
  }
  for (const field of intentFields(intent)) {
    if (field === 'status') continue;
    const expected = field === 'status' ? intent.status : intent[field];
    if (result[field] !== expected) throw new Error('private signing result does not match its intent');
  }
  assertHex(result.signedShortcutSha256, 64, 'signed Shortcut SHA-256');
  if (!Number.isInteger(result.signedShortcutLength) || result.signedShortcutLength < 4
    || result.signedShortcutLength > MAX_SIGNED_BYTES
    || result.signedShortcutObjectKey !== signedShortcutObjectKey(intent.sourceCommit, result.signedShortcutSha256)) {
    throw new Error('private signing result is invalid');
  }
  return { intent, result };
}

export async function sendSigning(args) {
  const sourceCommit = assertCommit(args.sourceCommit);
  const authorization = assertManualResignAuthorization(args.manualResign, sourceCommit);
  const metadata = authorizedPackageMetadata(
    await packageMetadata(args.package, args.runtimeOrigin, args.manifestSha, args.wireSha),
    authorization,
  );
  const store = privateStore(args);
  const intent = await readIntent(store, metadata.key);
  assertIntentMatchesPackage(intent, metadata, sourceCommit, authorization);
  await assertPendingLease(intent);
  const migratedRecord = await readMigratedAmbiguityRecord(store);
  // The manual authorization is the only exception to a matching migrated
  // record. Its digest and schema are still required on every step.
  if (!authorization
    && migratedRecordBlocks(migratedRecord, metadata.sourceIdentity, metadata.targetOriginSha256, metadata.wireSha)) {
    const statuses = await readStatusLedger();
    await authorizedMigratedRecord(args, store, metadata, sourceCommit, statuses, migratedRecord);
  }
  if (await store.getOptional(providerOutcomeObjectKey(intent.operationKey))
    || await store.getOptional(resultMetadataObjectKey(intent.operationKey))) {
    throw new Error('provider attempt already has a private result; no retry is permitted');
  }
  const wire = await readFile(resolve(metadata.packagePath, 'hubsign-request.json'));
  if (sha256(wire) !== intent.wireSha256) throw new Error('frozen wire does not match the pending intent');

  if (authorization) {
    const context = manualResignSendStatusContext(intent.authorizationIdSha256);
    const statuses = await readStatusLedger();
    if (statusBlocks(statuses, context)) {
      throw new Error('manual re-sign provider lease has already been consumed');
    }
    await createStatus(context, 'pending', manualResignSendDescription());
    const lease = await currentStatus(context);
    if (!lease || lease.state !== 'pending' || lease.description !== manualResignSendDescription()) {
      throw new Error('manual re-sign provider lease was not confirmed');
    }
  }

  let response;
  try {
    response = await fetch(HUBSIGN_ENDPOINT, {
      ...hubSignRequestOptions(wire, intent.compilerVersion),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    await persistProviderOutcome(store, intent, {
      transportFailure: true,
      providerStatus: null,
      providerContentType: null,
      providerBodyLength: null,
      providerBodySha256: null,
      providerBodyBase64: null,
    });
    throw new Error('HubSign transfer is ambiguous; no retry is permitted');
  }
  if (!hubSignResponseAccepted(response.status, response.headers.get('content-type'))) {
    await persistProviderOutcome(store, intent, {
      transportFailure: false,
      providerStatus: response.status,
      ...(await responseEvidence(response)),
    });
    throw new Error('HubSign response is ambiguous; no retry is permitted');
  }
  let body;
  try {
    body = await responseBodyLimited(response, MAX_SIGNED_BYTES);
  } catch {
    await persistProviderOutcome(store, intent, {
      transportFailure: false,
      providerStatus: response.status,
      providerContentType: response.headers.get('content-type'),
      providerBodyLength: null,
      providerBodySha256: null,
      providerBodyBase64: null,
      providerBodyReadFailure: true,
    });
    throw new Error('HubSign response is ambiguous; no retry is permitted');
  }
  if (body.tooLarge) {
    await persistProviderOutcome(store, intent, {
      transportFailure: false,
      providerStatus: response.status,
      providerContentType: response.headers.get('content-type'),
      providerBodyLength: null,
      providerBodySha256: null,
      providerBodyBase64: null,
      providerBodyTooLarge: true,
    });
    throw new Error('HubSign response is ambiguous; no retry is permitted');
  }
  const signed = body.bytes;
  try {
    validateSignedShortcut(signed);
  } catch {
    await persistProviderOutcome(store, intent, {
      transportFailure: false,
      providerStatus: response.status,
      providerContentType: response.headers.get('content-type'),
      providerBodyLength: signed.length,
      providerBodySha256: sha256(signed),
      providerBodyBase64: signed.length <= MAX_PROVIDER_BODY_EVIDENCE_BYTES ? signed.toString('base64') : null,
      providerBodyTooLarge: signed.length > MAX_PROVIDER_BODY_EVIDENCE_BYTES,
    });
    throw new Error('HubSign response is ambiguous; no retry is permitted');
  }

  const signedSha256 = sha256(signed);
  const signedPath = outputPath(args.signedPath);
  await writeFile(signedPath, signed, { mode: 0o600, flag: 'wx' });
  const result = {
    ...intent,
    status: 'completed',
    signedShortcutSha256: signedSha256,
    signedShortcutLength: signed.length,
    signedShortcutObjectKey: signedShortcutObjectKey(intent.sourceCommit, signedSha256),
  };
  await writePrivateJson(store, resultMetadataObjectKey(intent.operationKey), result, 'private signing result');
  process.stdout.write('HubSign response stored in private R2\n');
}

export async function sendSigningFromCli(args, environment = process.env, r2Store) {
  const sourceCommit = assertCommit(args.sourceCommit);
  const manualResign = manualResignAuthorizationFromEnvironment(environment, sourceCommit);
  return sendSigning({
    package: args.package,
    sourceCommit,
    runtimeOrigin: environment.WHT_RUNTIME_ORIGIN,
    manifestSha: args.manifestSha,
    wireSha: args.wireSha,
    signedPath: args.signedPath,
    recoveryRequested: environment.WHT_AMBIGUOUS_RECOVERY_REQUESTED === 'true',
    recoveryAuthorization: environment.WHT_AMBIGUOUS_RECOVERY_AUTH,
    manualResign,
    ...(r2Store ? { r2Store } : {}),
  });
}

async function verifyLocalAndPrivateResult(args, store, metadata, sourceCommit, manualResign) {
  const intent = await readIntent(store, metadata.key);
  assertIntentMatchesPackage(intent, metadata, sourceCommit, manualResign);
  await assertPendingLease(intent);
  const { result } = await readRecoveryResult(store, metadata.key);
  const signed = await readFile(outputPath(args.signedPath));
  validateSignedShortcut(signed);
  if (signed.length !== result.signedShortcutLength || sha256(signed) !== result.signedShortcutSha256) {
    throw new Error('local signed result does not match private metadata');
  }
  return { intent, result, signed };
}

export async function publishSigning(args) {
  const sourceCommit = assertCommit(args.sourceCommit);
  const authorization = assertManualResignAuthorization(args.manualResign, sourceCommit);
  const metadata = authorizedPackageMetadata(
    await packageMetadata(args.package, args.runtimeOrigin, args.manifestSha, args.wireSha),
    authorization,
  );
  const store = privateStore(args);
  const { intent, result, signed } = await verifyLocalAndPrivateResult(args, store, metadata, sourceCommit, authorization);
  const expectedObjectKey = signedShortcutObjectKey(intent.sourceCommit, result.signedShortcutSha256);
  if (result.signedShortcutObjectKey !== expectedObjectKey) throw new Error('private delivery object key is invalid');
  const objectDigest = await store.putVerified(expectedObjectKey, signed, 'application/octet-stream');
  if (objectDigest !== result.signedShortcutSha256) throw new Error('private delivery object digest mismatch');

  const latest = { commit: intent.sourceCommit, sha256: result.signedShortcutSha256, key: expectedObjectKey };
  await writePrivateJson(store, LATEST_MANIFEST_OBJECT_KEY, latest, 'private latest manifest');
  process.stdout.write('private R2 Shortcut object and latest manifest confirmed\n');
}

export async function completeSigning(args) {
  const sourceCommit = assertCommit(args.sourceCommit);
  const authorization = assertManualResignAuthorization(args.manualResign, sourceCommit);
  const metadata = authorizedPackageMetadata(
    await packageMetadata(args.package, args.runtimeOrigin, args.manifestSha, args.wireSha),
    authorization,
  );
  const store = privateStore(args);
  const { intent, result, signed } = await verifyLocalAndPrivateResult(args, store, metadata, sourceCommit, authorization);
  const expectedObjectKey = signedShortcutObjectKey(intent.sourceCommit, result.signedShortcutSha256);
  if (result.signedShortcutObjectKey !== expectedObjectKey) throw new Error('private delivery object key is invalid');
  const delivered = await store.get(expectedObjectKey);
  validateSignedShortcut(delivered);
  if (!delivered.equals(signed) || sha256(delivered) !== result.signedShortcutSha256) {
    throw new Error('private delivery object does not match the frozen result');
  }
  const expectedLatest = { commit: intent.sourceCommit, sha256: result.signedShortcutSha256, key: expectedObjectKey };
  const latestBytes = await store.get(LATEST_MANIFEST_OBJECT_KEY);
  const expectedLatestBytes = Buffer.from(`${JSON.stringify(expectedLatest)}\n`, 'utf8');
  if (!latestBytes.equals(expectedLatestBytes)) throw new Error('private latest manifest does not match the frozen result');
  const description = intent.schemaVersion === 2
    ? 'Manual re-sign delivery verified'
    : 'Signed Shortcut object and latest manifest verified in private R2';
  await createStatus(statusContextForIntent(intent), 'success', description);
  process.stdout.write('private R2 delivery verified and signing status recorded\n');
}

export async function recoverSigning(args) {
  const key = assertHex(args.operationKey, 64, 'operation key');
  const store = privateStore(args);
  const { result } = await readRecoveryResult(store, key);
  const signed = await store.get(result.signedShortcutObjectKey);
  validateSignedShortcut(signed);
  if (signed.length !== result.signedShortcutLength || sha256(signed) !== result.signedShortcutSha256) {
    throw new Error('private signed result digest mismatch');
  }
  await writeFile(outputPath(args.output), signed, { mode: 0o600, flag: 'wx' });
  process.stdout.write('private signed result recovered and hash verified\n');
}

function argsFrom(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error('invalid signing argument');
    const name = token.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    values[name] = argv[++index];
  }
  return values;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const args = argsFrom(rest);
  try {
    if (command === 'validate-manual-resign') {
      manualResignAuthorizationFromEnvironment(process.env, process.env.GITHUB_SHA);
      process.stdout.write('manual re-sign authorization checks passed\n');
    } else if (command === 'prepare') {
      const sourceCommit = assertCommit(args.sourceCommit);
      const manualResign = manualResignAuthorizationFromEnvironment(process.env, sourceCommit);
      await prepareSigning({
        package: args.package,
        sourceCommit,
        runtimeOrigin: process.env.WHT_RUNTIME_ORIGIN,
        manifestSha: args.manifestSha,
        wireSha: args.wireSha,
        recoveryRequested: process.env.WHT_AMBIGUOUS_RECOVERY_REQUESTED === 'true',
        recoveryAuthorization: process.env.WHT_AMBIGUOUS_RECOVERY_AUTH,
        manualResign,
      });
    } else if (command === 'send') await sendSigningFromCli(args);
    else if (command === 'publish' || command === 'complete') {
      const sourceCommit = assertCommit(args.sourceCommit);
      const manualResign = manualResignAuthorizationFromEnvironment(process.env, sourceCommit);
      const signingArgs = {
        package: args.package,
        sourceCommit,
        runtimeOrigin: process.env.WHT_RUNTIME_ORIGIN,
        manifestSha: args.manifestSha,
        wireSha: args.wireSha,
        signedPath: args.signedPath,
        manualResign,
      };
      if (command === 'publish') await publishSigning(signingArgs);
      else await completeSigning(signingArgs);
    } else if (command === 'recover') await recoverSigning({ output: args.output, operationKey: args.operationKey });
    else throw new Error('unknown signing command');
  } catch (error) {
    process.stderr.write(`protected Actions signing stopped: ${error instanceof Error ? error.message : 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}
