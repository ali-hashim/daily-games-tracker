import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  artifactNames,
  decodeMigratedAmbiguityRecord,
  decryptPrivateEnvelope,
  encodeMigratedAmbiguityRecord,
  encryptPrivateEnvelope,
  hubSignResponseAccepted,
  hubSignRequestOptions,
  logicalSourceIdentity,
  migratedRecordBlocks,
  operationKey,
  prepareSigning,
  sendSigning,
  statusBlocks,
  statusContext,
  validateSignedShortcut,
} from '../phase5a_actions_signing.mjs';

const SOURCE_COMMIT = '7bc830a62a7d5448ffc87e6fa70d1c8bef5ae584';
const TARGET_ORIGIN_SHA256 = 'a'.repeat(64);
const OUTPUT_KEY = Buffer.alloc(32, 7).toString('base64');
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

function createSha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('AES-GCM private envelope round-trips and rejects tampering', () => {
  const plaintext = Buffer.from(JSON.stringify({ status: 'pending', sourceCommit: SOURCE_COMMIT }));
  const envelope = encryptPrivateEnvelope(plaintext, OUTPUT_KEY);
  assert.equal(envelope.algorithm, 'aes-256-gcm');
  assert.deepEqual(decryptPrivateEnvelope(envelope, OUTPUT_KEY), plaintext);
  assert.equal(envelope.ciphertext.includes(plaintext.toString('utf8')), false);
  const tampered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
  assert.throws(() => decryptPrivateEnvelope(tampered, OUTPUT_KEY), /authentication failed/);
});

test('operation identity is stable across unrelated commits and target changes', () => {
  const sourceIdentity = logicalSourceIdentity(BUILD_MANIFEST);
  const key = operationKey(sourceIdentity, TARGET_ORIGIN_SHA256);
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(statusContext(key), `wht-shortcut-signing/${key}`);
  assert.deepEqual(artifactNames(key), {
    intent: `wht-signing-intent-${key}`,
    result: `wht-signing-result-${key}`,
  });
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
  const intentPath = join(packageInfo.root, 'intent.enc');
  const outputPath = join(packageInfo.root, 'outputs.txt');
  const anchor = '1'.repeat(40);
  const outputKey = OUTPUT_KEY;
  const migratedRecord = encodeMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: '0'.repeat(64),
    wireSha256: 'f'.repeat(64),
  }, outputKey);
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
    WHT_SIGNING_OUTPUT_KEY: outputKey,
    WHT_AMBIGUOUS_SIGNING_RECORD: migratedRecord,
    RUNNER_TEMP: packageInfo.root,
    GITHUB_OUTPUT: outputPath,
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
    return responseJson({ state: body.state, context: body.context, id: 1000 });
  };
  try {
    await prepareSigning({
      package: packageInfo.root,
      sourceCommit: SOURCE_COMMIT,
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
      outputKey,
      intentPath,
    });
    assert.equal((await stat(intentPath)).isFile(), true);
    assert.equal(calls.filter(call => call.options.method === 'GET').length, 2);
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
    assert.match(calls[0].url, /per_page=100&page=1$/);
    assert.match(calls[1].url, /per_page=100&page=2$/);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('prepare and send accept exactly full 100 and 200 status pages without an extra read', async (t) => {
  for (const totalCount of [100, 200]) {
    await t.test(`exactly ${totalCount} statuses`, async () => {
      const packageInfo = await makePackage();
      const intentPath = join(packageInfo.root, 'intent.enc');
      const resultPath = join(packageInfo.root, 'result.enc');
      const outputKey = OUTPUT_KEY;
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
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: anchor,
        WHT_SIGNING_OUTPUT_KEY: outputKey,
        WHT_AMBIGUOUS_SIGNING_RECORD: encodeMigratedAmbiguityRecord({ schemaVersion: 1, status: 'ambiguous', logicalSourceIdentity: '0'.repeat(64), wireSha256: 'f'.repeat(64) }, outputKey),
        RUNNER_TEMP: packageInfo.root,
      };
      globalThis.fetch = async (url, options = {}) => {
        const text = String(url);
        calls.push({ url: text, options });
        if (text.startsWith('https://api.github.test')) {
          if (options.method === 'GET') {
            const page = Number(new URL(text).searchParams.get('page'));
            return responseJson(statusPage(anchor, statuses.slice((page - 1) * 100, page * 100), totalCount));
          }
          const body = JSON.parse(options.body);
          return responseJson({ state: body.state, context: body.context, id: 1000 });
        }
        providerCalls += 1;
        assert.equal(text, 'https://hubsign.routinehub.services/sign');
        return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
      };
      try {
        await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha, outputKey, intentPath });
        await sendSigning({ package: packageInfo.root, intentPath, resultPath, outputKey });
        assert.equal(calls.filter(call => call.options.method === 'GET').length, totalCount / 100);
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
      const intentPath = join(packageInfo.root, 'intent.enc');
      const outputKey = OUTPUT_KEY;
      const originalEnv = { ...process.env };
      const originalFetch = globalThis.fetch;
      const calls = [];
      process.env = {
        ...process.env,
        GITHUB_TOKEN: 'synthetic-token',
        GITHUB_API_URL: 'https://api.github.test',
        GITHUB_REPOSITORY: 'owner/repo',
        WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
        WHT_SIGNING_OUTPUT_KEY: outputKey,
        WHT_AMBIGUOUS_SIGNING_RECORD: encodeMigratedAmbiguityRecord({ schemaVersion: 1, status: 'ambiguous', logicalSourceIdentity: '0'.repeat(64), wireSha256: 'f'.repeat(64) }, outputKey),
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
          outputKey,
          intentPath,
        }), /status|GitHub private state request failed|anchor|page|malformed|invalid/i);
        await assert.rejects(() => stat(intentPath));
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
  const intentPath = join(packageInfo.root, 'intent.enc');
  const outputKey = OUTPUT_KEY;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  const calls = [];
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    WHT_SIGNING_OUTPUT_KEY: outputKey,
    WHT_AMBIGUOUS_SIGNING_RECORD: encodeMigratedAmbiguityRecord({ schemaVersion: 1, status: 'ambiguous', logicalSourceIdentity: '0'.repeat(64), wireSha256: 'f'.repeat(64) }, outputKey),
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
      outputKey,
      intentPath,
    }), /acknowledged|ack/i);
    await assert.rejects(() => stat(intentPath));
    assert.equal(calls.filter(call => call.options.method === 'POST').length, 1);
    assert.equal(calls.some(call => String(call.url).includes('hubsign')), false);
  } finally {
    process.env = originalEnv;
    globalThis.fetch = originalFetch;
  }
});

