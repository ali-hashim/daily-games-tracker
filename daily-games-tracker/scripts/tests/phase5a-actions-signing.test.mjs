import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  intentObjectKey,
  providerOutcomeObjectKey,
  resultMetadataObjectKey,
  signedShortcutObjectKey,
  completeSigning as completeSigningImpl,
  hubSignResponseAccepted,
  hubSignRequestOptions,
  logicalSourceIdentity,
  MANUAL_RESIGN_REASON_CODES,
  migratedRecordBlocks,
  manualResignAuthorizationFromEnvironment,
  manualResignOperationKey,
  manualResignSendStatusContext,
  manualResignStatusContext,
  operationKey,
  prepareSigning as prepareSigningImpl,
  publishSigning as publishSigningImpl,
  sendSigning as sendSigningImpl,
  sendSigningFromCli,
  statusBlocks,
  statusContext,
  validateSignedShortcut,
} from '../phase5a_actions_signing.mjs';

const SOURCE_COMMIT = '7bc830a62a7d5448ffc87e6fa70d1c8bef5ae584';
const TARGET_ORIGIN_SHA256 = 'a'.repeat(64);
const MIGRATED_AMBIGUITY_KEY = 'signing/migrated-ambiguity.json';
let privateStore;
const BUILD_MANIFEST = {
  sourceSha256: 'b'.repeat(64),
  captureSha256: '1'.repeat(64),
  lockSha256: 'c'.repeat(64),
  compilerSha256: '2'.repeat(64),
  nativeContractSha256: 'd'.repeat(64),
  compilerCommit: 'e'.repeat(40),
  goVersion: '1.24.0',
  flags: ['--skip-sign', '--derive-uuids'],
  toolchainSemantic: {
    schemaVersion: 1,
    compiler: { name: 'Cherri', version: 'v2.3.0', commit: 'e'.repeat(40) },
    go: { version: '1.24.0' },
    runner: 'ubuntu-24.04',
    flags: ['--skip-sign', '--derive-uuids'],
    actions: {
      checkout: { repository: 'actions/checkout', version: 'v4.2.2', commit: 'a'.repeat(40) },
      setupGo: { repository: 'actions/setup-go', version: 'v6.5.0', commit: 'b'.repeat(40) },
      uploadArtifact: { repository: 'actions/upload-artifact', version: 'v6.0.0', commit: 'c'.repeat(40) },
    },
  },
};

function responseJson(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function statusPage(sha, statuses, totalCount = statuses.length) {
  return { sha, state: statuses.length === 0 || statuses.some(value => value.state === 'pending') ? 'pending' : 'success', statuses, total_count: totalCount };
}

async function makePackage(buildManifest = BUILD_MANIFEST, wire = Buffer.from('{"wire":"synthetic"}')) {
  const root = await mkdtemp(join(tmpdir(), 'wht-actions-signing-'));
  const provenance = join(root, 'provenance');
  await mkdir(provenance, { recursive: true });
  const lock = JSON.stringify({ schemaVersion: 1, build: { flags: buildManifest.flags }, compiler: { commit: buildManifest.compilerCommit }, go: { version: buildManifest.goVersion } });
  const lockSha = createSha256(Buffer.from(lock));
  const manifest = {
    signing: 'not performed',
    transfer: 'not performed',
    toolchain: { lockSha256: lockSha },
    futureSigningPayload: { jsonWireSha256: createSha256(wire) },
  };
  const approvalBytes = Buffer.from(JSON.stringify(manifest));
  await writeFile(join(root, 'approval-manifest.json'), approvalBytes);
  await writeFile(join(root, 'hubsign-request.json'), wire);
  await writeFile(join(provenance, 'build-manifest.json'), JSON.stringify({ ...buildManifest, lockSha256: lockSha }));
  await writeFile(join(provenance, 'toolchain.lock.json'), lock);
  return { root, manifestSha: createSha256(approvalBytes), wireSha: createSha256(wire) };
}

async function attemptPriorTargetRecovery({
  priorStatus = 'success',
  includePriorStatus = true,
  exactMigratedWire = false,
  sameTarget = false,
  authorizationRunId = 'prior-run',
  currentRunAttempt = '1',
  authorizationOverrides = {},
} = {}) {
  const packageInfo = await makePackage();
  const priorOrigin = 'https://prior-target.example.com';
  const currentOrigin = 'https://current-target.example.com';
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const priorTargetSha = createSha256(Buffer.from(priorOrigin));
  const currentTargetSha = createSha256(Buffer.from(currentOrigin));
  const currentKey = operationKey(sourceIdentity, currentTargetSha);
  const authorizationTargetSha = sameTarget ? currentTargetSha : priorTargetSha;
  const authorizationKey = operationKey(sourceIdentity, authorizationTargetSha);
  const migratedWireSha = exactMigratedWire ? packageInfo.wireSha : 'f'.repeat(64);
  const auth = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    runId: authorizationRunId,
    runAttempt: 1,
    sourceCommit: '3'.repeat(40),
    logicalSourceIdentity: sourceIdentity,
    targetOriginSha256: authorizationTargetSha,
    operationKey: authorizationKey,
    migratedWireSha256: migratedWireSha,
    ...authorizationOverrides,
  })).toString('base64');
  encodeMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: sourceIdentity,
    wireSha256: migratedWireSha,
  });
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const statuses = includePriorStatus ? [{ id: 7, context: statusContext(authorizationKey), state: priorStatus }] : [];
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: 'current-run',
    GITHUB_RUN_ATTEMPT: currentRunAttempt,
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), statuses, statuses.length));
    if (String(url).startsWith('https://api.github.test')) {
      const body = JSON.parse(options.body);
      const status = { id: statuses.length + 1, context: body.context, state: body.state };
      statuses.push(status);
      return responseJson(status);
    }
    throw new Error('prior proof must not contact the signing provider');
  };
  let error;
  try {
    await prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: currentOrigin,
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
      recoveryRequested: true,
      recoveryAuthorization: auth,
    }).catch(caught => { error = caught; });
    return { error, calls, statuses, packageInfo, intentKey: intentObjectKey(currentKey), currentKey };
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
}

function createSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function newPrivateStore() {
  const objects = new Map();
  const events = [];
  return {
    objects,
    events,
    async get(key) {
      events.push({ method: 'GET', key });
      const bytes = objects.get(key);
      if (!bytes) throw new Error('missing private fixture object');
      return Buffer.from(bytes);
    },
    async getOptional(key) {
      events.push({ method: 'GET?', key });
      const bytes = objects.get(key);
      return bytes ? Buffer.from(bytes) : null;
    },
    async putVerified(key, value, contentType) {
      const bytes = Buffer.from(value);
      events.push({ method: 'PUT', key, contentType, sha256: createSha256(bytes) });
      objects.set(key, bytes);
      return createSha256(bytes);
    },
  };
}

