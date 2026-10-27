/*
 * GitHub Actions-only protected signing state machine.
 *
 * The runner creates an encrypted intent before the provider request, sends
 * exactly one fixed HubSign request, and uploads only an encrypted result.
 * GitHub commit status is the durable lease: pending means permanently
 * ambiguous and blocks every later attempt for the same logical operation.
 * A private encrypted migrated record blocks the prior ambiguous logical
 * package. Its exact old wire digest stays permanently blocked. A legacy
 * record without a target hash can be authorized by exact current-run auth or
 * successful prior-run proof for a different target; a populated target hash
 * scopes the block to that target. Current-target status and protected
 * first-attempt recovery checks remain mandatory, and the status lease blocks
 * reruns.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const HUBSIGN_ENDPOINT = 'https://hubsign.routinehub.services/sign';
export const MAX_SIGNED_BYTES = 8 * 1024 * 1024;
const MAX_PROVIDER_BODY_EVIDENCE_BYTES = 8 * 1024 * 1024;
const STATUS_PREFIX = 'wht-shortcut-signing/';
const KEY_PREFIX = 'wht-shortcut-signing-v3\n';

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

function assertActionPin(value, label) {
  if (!value || typeof value !== 'object'
    || typeof value.repository !== 'string' || !value.repository
    || typeof value.version !== 'string' || !value.version
    || !/^[0-9a-f]{40}$/.test(value.commit)) {
    throw new Error(`invalid ${label} pin`);
  }
  return { repository: value.repository, version: value.version, commit: value.commit };
}

function decodeOutputKey(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('signing output key is not configured');
  const normalized = value.trim();
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32 || key.toString('base64') !== normalized) {
    throw new Error('signing output key must be canonical base64 for 32 bytes');
  }
  return key;
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

export function statusBlocks(statuses, context) {
  return Array.isArray(statuses) && statuses.some(value => value?.context === context);
}

export function artifactNames(key) {
  assertHex(key, 64, 'operation key');
  return {
    intent: `wht-signing-intent-${key}`,
    result: `wht-signing-result-${key}`,
  };
}

export function encryptPrivateEnvelope(plaintext, outputKey) {
  if (!Buffer.isBuffer(plaintext)) throw new Error('private envelope input must be bytes');
  const key = decodeOutputKey(outputKey);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: 1,
    algorithm: 'aes-256-gcm',
    nonce: nonce.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

export function decryptPrivateEnvelope(envelope, outputKey) {
  if (!envelope || envelope.version !== 1 || envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('unsupported private envelope');
  }
  const key = decodeOutputKey(outputKey);
  try {
    const nonce = Buffer.from(envelope.nonce, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    const tag = Buffer.from(envelope.tag, 'base64');
    if (nonce.length !== 12 || tag.length !== 16) throw new Error('invalid envelope fields');
    const decipher = createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new Error('private envelope authentication failed');
  }
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

function validateMigratedRecord(record) {
  if (record?.schemaVersion !== 1 || record?.status !== 'ambiguous') {
    throw new Error('migrated ambiguous signing record is invalid');
  }
  assertHex(record.logicalSourceIdentity, 64, 'migrated logical source identity');
  assertHex(record.wireSha256, 64, 'migrated wire SHA-256');
  if (record.targetOriginSha256 !== undefined) assertHex(record.targetOriginSha256, 64, 'migrated target origin SHA-256');
  return record;
}

export function encodeMigratedAmbiguityRecord(record, outputKey) {
  const validated = validateMigratedRecord(record);
  const envelope = encryptPrivateEnvelope(Buffer.from(JSON.stringify(validated), 'utf8'), outputKey);
  return Buffer.from(JSON.stringify(envelope), 'utf8').toString('base64');
}

export function decodeMigratedAmbiguityRecord(encoded, outputKey) {
  let envelope;
  try {
    const bytes = Buffer.from(encoded, 'base64');
    if (!bytes.length || bytes.toString('base64') !== String(encoded).trim()) throw new Error('invalid record encoding');
    envelope = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('migrated ambiguous signing record is invalid');
  }
  try {
    return validateMigratedRecord(JSON.parse(decryptPrivateEnvelope(envelope, outputKey).toString('utf8')));
  } catch {
    throw new Error('migrated ambiguous signing record authentication failed');
  }
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

function readMigratedAmbiguityRecord(outputKey) {
  const encoded = process.env.WHT_AMBIGUOUS_SIGNING_RECORD;
  if (!encoded) throw new Error('migrated ambiguous signing record is not configured');
  return decodeMigratedAmbiguityRecord(encoded, outputKey);
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

function output(name, value) {
  const target = process.env.GITHUB_OUTPUT;
  if (!target) return;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || /[\r\n]/.test(value)) throw new Error('invalid workflow output');
  return writeFile(target, `${name}=${value}\n`, { flag: 'a' });
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

export async function prepareSigning(args) {
  const metadata = await packageMetadata(
    args.package,
    args.runtimeOrigin,
    args.manifestSha,
    args.wireSha,
  );
  const context = statusContext(metadata.key);
  const statuses = await readStatusLedger();
  if (statusBlocks(statuses, context)) throw new Error('existing signing status blocks this operation');
  const migratedRecord = readMigratedAmbiguityRecord(args.outputKey);
  if (migratedRecordBlocks(migratedRecord, metadata.sourceIdentity, metadata.targetOriginSha256, metadata.wireSha)) {
    if (migratedRecord.wireSha256 === metadata.wireSha) {
      throw new Error('exact migrated wire is permanently blocked');
    }
    if (args.recoveryRequested !== true) throw new Error('known ambiguous logical package is permanently blocked');
    const authorization = decodeRecoveryAuthorization(args.recoveryAuthorization);
    const currentAuthorizationMatches = recoveryAuthorizationMatches(authorization, migratedRecord, {
      sourceIdentity: metadata.sourceIdentity,
      targetOriginSha256: metadata.targetOriginSha256,
      key: metadata.key,
    }, args.sourceCommit);
    const historicalAuthorizationMatches = !currentAuthorizationMatches
      && historicalRecoveryAuthorizationMatches(authorization, migratedRecord, metadata);
    if (!currentAuthorizationMatches && !historicalAuthorizationMatches) {
      throw new Error('recovery authorization does not match the protected ambiguous operation');
    }
    if (historicalAuthorizationMatches
      && statuses.find(status => status.context === statusContext(authorization.operationKey))?.state !== 'success') {
      throw new Error('prior ambiguous recovery operation has no successful status');
    }
  }
  await createStatus(context, 'pending', 'Encrypted signing intent recorded; interruption remains ambiguous');
  const intent = {
    schemaVersion: 1,
    status: 'pending',
    operationKey: metadata.key,
    sourceCommit: args.sourceCommit,
    logicalSourceIdentity: metadata.sourceIdentity,
    compilerVersion: metadata.compilerVersion,
    statusAnchor: statusSha(),
    targetOriginSha256: metadata.targetOriginSha256,
    manifestSha256: metadata.manifestSha,
    wireSha256: metadata.wireSha,
  };
  const intentPath = outputPath(args.intentPath);
  await writeFile(intentPath, `${JSON.stringify(encryptPrivateEnvelope(Buffer.from(JSON.stringify(intent)), args.outputKey))}\n`, { mode: 0o600 });
  const names = artifactNames(metadata.key);
  await output('operation_key', metadata.key);
  await output('intent_artifact', names.intent);
  await output('result_artifact', names.result);
  await output('intent_path', intentPath);
  process.stdout.write('protected encrypted signing intent persisted\n');
}

async function readIntent(path, outputKey) {
  const envelope = JSON.parse(await readFile(outputPath(path), 'utf8'));
  const intent = JSON.parse(decryptPrivateEnvelope(envelope, outputKey).toString('utf8'));
  if (intent.schemaVersion !== 1 || intent.status !== 'pending') throw new Error('private signing intent is invalid');
  assertHex(intent.operationKey, 64, 'operation key');
  assertCommit(intent.sourceCommit);
  assertCommit(intent.statusAnchor);
  assertHex(intent.logicalSourceIdentity, 64, 'logical source identity');
  assertHex(intent.targetOriginSha256, 64, 'target origin SHA-256');
  assertHex(intent.manifestSha256, 64, 'manifest SHA-256');
  assertHex(intent.wireSha256, 64, 'wire SHA-256');
  if (typeof intent.compilerVersion !== 'string' || !/^v\d+\.\d+\.\d+$/.test(intent.compilerVersion)) {
    throw new Error('private signing intent Cherri version is invalid');
  }
  if (operationKey(intent.logicalSourceIdentity, intent.targetOriginSha256) !== intent.operationKey) {
    throw new Error('private signing intent key mismatch');
  }
  return intent;
}

async function persistProviderOutcome(outcomePath, intent, outputKey, fields) {
  if (!outcomePath) throw new Error('private provider outcome path is required');
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
  await writeFile(outputPath(outcomePath), `${JSON.stringify(encryptPrivateEnvelope(Buffer.from(JSON.stringify(outcome)), outputKey))}\n`, { mode: 0o600 });
}

async function responseEvidence(response) {
  const contentType = response.headers.get('content-type');
  let body;
  try {
    body = Buffer.from(await response.arrayBuffer());
  } catch {
    return {
      providerContentType: contentType,
      providerBodyLength: null,
      providerBodySha256: null,
      providerBodyBase64: null,
      providerBodyReadFailure: true,
    };
  }
  const fields = {
    providerContentType: contentType,
    providerBodyLength: body.length,
    providerBodySha256: sha256(body),
    providerBodyReadFailure: false,
  };
  if (body.length <= MAX_PROVIDER_BODY_EVIDENCE_BYTES) {
    fields.providerBodyBase64 = body.toString('base64');
  } else {
    fields.providerBodyBase64 = null;
    fields.providerBodyTooLarge = true;
  }
  return fields;
}

export async function sendSigning(args) {
  const intent = await readIntent(args.intentPath, args.outputKey);
  const wire = await readFile(resolve(args.package, 'hubsign-request.json'));
  if (sha256(wire) !== intent.wireSha256) {
    throw new Error('frozen wire does not match the pending intent');
  }
  let response;
  try {
    response = await fetch(HUBSIGN_ENDPOINT, {
      ...hubSignRequestOptions(wire, intent.compilerVersion),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    await persistProviderOutcome(args.outcomePath, intent, args.outputKey, {
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
    await persistProviderOutcome(args.outcomePath, intent, args.outputKey, {
      transportFailure: false,
      providerStatus: response.status,
      ...(await responseEvidence(response)),
    });
    throw new Error('HubSign response is ambiguous; no retry is permitted');
  }
  let signed;
  try {
    signed = Buffer.from(await response.arrayBuffer());
  } catch {
    await persistProviderOutcome(args.outcomePath, intent, args.outputKey, {
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
  try {
    validateSignedShortcut(signed);
  } catch {
    await persistProviderOutcome(args.outcomePath, intent, args.outputKey, {
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
  const result = {
    schemaVersion: 1,
    status: 'completed',
    operationKey: intent.operationKey,
    sourceCommit: intent.sourceCommit,
    logicalSourceIdentity: intent.logicalSourceIdentity,
    statusAnchor: intent.statusAnchor,
    targetOriginSha256: intent.targetOriginSha256,
    manifestSha256: intent.manifestSha256,
    wireSha256: intent.wireSha256,
    signedShortcutSha256: sha256(signed),
    signedShortcutBase64: signed.toString('base64'),
  };
  await writeFile(outputPath(args.resultPath), `${JSON.stringify(encryptPrivateEnvelope(Buffer.from(JSON.stringify(result)), args.outputKey))}\n`, { mode: 0o600 });
  process.stdout.write('HubSign response encrypted for private artifact storage\n');
}

async function complete(args) {
  const envelope = JSON.parse(await readFile(outputPath(args.resultPath), 'utf8'));
  const result = JSON.parse(decryptPrivateEnvelope(envelope, args.outputKey).toString('utf8'));
  if (result.schemaVersion !== 1 || result.status !== 'completed') throw new Error('encrypted signing result is invalid');
  const signed = Buffer.from(result.signedShortcutBase64, 'base64');
  validateSignedShortcut(signed);
  if (sha256(signed) !== result.signedShortcutSha256) throw new Error('encrypted signing result digest mismatch');
  const context = statusContext(result.operationKey);
  await createStatus(context, 'success', 'Encrypted signed result stored; recovery does not contact HubSign');
  process.stdout.write('encrypted signed result status recorded\n');
}

async function recover(args) {
  const envelope = JSON.parse(await readFile(outputPath(args.resultPath), 'utf8'));
  const result = JSON.parse(decryptPrivateEnvelope(envelope, args.outputKey).toString('utf8'));
  if (result.schemaVersion !== 1 || result.status !== 'completed') throw new Error('encrypted signing result is not complete');
  if (args.operationKey && result.operationKey !== args.operationKey) throw new Error('recovery operation key mismatch');
  const signed = Buffer.from(result.signedShortcutBase64, 'base64');
  validateSignedShortcut(signed);
  if (sha256(signed) !== result.signedShortcutSha256) throw new Error('recovery digest mismatch');
  await writeFile(outputPath(args.output), signed, { mode: 0o600 });
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
    if (command === 'prepare') await prepareSigning({
      package: args.package,
      sourceCommit: assertCommit(args.sourceCommit),
      runtimeOrigin: process.env.WHT_RUNTIME_ORIGIN,
      manifestSha: args.manifestSha,
      wireSha: args.wireSha,
      outputKey: process.env.WHT_SIGNING_OUTPUT_KEY,
      intentPath: args.intentPath,
      recoveryRequested: process.env.WHT_AMBIGUOUS_RECOVERY_REQUESTED === 'true',
      recoveryAuthorization: process.env.WHT_AMBIGUOUS_RECOVERY_AUTH,
    });
    else if (command === 'send') {
      if (!args.outcomePath) throw new Error('private provider outcome path is required');
      await sendSigning({ package: args.package, intentPath: args.intentPath, resultPath: args.resultPath, outcomePath: args.outcomePath, outputKey: process.env.WHT_SIGNING_OUTPUT_KEY });
    }
    else if (command === 'complete') await complete({ resultPath: args.resultPath, outputKey: process.env.WHT_SIGNING_OUTPUT_KEY });
    else if (command === 'recover') await recover({ resultPath: args.resultPath, output: args.output, operationKey: args.operationKey, outputKey: process.env.WHT_SIGNING_OUTPUT_KEY });
    else throw new Error('unknown signing command');
  } catch (error) {
    process.stderr.write(`protected Actions signing stopped: ${error instanceof Error ? error.message : 'unknown failure'}\n`);
    process.exitCode = 1;
  }
}