test('prepare and send use the frozen package after a complete status-ledger read', async () => {
  const packageInfo = await makePackage();
  const intentPath = join(packageInfo.root, 'intent.enc');
  const resultPath = join(packageInfo.root, 'result.enc');
  const outputKey = OUTPUT_KEY;
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    WHT_SIGNING_OUTPUT_KEY: outputKey,
    WHT_AMBIGUOUS_SIGNING_RECORD: encodeMigratedAmbiguityRecord({ schemaVersion: 1, status: 'ambiguous', logicalSourceIdentity: '0'.repeat(64), wireSha256: 'f'.repeat(64) }, outputKey),
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.startsWith('https://api.github.test')) {
      if (options.method === 'GET') return responseJson(statusPage('1'.repeat(40), [], 0));
      const body = JSON.parse(options.body);
      return responseJson({ state: body.state, context: body.context, id: 8 });
    }
    providerCalls += 1;
    assert.equal(text, 'https://hubsign.routinehub.services/sign');
    assert.equal(options.method, 'POST');
    return new Response(Buffer.from('AEA1synthetic-signed'), { status: 200, headers: { 'content-type': 'application/octet-stream' } });
  };
  try {
    await prepareSigning({ package: packageInfo.root, sourceCommit: SOURCE_COMMIT, runtimeOrigin: 'https://ci-fixture.example.com', manifestSha: packageInfo.manifestSha, wireSha: packageInfo.wireSha, outputKey, intentPath });
    await sendSigning({ package: packageInfo.root, intentPath, resultPath, outputKey });
    assert.equal(providerCalls, 1);
    assert.equal((await stat(resultPath)).isFile(), true);
    assert.match((await readFile(resultPath, 'utf8')), /aes-256-gcm/);
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
  const encoded = encodeMigratedAmbiguityRecord(record, OUTPUT_KEY);
  assert.match(encoded, /^[A-Za-z0-9+/]+=*$/);
  assert.deepEqual(decodeMigratedAmbiguityRecord(encoded, OUTPUT_KEY), record);
  assert.throws(() => decodeMigratedAmbiguityRecord(encoded, Buffer.alloc(32, 8).toString('base64')), /authentication failed/);
});

test('prepare blocks the migrated logical package before status or provider calls when commit and wire vary', async () => {
  const packageInfo = await makePackage();
  const intentPath = join(packageInfo.root, 'intent.enc');
  const outputKey = OUTPUT_KEY;
  const record = encodeMigratedAmbiguityRecord({
    schemaVersion: 1,
    status: 'ambiguous',
    logicalSourceIdentity: logicalSourceIdentity(BUILD_MANIFEST),
    wireSha256: 'f'.repeat(64),
  }, outputKey);
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let calls = 0;
  process.env = {
    ...process.env,
    GITHUB_TOKEN: 'synthetic-token',
    GITHUB_API_URL: 'https://api.github.test',
    GITHUB_REPOSITORY: 'owner/repo',
    WHT_SIGNING_STATUS_ANCHOR: '1'.repeat(40),
    WHT_SIGNING_OUTPUT_KEY: outputKey,
    WHT_AMBIGUOUS_SIGNING_RECORD: record,
    RUNNER_TEMP: packageInfo.root,
  };
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('migrated ambiguity must stop before status or provider calls');
  };
  try {
    await assert.rejects(() => prepareSigning({
      package: packageInfo.root,
      sourceCommit: '2'.repeat(40),
      runtimeOrigin: 'https://ci-fixture.example.com',
      manifestSha: packageInfo.manifestSha,
      wireSha: packageInfo.wireSha,
      outputKey,
      intentPath,
    }), /known ambiguous logical package/);
    assert.equal(calls, 0);
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
  assert.equal(options.body, wire);
  assert.equal(Object.hasOwn(options.headers, 'authorization'), false);
});

test('unknown, redirected, or non-binary provider responses are permanently unacceptable', () => {
  assert.equal(hubSignResponseAccepted(200, 'application/octet-stream'), true);
  assert.equal(hubSignResponseAccepted(200, 'application/octet-stream; charset=binary'), true);
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