function seedMigratedAmbiguityRecord(record) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  privateStore.objects.set(MIGRATED_AMBIGUITY_KEY, bytes);
  process.env.WHT_AMBIGUITY_RECORD_SHA256 = createSha256(bytes);
  return bytes.toString('base64');
}

function encodeMigratedAmbiguityRecord(record) {
  seedMigratedAmbiguityRecord(record);
  return record;
}

function prepareSigning(args) {
  return prepareSigningImpl({ ...args, r2Store: privateStore });
}

function sendSigning(args) {
  const runtimeOrigin = args.runtimeOrigin || 'https://ci-fixture.example.com';
  return sendSigningImpl({
    ...args,
    runtimeOrigin,
    sourceCommit: args.sourceCommit || SOURCE_COMMIT,
    operationKey: args.operationKey || operationKey(
      logicalSourceIdentity(BUILD_MANIFEST),
      createSha256(Buffer.from(runtimeOrigin, 'utf8')),
    ),
    signedPath: args.signedPath || join(args.package, 'signed.shortcut'),
    recoveryRequested: args.recoveryRequested,
    recoveryAuthorization: args.recoveryAuthorization,
    r2Store: privateStore,
  });
}

function completeSigning(args) {
  const runtimeOrigin = args.runtimeOrigin || 'https://ci-fixture.example.com';
  return completeSigningImpl({
    ...args,
    runtimeOrigin,
    sourceCommit: args.sourceCommit || SOURCE_COMMIT,
    signedPath: args.signedPath || join(args.package, 'signed.shortcut'),
    r2Store: privateStore,
  });
}

function publishSigning(args) {
  const runtimeOrigin = args.runtimeOrigin || 'https://ci-fixture.example.com';
  return publishSigningImpl({
    ...args,
    runtimeOrigin,
    sourceCommit: args.sourceCommit || SOURCE_COMMIT,
    signedPath: args.signedPath || join(args.package, 'signed.shortcut'),
    r2Store: privateStore,
  });
}

test.beforeEach(() => {
  privateStore = newPrivateStore();
  process.env = {
    ...process.env,
    GITHUB_RUN_ID: process.env.GITHUB_RUN_ID || 'test-run',
    GITHUB_RUN_ATTEMPT: process.env.GITHUB_RUN_ATTEMPT || '1',
  };
  seedMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: '0'.repeat(64),
    wireSha256: 'f'.repeat(64),
  });
});

async function installEmptyGitHubStatusStub() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const anchor = '1'.repeat(40);
  let posts = 0;
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: anchor,
  };
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'GET') return responseJson(statusPage(anchor, [], 0));
    posts += 1;
    const body = JSON.parse(options.body);
    return responseJson({ state: body.state, context: body.context, id: 1 });
  };
  return {
    get posts() { return posts; },
    restore() {
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
    },
  };
}

test('missing migrated ambiguity object fails closed before a pending lease', async () => {
  const packageInfo = await makePackage();
  const github = await installEmptyGitHubStatusStub();
  privateStore.objects.delete(MIGRATED_AMBIGUITY_KEY);
  delete process.env.WHT_AMBIGUITY_RECORD_SHA256;
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /migrated ambiguous signing record/);
    assert.equal(github.posts, 0);
  } finally {
    github.restore();
  }
});

test('malformed migrated ambiguity JSON fails closed before a pending lease', async () => {
  const packageInfo = await makePackage();
  const github = await installEmptyGitHubStatusStub();
  const malformed = Buffer.from('{"schemaVersion":1,', 'utf8');
  privateStore.objects.set(MIGRATED_AMBIGUITY_KEY, malformed);
  process.env.WHT_AMBIGUITY_RECORD_SHA256 = createSha256(malformed);
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /migrated ambiguous signing record/);
    assert.equal(github.posts, 0);
  } finally {
    github.restore();
  }
});

test('migrated ambiguity object digest must match protected metadata before a pending lease', async () => {
  const packageInfo = await makePackage();
  const github = await installEmptyGitHubStatusStub();
  const bytes = privateStore.objects.get(MIGRATED_AMBIGUITY_KEY);
  privateStore.objects.set(MIGRATED_AMBIGUITY_KEY, Buffer.from(`${bytes.toString('utf8')} `));
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /migrated ambiguous signing record digest mismatch/);
    assert.equal(github.posts, 0);
  } finally {
    github.restore();
  }
});

test('operation identity is stable across unrelated commits and target changes', () => {
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const key = operationKey(sourceIdentity, TARGET_ORIGIN_SHA256);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(statusContext(key), `wht-shortcut-signing/${key}`);
  assert.equal(intentObjectKey(key), `signing/intents/${key}.json`);
  assert.equal(providerOutcomeObjectKey(key), `signing/outcomes/${key}.json`);
  assert.equal(resultMetadataObjectKey(key), `signing/results/${key}.json`);
  assert.equal(signedShortcutObjectKey(SOURCE_COMMIT, '1'.repeat(64)), `shortcuts/${SOURCE_COMMIT}/${'1'.repeat(64)}.shortcut`);
  assert.equal(operationKey(sourceIdentity, TARGET_ORIGIN_SHA256), key);
  assert.equal(operationKey(sourceIdentity, TARGET_ORIGIN_SHA256), operationKey(sourceIdentity, TARGET_ORIGIN_SHA256));
  assert.equal(logicalSourceIdentity({ ...BUILD_MANIFEST, lockSha256: '1'.repeat(64), historyNote: 'formatting-only change' }), sourceIdentity);
  assert.notEqual(logicalSourceIdentity({
    ...BUILD_MANIFEST,
    toolchainSemantic: {
      ...BUILD_MANIFEST.toolchainSemantic,
      actions: {
        ...BUILD_MANIFEST.toolchainSemantic.actions,
        setupGo: { ...BUILD_MANIFEST.toolchainSemantic.actions.setupGo, commit: 'f'.repeat(40) },
      },
    },
  }), sourceIdentity);
  assert.notEqual(operationKey(sourceIdentity, 'b'.repeat(64)), key);
});

test('prepare reads every combined-status page and posts a checked pending acknowledgement before intent', async () => {
  const packageInfo = await makePackage();
  const anchor = '1'.repeat(40);
  seedMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: '0'.repeat(64),
    wireSha256: 'f'.repeat(64),
  });
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  const statuses = Array.from({ length: 101 }, (_, index) => ({
    id: index + 1,
    context: `other/${index}`,
    state: 'success',
  }));
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: anchor,
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    const parsed = new URL(String(url));
    if (options.method === 'GET') {
      const page = Number(parsed.searchParams.get('page'));
      const pageStatuses = statuses.slice((page - 1) * 100, page * 100);
      return responseJson(statusPage(anchor, pageStatuses, statuses.length));
    }
    const body = JSON.parse(options.body);
    privateStore.events.push({ method: 'STATUS', state: body.state });
    return responseJson({ state: body.state, context: body.context, id: 1000 });
  };
  try {
    await prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    });
    const operation = operationKey(
      logicalSourceIdentity(BUILD_MANIFEST),
      createSha256(Buffer.from('https://ci-fixture.example.com')),
    );
    const intentBytes = privateStore.objects.get(intentObjectKey(operation));
    assert.ok(intentBytes);
    const intent = JSON.parse(intentBytes.toString('utf8'));
    assert.equal(intent.status, 'pending');
    assert.equal(Object.hasOwn(intent, 'encrypted'), false);
    const statusWriteIndex = privateStore.events.findIndex(event => event.method === 'STATUS');
    const intentWriteIndex = privateStore.events.findIndex(event => event.method === 'PUT' && event.key === intentObjectKey(operation));
    assert.ok(statusWriteIndex >= 0 && intentWriteIndex > statusWriteIndex);
    assert.equal(calls.filter(call => call.options.method === 'GET').length, 2);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
    assert.match(calls[0].url, /per_page=100&page=1$/);
    assert.match(calls[1].url, /per_page=100&page=2$/);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('prepare and send validate the full status ledger and current pending lease', async (t) => {
  for (const totalCount of [100, 200]) {
    await t.test(`exactly ${totalCount} statuses`, async () => {
      const packageInfo = await makePackage();
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const calls = [];
      let providerCalls = 0;
      const anchor = '1'.repeat(40);
      const statuses = Array.from({ length: totalCount }, (_, index) => ({
        id: index + 1,
        context: `other/${index}`,
        state: 'success',
      }));
      const ledger = [...statuses];
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: anchor,
        RUNNER_TEMP: packageInfo.root,
      };
      globalThis.fetch = async (url, options = {}) => {
        const text = String(url);
        calls.push({ url: text, options });
        if (text.startsWith('https://api.github.test')) {
          if (options.method === 'GET') {
            const page = Number(new URL(text).searchParams.get('page'));
            return responseJson(statusPage(anchor, ledger.slice((page - 1) * 100, page * 100), ledger.length));
          }
          const body = JSON.parse(options.body);
          ledger.push({ id: ledger.length + 1, context: body.context, state: body.state });
          return responseJson({ state: body.state, context: body.context, id: 1000 });
        }
        providerCalls += 1;
        assert.equal(text, 'https://hubsign.routinehub.services/sign');
        return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      };
      try {
        await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
        await sendSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
        assert.equal(calls.filter(call => call.options.method === 'GET').length, (totalCount / 100) + Math.ceil((totalCount + 1) / 100));
        assert.equal(calls.filter(call => call.options.method === 'POST').length, 2);
        assert.equal(providerCalls, 1);
      } finally {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test('prepare stops fail-closed on malformed, truncated, inconsistent, or failed status pages', async (t) => {
  const scenarios = [
    ['missing statuses', () => ({ sha: '1'.repeat(40), total_count: 0 })],
    ['wrong anchor', () => statusPage('2'.repeat(40), [], 0)],
    ['truncated page', () => statusPage('1'.repeat(40), [{ id: 1, context: 'other', state: 'success' }], 2)],
    ['malformed status entry', () => statusPage('1'.repeat(40), [{ context: 42, state: 'success' }], 1)],
    ['inconsistent total count', () => statusPage('1'.repeat(40), [], 1)],
    ['failed status request', () => new Response('unavailable', { status: 503 })],
    ['duplicate context across pages', (page) => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, context: `other/${index}`, state: 'success' }));
      return page === 1
        ? statusPage('1'.repeat(40), firstPage, 101)
        : statusPage('1'.repeat(40), [{ id: 101, context: 'other/0', state: 'success' }], 101);
    }],
    ['duplicate status id across pages', (page) => {
      const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, context: `other/${index}`, state: 'success' }));
      return page === 1
        ? statusPage('1'.repeat(40), firstPage, 101)
        : statusPage('1'.repeat(40), [{ id: 1, context: 'other/100', state: 'success' }], 101);
    }],
  ];
  for (const [name, responseFactory] of scenarios) {
    await t.test(name, async () => {
      const packageInfo = await makePackage();
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const calls = [];
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
        RUNNER_TEMP: packageInfo.root,
      };
      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (options.method === 'GET') {
          const pageNumber = Number(new URL(String(url)).searchParams.get('page'));
          const page = responseFactory(pageNumber);
          return page instanceof Response ? page : responseJson(page);
        }
        throw new Error('pending status write must not occur for malformed read');
      };
      try {
        await assert.rejects(() => prepareSigning({
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin: 'https://ci-fixture.example.com',
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
        }), /status|GitHub private state request failed|anchor|page|malformed|invalid/i);
        const operation = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from('https://ci-fixture.example.com')));
        assert.equal(privateStore.objects.has(intentObjectKey(operation)), false);
        assert.equal(calls.some(call => call.options.method === 'POST'), false);
      } finally {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test('prepare rejects an unacknowledged pending write and makes no provider request', async () => {
  const packageInfo = await makePackage();
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), [], 0));
    return responseJson({ state: 'pending', context: 'wrong-context', id: 7 });
  };
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /acknowledged|ack/i);
    const operation = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from('https://ci-fixture.example.com')));
    assert.equal(privateStore.objects.has(intentObjectKey(operation)), false);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(calls.some(call => String(call.url).includes('hubsign')), false);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('prepare and send use the frozen package after a complete status-ledger read', async () => {
  const packageInfo = await makePackage();
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  const ledger = [];
  const eventsBefore = privateStore.events.length;
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith('https://api.github.test')) {
      if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), ledger, ledger.length));
      const body = JSON.parse(options.body);
      ledger.push({ id: ledger.length + 1, context: body.context, state: body.state });
      privateStore.events.push({ method: 'STATUS', state: body.state });
      return responseJson({ state: body.state, context: body.context, id: 8 });
    }
    providerCalls += 1;
    assert.equal(text, 'https://hubsign.routinehub.services/sign');
    assert.equal(options.method, 'POST');
    return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  };
  try {
    await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
    await sendSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
    assert.equal(providerCalls, 1);
    const key = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from('https://ci-fixture.example.com')));
    const result = JSON.parse(privateStore.objects.get(resultMetadataObjectKey(key)).toString('utf8'));
    assert.equal(result.status, 'completed');
    assert.equal(result.signedShortcutObjectKey, signedShortcutObjectKey(SOURCE_COMMIT, result.signedShortcutSha256));
    assert.equal(privateStore.objects.has(result.signedShortcutObjectKey), false);
    assert.equal((await readFile(join(packageInfo.root, 'signed.shortcut'))).toString('utf8'), 'AEA1synthetic-signed');
    await assert.rejects(() => completeSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /missing private fixture object/);
    assert.equal(ledger.at(-1).state, 'pending');
    await publishSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    });
    assert.ok(privateStore.objects.has(result.signedShortcutObjectKey));
    const latest = JSON.parse(privateStore.objects.get('latest.json').toString('utf8'));
    assert.deepEqual(Object.keys(latest), ['commit', 'sha256', 'key']);
    assert.deepEqual(latest, { commit: SOURCE_COMMIT, sha256: result.signedShortcutSha256, key: result.signedShortcutObjectKey });
    assert.equal(ledger.at(-1).state, 'pending');
    await completeSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    });
    assert.equal(ledger.at(-1).state, 'success');
    const publishObjectIndex = privateStore.events.findIndex(event => event.method === 'PUT' && event.key === result.signedShortcutObjectKey);
    const publishLatestIndex = privateStore.events.findIndex(event => event.method === 'PUT' && event.key === 'latest.json');
    const completeIndex = privateStore.events.findIndex((event, index) => index >= eventsBefore && event.method === 'STATUS' && event.state === 'success');
    assert.ok(publishObjectIndex >= eventsBefore && publishLatestIndex > publishObjectIndex && completeIndex > publishLatestIndex);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('send stores provider response metadata privately before failing without exposing it in output', async () => {
  const packageInfo = await makePackage();
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  const ledger = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith('https://api.github.test')) {
      if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), ledger, ledger.length));
      const body = JSON.parse(options.body);
      ledger.push({ id: ledger.length + 1, context: body.context, state: body.state });
      return responseJson({ state: body.state, context: body.context, id: 8 });
    }
    providerCalls += 1;
    return new Response('provider rejection body', {
      status: 422,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
    await assert.rejects(() => sendSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha }), /ambiguous/);
    const key = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from('https://ci-fixture.example.com')));
    const outcome = JSON.parse(privateStore.objects.get(providerOutcomeObjectKey(key)).toString('utf8'));
    assert.equal(outcome.status, 'ambiguous');
    assert.equal(outcome.providerStatus, 422);
    assert.equal(outcome.providerContentType, 'application/json');
    assert.equal(outcome.providerBodyLength, Buffer.byteLength('provider rejection body'));
    assert.match(outcome.providerBodySha256, /^[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(outcome, 'providerBody'), false);
    assert.equal(providerCalls, 1);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('send stores a transport-failure marker without retrying', async () => {
  const packageInfo = await makePackage();
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  const ledger = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith('https://api.github.test')) {
      if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), ledger, ledger.length));
      const body = JSON.parse(options.body);
      ledger.push({ id: ledger.length + 1, context: body.context, state: body.state });
      return responseJson({ state: body.state, context: body.context, id: 8 });
    }
    providerCalls += 1;
    throw new Error('synthetic transport failure');
  };
  try {
    await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha });
    await assert.rejects(() => sendSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha }), /ambiguous/);
    const key = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from('https://ci-fixture.example.com')));
    const outcome = JSON.parse(privateStore.objects.get(providerOutcomeObjectKey(key)).toString('utf8'));
    assert.equal(outcome.status, 'ambiguous');
    assert.equal(outcome.transportFailure, true);
    assert.equal(outcome.providerStatus, null);
    assert.equal(providerCalls, 1);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('migrated ambiguity record blocks wire variance for the same logical package', () => {
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const record = {
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: sourceIdentity,
    wireSha256: 'f'.repeat(64),
  };
  assert.equal(migratedRecordBlocks(record, sourceIdentity, TARGET_ORIGIN_SHA256, '1'.repeat(64)), true);
  assert.equal(migratedRecordBlocks(record, sourceIdentity, TARGET_ORIGIN_SHA256, 'f'.repeat(64)), true);
  assert.equal(migratedRecordBlocks(record, '0'.repeat(64), TARGET_ORIGIN_SHA256, '1'.repeat(64)), false);
  seedMigratedAmbiguityRecord(record);
  const bytes = privateStore.objects.get(MIGRATED_AMBIGUITY_KEY);
  assert.deepEqual(JSON.parse(bytes.toString('utf8')), record);
  assert.equal(process.env.WHT_AMBIGUITY_RECORD_SHA256, createSha256(bytes));
  assert.equal(Object.hasOwn(JSON.parse(bytes.toString('utf8')), 'encrypted'), false);
});

test('existing status for an ambiguous package is detected before the migrated record blocks it', async () => {
  const packageInfo = await makePackage();
  const origin = 'https://ci-fixture.example.com';
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const key = operationKey(sourceIdentity, createSha256(Buffer.from(origin)));
  const context = statusContext(key);
  encodeMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: sourceIdentity,
    wireSha256: 'f'.repeat(64),
  });
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return responseJson(statusPage('1'.repeat(40), [{ id: 7, context, state: 'success' }]));
  };
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: origin,
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /existing signing status blocks this operation/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('prepare blocks a migrated logical package after a read-only status check when commit and wire vary', async () => {
  const packageInfo = await makePackage();
  seedMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: logicalSourceIdentity(BUILD_MANIFEST),
    wireSha256: 'f'.repeat(64),
  });
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return responseJson(statusPage('1'.repeat(40), [], 0));
  };
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: '2'.repeat(40),
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
    }), /known ambiguous logical package/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('manual recovery requires a successful prior target proof and a distinct current wire', async (t) => {
  await t.test('successful prior status permits the separately targeted package', async () => {
    const result = await attemptPriorTargetRecovery();
    assert.equal(result.error, undefined);
    assert.equal(result.statuses.some(status => status.context === statusContext(result.currentKey) && status.state === 'pending'), true);
    assert.equal(result.calls.filter(call => call.options.method === 'GET').length, 1);
    assert.equal(result.calls.filter(call => call.options.method === 'POST').length, 1);
    assert.ok(privateStore.objects.has(result.intentKey));
  });

  for (const [name, options] of [
    ['missing prior status', { includePriorStatus: false }],
    ['pending prior status', { priorStatus: 'pending' }],
    ['failed prior status', { priorStatus: 'failure' }],
    ['authorization wire digest mismatch', { authorizationOverrides: { migratedWireSha256: 'e'.repeat(64) } }],
    ['authorization operation key mismatch', { authorizationOverrides: { operationKey: '0'.repeat(64) } }],
    ['authorization is bound to current run', { authorizationRunId: 'current-run' }],
    ['current run retry is rejected', { currentRunAttempt: '2' }],
    ['authorization target is the current target', { sameTarget: true, includePriorStatus: false }],
    ['exact migrated wire remains blocked after prior success', { exactMigratedWire: true }],
  ]) {
    await t.test(name, async () => {
      const result = await attemptPriorTargetRecovery(options);
      assert.ok(result.error, 'invalid or incomplete prior proof must be rejected');
      assert.equal(result.calls.filter(call => call.options.method === 'GET').length, 1);
      assert.equal(result.calls.filter(call => call.options.method === 'POST').length, 0);
      assert.equal(result.statuses.some(status => status.context === statusContext(result.currentKey)), false);
    });
  }
});

test('exact migrated wire remains blocked before a matching current-run authorization', async () => {
  const packageInfo = await makePackage();
  const currentOrigin = 'https://current-target.example.com';
  const priorOrigin = 'https://prior-target.example.com';
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const currentTargetSha = createSha256(Buffer.from(currentOrigin));
  const priorKey = operationKey(sourceIdentity, createSha256(Buffer.from(priorOrigin)));
  const currentKey = operationKey(sourceIdentity, currentTargetSha);
  const auth = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    runId: 'current-run',
    runAttempt: 1,
    sourceCommit: SOURCE_COMMIT,
    logicalSourceIdentity: sourceIdentity,
    targetOriginSha256: currentTargetSha,
    operationKey: currentKey,
    migratedWireSha256: packageInfo.wireSha,
  })).toString('base64');
    encodeMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: sourceIdentity,
    wireSha256: packageInfo.wireSha,
  });
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    GITHUB_RUN_ID: 'current-run',
    GITHUB_RUN_ATTEMPT: '1',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (options.method === 'GET') {
      return responseJson(statusPage('1'.repeat(40), [{ id: 7, context: statusContext(priorKey), state: 'success' }]));
    }
    const body = JSON.parse(options.body);
    return responseJson({ state: body.state, context: body.context, id: 8 });
  };
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: currentOrigin,
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
      recoveryRequested: true,
      recoveryAuthorization: auth,
    }), /exact migrated wire is permanently blocked/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.method, 'GET');
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('migrated ambiguity recovery is default-off, run-bound, and one-use through the pending ledger', async (t) => {
  const scenarios = [
    ['automatic execution ignores an authorization secret', { requested: false, runId: 'run-1', runAttempt: 1, authRunId: 'run-1', authAttempt: 1 }],
    ['mismatched run id is rejected', { requested: true, runId: 'run-1', runAttempt: 1, authRunId: 'run-2', authAttempt: 1 }],
    ['attempt two is rejected', { requested: true, runId: 'run-1', runAttempt: 2, authRunId: 'run-1', authAttempt: 2 }],
    ['other logical package is rejected', { requested: true, runId: 'run-1', runAttempt: 1, authRunId: 'run-1', authAttempt: 1, authIdentity: '0'.repeat(64) }],
    ['target mismatch is rejected', { requested: true, runId: 'run-1', runAttempt: 1, authRunId: 'run-1', authAttempt: 1, authTarget: 'b'.repeat(64) }],
  ];
  for (const [name, scenario] of scenarios) {
    await t.test(name, async () => {
      const packageInfo = await makePackage();
      const origin = 'https://ci-fixture.example.com';
      const targetSha = createSha256(Buffer.from(origin));
      const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
      const key = operationKey(sourceIdentity, targetSha);
      seedMigratedAmbiguityRecord({
        schemaVersion: 1,
        status: 'ambiguous',
        logicalSourceIdentity: sourceIdentity,
        wireSha256: 'f'.repeat(64),
      });
      const auth = Buffer.from(JSON.stringify({
        schemaVersion: 1,
        runId: scenario.authRunId,
        runAttempt: scenario.authAttempt,
        sourceCommit: SOURCE_COMMIT,
        logicalSourceIdentity: scenario.authIdentity || sourceIdentity,
        targetOriginSha256: scenario.authTarget || targetSha,
        operationKey: key,
        migratedWireSha256: 'f'.repeat(64),
      })).toString('base64');
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const calls = [];
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_RUN_ID: scenario.runId,
        GITHUB_RUN_ATTEMPT: String(scenario.runAttempt),
        WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
        RUNNER_TEMP: packageInfo.root,
      };
      globalThis.fetch = async (url, options = {}) => {
        calls.push({ url: String(url), options });
        return responseJson(statusPage('1'.repeat(40), [], 0));
      };
      try {
        await assert.rejects(() => prepareSigning({
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin: origin,
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
          recoveryRequested: scenario.requested,
          recoveryAuthorization: auth,
        }), /known ambiguous logical package|recovery authorization|prior ambiguous recovery operation/);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].options.method, 'GET');
      } finally {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
      }
    });
  }

  await t.test('exact approved run makes one provider call and pending status blocks its rerun', async () => {
    const packageInfo = await makePackage();
    const origin = 'https://ci-fixture.example.com';
    const targetSha = createSha256(Buffer.from(origin));
    const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
    const key = operationKey(sourceIdentity, targetSha);
    const auth = Buffer.from(JSON.stringify({
      schemaVersion: 1,
      runId: 'run-1',
      runAttempt: 1,
      sourceCommit: SOURCE_COMMIT,
      logicalSourceIdentity: sourceIdentity,
      targetOriginSha256: targetSha,
      operationKey: key,
      migratedWireSha256: 'f'.repeat(64),
    })).toString('base64');
    const originalEnv = { ...process.env };
    const originalFetch = globalThis.fetch;
    const ledger = [];
    let providerCalls = 0;
    process.env = {
      ...process.env,
      GITHUB_TOKEN: 'synthetic-token',
      GITHUB_API_URL: 'https://api.github.test',
      GITHUB_REPOSITORY: 'owner/repo',
      GITHUB_RUN_ID: 'run-1',
      GITHUB_RUN_ATTEMPT: '1',
      WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
      RUNNER_TEMP: packageInfo.root,
      WHT_RUNTIME_ORIGIN: origin,
      WHT_AMBIGUOUS_RECOVERY_AUTH: auth,
      WHT_AMBIGUOUS_RECOVERY_REQUESTED: 'true',
    };
    globalThis.fetch = async (url, options = {}) => {
      const text = String(url);
      if (text.startsWith('https://api.github.test')) {
        if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), ledger, ledger.length));
        const body = JSON.parse(options.body);
        const status = { id: ledger.length + 1, context: body.context, state: body.state };
        ledger.push(status);
        return responseJson(status);
      }
      providerCalls += 1;
      return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
    };
    try {
      seedMigratedAmbiguityRecord({
        schemaVersion: 1,
        status: 'ambiguous',
        logicalSourceIdentity: sourceIdentity,
        wireSha256: 'f'.repeat(64),
      });
      await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: origin, manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha, recoveryRequested: true, recoveryAuthorization: auth });
      const signedPath = join(packageInfo.root, 'cli-signed.shortcut');
      const cliArgs = {
        package: packageInfo.root,
        sourceCommit: SOURCE_COMMIT,
        manifestSha: packageInfo.manifestSha,
        wireSha: packageInfo.wireSha,
        signedPath,
      };
      await sendSigningFromCli(cliArgs, process.env, privateStore);
      assert.equal(providerCalls, 1);
      assert.equal((await readFile(signedPath)).toString('utf8'), 'AEA1synthetic-signed');
      process.env.WHT_AMBIGUOUS_RECOVERY_REQUESTED = 'false';
      await assert.rejects(() => sendSigningFromCli(cliArgs, process.env, privateStore), /known ambiguous logical package is permanently blocked/);
      assert.equal(providerCalls, 1);
      await assert.rejects(() => prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: origin, manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha, recoveryRequested: true, recoveryAuthorization: auth }), /existing signing status/);
      assert.equal(providerCalls, 1);
    } finally {
      process.env = originalEnv;
      globalThis.fetch = originalFetch;
    }
  });
});

test('manual re-sign requires complete workflow-dispatch authorization bound to the exact protected commit', () => {
  const env = {
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: SOURCE_COMMIT,
    GITHUB_RUN_ID: 'manual-run-1',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_ACTOR: 'reviewer-user',
    WHT_MANUAL_RESIGN_REQUESTED: 'true',
    WHT_MANUAL_RESIGN_REQUEST_ID: 'b4e10675-0e56-4f8f-9c0b-93058500a001',
    WHT_MANUAL_RESIGN_SOURCE_COMMIT: SOURCE_COMMIT,
    WHT_MANUAL_RESIGN_REASON: 'delivery-verification-failed',
    WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: 'true',
  };
  const authorization = manualResignAuthorizationFromEnvironment(env, SOURCE_COMMIT);
  assert.equal(authorization.requestIdSha256, createSha256(Buffer.from(env.WHT_MANUAL_RESIGN_REQUEST_ID)));
  assert.equal(authorization.sourceCommit, SOURCE_COMMIT);
  assert.equal(authorization.reason, 'delivery-verification-failed');
  assert.equal(authorization.actor, env.GITHUB_ACTOR);
  assert.equal(authorization.runId, env.GITHUB_RUN_ID);
  assert.equal(authorization.runAttempt, 1);
  assert.deepEqual(MANUAL_RESIGN_REASON_CODES, [
    'delivery-verification-failed',
    'prior-signature-unavailable',
    'previous-outcome-ambiguous',
    'post-delivery-integrity-check-failed',
  ]);
  for (const reason of MANUAL_RESIGN_REASON_CODES) {
    assert.equal(manualResignAuthorizationFromEnvironment({ ...env, WHT_MANUAL_RESIGN_REASON: reason }, SOURCE_COMMIT).reason, reason);
  }

  const rejected = [
    { ...env, GITHUB_EVENT_NAME: 'push' },
    { ...env, GITHUB_RUN_ATTEMPT: '2' },
    { ...env, WHT_MANUAL_RESIGN_SOURCE_COMMIT: '0'.repeat(40) },
    { ...env, WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: 'false' },
    { ...env, WHT_MANUAL_RESIGN_REQUEST_ID: 'not-a-unique-uuid' },
    { ...env, WHT_MANUAL_RESIGN_REASON: 'Reviewed re-sign after delivery verification failed' },
    { ...env, WHT_MANUAL_RESIGN_REASON: 'arbitrary-private-reason' },
    { ...env, WHT_AMBIGUOUS_RECOVERY_REQUESTED: 'true' },
  ];
  for (const invalid of rejected) {
    assert.throws(() => manualResignAuthorizationFromEnvironment(invalid, SOURCE_COMMIT));
  }
  assert.equal(manualResignAuthorizationFromEnvironment({ ...env, WHT_MANUAL_RESIGN_REQUESTED: 'false' }, SOURCE_COMMIT), null);
});

test('manual re-sign uses a fresh request-scoped lease and one provider post for successful, failed, or ambiguous prior states', async (t) => {
  for (const priorState of ['success', 'failure', 'error', 'pending']) {
    await t.test(`new authorization can re-sign a prior ${priorState} operation`, async () => {
      const packageInfo = await makePackage();
      const runtimeOrigin = 'https://ci-fixture.example.com';
      const priorKey = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from(runtimeOrigin)));
      const requestId = `b4e10675-0e56-4f8f-9c0b-93058500a00${['success', 'failure', 'error', 'pending'].indexOf(priorState) + 1}`;
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const statuses = [{ id: 1, context: statusContext(priorKey), state: priorState }];
      let providerCalls = 0;
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_SHA: SOURCE_COMMIT,
        GITHUB_ACTOR: 'reviewer-user',
        GITHUB_RUN_ID: `manual-${priorState}`,
        GITHUB_RUN_ATTEMPT: '1',
        RUNNER_TEMP: packageInfo.root,
        WHT_RUNTIME_ORIGIN: runtimeOrigin,
        WHT_MANUAL_RESIGN_REQUESTED: 'true',
        WHT_MANUAL_RESIGN_REQUEST_ID: requestId,
        WHT_MANUAL_RESIGN_SOURCE_COMMIT: SOURCE_COMMIT,
        WHT_MANUAL_RESIGN_REASON: 'delivery-verification-failed',
        WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: 'true',
      };
      globalThis.fetch = async (url, options = {}) => {
        const text = String(url);
        if (text.startsWith('https://api.github.test')) {
          if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), statuses, statuses.length));
          const body = JSON.parse(options.body);
          const status = { id: statuses.length + 1, context: body.context, state: body.state, description: body.description };
          statuses.push(status);
          return responseJson(status);
        }
        providerCalls += 1;
        return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      };
      try {
        const authorization = manualResignAuthorizationFromEnvironment(process.env, SOURCE_COMMIT);
        const authHash = authorization.requestIdSha256;
        const key = manualResignOperationKey(priorKey, requestId);
        assert.equal(manualResignStatusContext(authHash), `wht-shortcut-resign/${authHash}`);
        assert.equal(manualResignSendStatusContext(authHash), `wht-shortcut-resign-send/${authHash}`);
        await prepareSigning({
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin,
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
          manualResign: authorization,
        });
        assert.equal(
          statuses.find(status => status.context === manualResignStatusContext(authHash))?.description,
          'Manual re-sign authorization reserved',
        );
        const intent = JSON.parse(privateStore.objects.get(intentObjectKey(key)).toString('utf8'));
        assert.equal(intent.schemaVersion, 2);
        assert.equal(intent.logicalOperationKey, priorKey);
        assert.equal(intent.authorizationIdSha256, authHash);
        assert.equal(intent.authorizationActor, 'reviewer-user');
        assert.equal(intent.authorizationReason, process.env.WHT_MANUAL_RESIGN_REASON);
        assert.equal(statuses.some(status => status.context === manualResignStatusContext(authHash) && status.state === 'pending'), true);
        assert.equal(statuses.some(status => status.description?.includes(requestId)), false);

        const signedPath = join(packageInfo.root, 'manual-signed.shortcut');
        const sendArgs = {
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin,
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
          signedPath,
          manualResign: authorization,
        };
        await sendSigning(sendArgs);
        assert.equal(providerCalls, 1);
        assert.equal(
          statuses.find(status => status.context === manualResignSendStatusContext(authHash))?.description,
          'Manual re-sign provider POST consumed',
        );
        const publicManualDescriptions = statuses
          .filter(status => status.context === manualResignStatusContext(authHash)
            || status.context === manualResignSendStatusContext(authHash))
          .map(status => status.description)
          .join('\n');
        for (const privatePackageIdentity of [
          priorKey,
          key,
          logicalSourceIdentity(BUILD_MANIFEST),
          packageInfo.manifestSha,
          packageInfo.wireSha,
          createSha256(Buffer.from(runtimeOrigin)),
        ]) {
          assert.equal(publicManualDescriptions.includes(privatePackageIdentity), false);
        }

        // Even if a process lost its local evidence after the one POST, the
        // request-scoped send lease still prevents a second provider call.
        privateStore.objects.delete(providerOutcomeObjectKey(key));
        privateStore.objects.delete(resultMetadataObjectKey(key));
        await assert.rejects(() => sendSigning(sendArgs), /manual re-sign provider lease has already been consumed/);
        assert.equal(providerCalls, 1);

        process.env.GITHUB_RUN_ID = `manual-${priorState}-retry`;
        const reusedIdAuthorization = manualResignAuthorizationFromEnvironment(process.env, SOURCE_COMMIT);
        await assert.rejects(() => prepareSigning({
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin,
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
          manualResign: reusedIdAuthorization,
        }), /manual re-sign request ID has already been used/);
      } finally {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test('manual re-sign requires prior package evidence and can narrowly authorize the unchanged migrated ambiguity record', async (t) => {
  for (const scenario of ['no prior evidence', 'exact migrated wire', 'same ambiguous logical package', 'legacy ambiguity record only']) {
    await t.test(scenario, async () => {
      const packageInfo = await makePackage();
      const origin = 'https://ci-fixture.example.com';
      const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
      const key = operationKey(sourceIdentity, createSha256(Buffer.from(origin)));
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const statuses = ['no prior evidence', 'legacy ambiguity record only'].includes(scenario)
        ? []
        : [{ id: 1, context: statusContext(key), state: 'success' }];
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
        GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_SHA: SOURCE_COMMIT,
        GITHUB_ACTOR: 'reviewer-user',
        GITHUB_RUN_ID: `blocked-${scenario.replaceAll(' ', '-')}`,
        GITHUB_RUN_ATTEMPT: '1',
        WHT_MANUAL_RESIGN_REQUESTED: 'true',
        WHT_MANUAL_RESIGN_REQUEST_ID: 'b4e10675-0e56-4f8f-9c0b-93058500a099',
        WHT_MANUAL_RESIGN_SOURCE_COMMIT: SOURCE_COMMIT,
        WHT_MANUAL_RESIGN_REASON: 'delivery-verification-failed',
        WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: 'true',
        RUNNER_TEMP: packageInfo.root,
      };
      let providerCalls = 0;
      globalThis.fetch = async (url, options = {}) => {
        if (String(url).startsWith('https://api.github.test')) {
          if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), statuses, statuses.length));
          const body = JSON.parse(options.body);
          statuses.push({ id: statuses.length + 1, context: body.context, state: body.state, description: body.description });
          return responseJson(statuses.at(-1));
        }
        providerCalls += 1;
        return new Response(Buffer.from('AEA1legacy-resigned'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      };
      try {
        let migratedBytes;
        if (scenario !== 'no prior evidence') {
          migratedBytes = Buffer.from(JSON.stringify({
            schemaVersion: 1,
            status: 'ambiguous',
            logicalSourceIdentity: sourceIdentity,
            wireSha256: scenario === 'exact migrated wire' ? packageInfo.wireSha : 'f'.repeat(64),
          }) + '\n');
          privateStore.objects.set(MIGRATED_AMBIGUITY_KEY, migratedBytes);
          process.env.WHT_AMBIGUITY_RECORD_SHA256 = createSha256(migratedBytes);
        }
        const authorization = manualResignAuthorizationFromEnvironment(process.env, SOURCE_COMMIT);
        const args = {
          package: packageInfo.root,
          sourceCommit: SOURCE_COMMIT,
          runtimeOrigin: origin,
          manifestSha: packageInfo.manifestSha,
          wireSha: packageInfo.wireSha,
          manualResign: authorization,
        };
        if (scenario === 'no prior evidence') {
          await assert.rejects(() => prepareSigning(args), /manual re-sign requires prior logical-package evidence/);
          assert.equal(statuses.some(status => status.context === manualResignStatusContext(authorization.requestIdSha256)), false);
        } else {
          await prepareSigning(args);
          const resignKey = manualResignOperationKey(key, process.env.WHT_MANUAL_RESIGN_REQUEST_ID);
          assert.ok(privateStore.objects.has(intentObjectKey(resignKey)));
          assert.ok(statuses.some(status => status.context === manualResignStatusContext(authorization.requestIdSha256)));
          assert.deepEqual(privateStore.objects.get(MIGRATED_AMBIGUITY_KEY), migratedBytes);
          if (scenario === 'legacy ambiguity record only') {
            await sendSigning({
              package: packageInfo.root,
              sourceCommit: SOURCE_COMMIT,
              runtimeOrigin: origin,
              manifestSha: packageInfo.manifestSha,
              wireSha: packageInfo.wireSha,
              signedPath: join(packageInfo.root, 'legacy-resigned.shortcut'),
              manualResign: authorization,
            });
            assert.equal(providerCalls, 1);
            assert.deepEqual(privateStore.objects.get(MIGRATED_AMBIGUITY_KEY), migratedBytes);
          }
        }
      } finally {
        process.env = originalEnv;
        globalThis.fetch = originalFetch;
      }
    });
  }
});

test('manual re-sign result identity is checked in private R2 before upload and completion', async () => {
  const packageInfo = await makePackage();
  const runtimeOrigin = 'https://ci-fixture.example.com';
  const priorKey = operationKey(logicalSourceIdentity(BUILD_MANIFEST), createSha256(Buffer.from(runtimeOrigin)));
  const requestId = 'b4e10675-0e56-4f8f-9c0b-93058500a020';
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const statuses = [{ id: 1, context: statusContext(priorKey), state: 'success' }];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: SOURCE_COMMIT,
    GITHUB_ACTOR: 'reviewer-user',
    GITHUB_RUN_ID: 'manual-result-run',
    GITHUB_RUN_ATTEMPT: '1',
    RUNNER_TEMP: packageInfo.root,
    WHT_RUNTIME_ORIGIN: runtimeOrigin,
    WHT_MANUAL_RESIGN_REQUESTED: 'true',
    WHT_MANUAL_RESIGN_REQUEST_ID: requestId,
    WHT_MANUAL_RESIGN_SOURCE_COMMIT: SOURCE_COMMIT,
    WHT_MANUAL_RESIGN_REASON: 'delivery-verification-failed',
    WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: 'true',
  };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith('https://api.github.test')) {
      if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), statuses, statuses.length));
      const body = JSON.parse(options.body);
      const status = { id: statuses.length + 1, context: body.context, state: body.state, description: body.description };
      const previous = statuses.findIndex(item => item.context === status.context);
      if (previous === -1) statuses.push(status);
      else statuses[previous] = status;
      return responseJson(status);
    }
    return new Response(Buffer.from('AEA1manual-result'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  };
  try {
    const authorization = manualResignAuthorizationFromEnvironment(process.env, SOURCE_COMMIT);
    const resignKey = manualResignOperationKey(priorKey, requestId);
    const args = {
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin,
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
      signedPath: join(packageInfo.root, 'manual-result.shortcut'),
      manualResign: authorization,
    };
    await prepareSigning(args);
    await sendSigning(args);
    const resultObjectKey = resultMetadataObjectKey(resignKey);
    const resultBytes = Buffer.from(privateStore.objects.get(resultObjectKey));
    const result = JSON.parse(resultBytes.toString('utf8'));
    assert.equal(result.schemaVersion, 2);
    assert.equal(result.operationKey, resignKey);
    assert.equal(result.logicalOperationKey, priorKey);
    assert.equal(result.authorizationIdSha256, authorization.requestIdSha256);
    assert.equal(result.authorizationActor, 'reviewer-user');
    assert.equal(result.runId, 'manual-result-run');
    assert.equal(result.runAttempt, 1);
    assert.equal(JSON.stringify(statuses).includes(requestId), false);
    assert.equal(JSON.stringify(statuses).includes(authorization.reason), false);
    assert.equal(JSON.stringify(statuses).includes('reviewer-user'), false);

    privateStore.objects.set(resultObjectKey, Buffer.from(JSON.stringify({ ...result, authorizationActor: 'other-user' })));
    await assert.rejects(() => publishSigning(args), /private signing result does not match its intent/);
    privateStore.objects.set(resultObjectKey, resultBytes);
    await publishSigning(args);
    await completeSigning(args);
    assert.ok(privateStore.objects.has(result.signedShortcutObjectKey));
    const latest = JSON.parse(privateStore.objects.get('latest.json').toString('utf8'));
    assert.deepEqual(latest, { commit: SOURCE_COMMIT, sha256: result.signedShortcutSha256, key: result.signedShortcutObjectKey });
    assert.equal(statuses.find(status => status.context === manualResignStatusContext(authorization.requestIdSha256))?.state, 'success');
    assert.equal(statuses.find(status => status.context === manualResignStatusContext(authorization.requestIdSha256))?.description, 'Manual re-sign delivery verified');
    assert.equal(statuses.find(status => status.context === manualResignSendStatusContext(authorization.requestIdSha256))?.description, 'Manual re-sign provider POST consumed');
    const manualStatusDescriptions = statuses
      .filter(status => status.context === manualResignStatusContext(authorization.requestIdSha256)
        || status.context === manualResignSendStatusContext(authorization.requestIdSha256))
      .map(status => status.description)
      .join('\n');
    for (const privatePackageIdentity of [
      priorKey,
      resignKey,
      logicalSourceIdentity(BUILD_MANIFEST),
      packageInfo.manifestSha,
      packageInfo.wireSha,
      createSha256(Buffer.from(runtimeOrigin)),
    ]) {
      assert.equal(manualStatusDescriptions.includes(privatePackageIdentity), false);
    }
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('signed response validation requires an AEA1 container', () => {
  assert.deepEqual(validateSignedShortcut(Buffer.from('AEA1synthetic')), { valid: true });
  assert.throws(() => validateSignedShortcut(Buffer.from('not-signed')), /AEA1/);
});

test('HubSign transport is one fixed direct POST with no credentials or redirects', () => {
  const wire = Buffer.from('{"request":"synthetic"}', 'utf8');
  const options = hubSignRequestOptions(wire);
  assert.equal(options.method, 'POST');
  assert.equal(options.redirect, 'manual');
  assert.equal(options.headers['content-type'], 'application/json');
  assert.equal(options.headers['content-length'], String(wire.length));
  assert.equal(options.headers['user-agent'], 'cherri/v2.3.0');
  assert.equal(options.body, wire);
  assert.equal(Object.hasOwn(options.headers, 'authorization'), false);
});

test('unknown, redirected, or non-binary provider responses are permanently unacceptable', () => {
  assert.equal(hubSignResponseAccepted(200, 'application/octet-stream'), true);
  assert.equal(hubSignResponseAccepted(200, 'application/octet-stream; charset=binary'), true);
  assert.equal(hubSignResponseAccepted(200, 'application/x-plist'), true);
  assert.equal(hubSignResponseAccepted(200, 'application/x-apple-shortcut'), true);
  assert.equal(hubSignResponseAccepted(202, 'application/octet-stream'), false);
  assert.equal(hubSignResponseAccepted(503, 'application/octet-stream'), false);
  assert.equal(hubSignResponseAccepted(200, 'text/plain'), false);
});

test('existing status blocks duplicate preparation', () => {
  const key = operationKey(logicalSourceIdentity(BUILD_MANIFEST), TARGET_ORIGIN_SHA256);
  const context = statusContext(key);
  assert.equal(statusBlocks([{ context, state: 'pending' }], context), true);
  assert.equal(statusBlocks([{ context: 'other-context', state: 'success' }], context), false);
});
