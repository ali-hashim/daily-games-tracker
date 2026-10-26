import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { convertV4MiniflareOptions, Miniflare, NoOpLog } from 'miniflare';
import ts from 'typescript';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const WORKER_DIR = resolve(TEST_DIR, '..');
const APP_DIR = resolve(WORKER_DIR, '../..');
const WORKER_ENTRY = resolve(WORKER_DIR, 'src/index.ts');
const WORKER_SOURCE = ts.transpileModule(await readFile(WORKER_ENTRY, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const TEST_ROOT = join(APP_DIR, 'tmp');
const TOKEN = 'test-worker-token';
const SOURCE_COMMIT = 'a'.repeat(40);
const TARGET_ORIGIN = 'https://wht.example.com';
const TARGET_ORIGIN_SHA256 = sha256(TARGET_ORIGIN);
const MANIFEST_SHA256 = 'b'.repeat(64);
const SIGNED_BYTES = new TextEncoder().encode('AEA1synthetic-signed-shortcut');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function operationKey(sourceCommit = SOURCE_COMMIT, targetOriginSha256 = TARGET_ORIGIN_SHA256) {
  return sha256(`wht-shortcut-signing-v2\n${sourceCommit}\n${targetOriginSha256}`);
}

function makePayload({
  sourceCommit = SOURCE_COMMIT,
  manifestSha256 = MANIFEST_SHA256,
  shortcut = '<plist version="1.0"><dict/></plist>',
} = {}) {
  const wire = JSON.stringify({ shortcut, shortcutName: 'Upload To WHT' })
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
  return {
    schemaVersion: 2,
    operation: 'wht-shortcut-signing',
    status: 'sign',
    idempotencyKey: operationKey(sourceCommit),
    sourceCommit,
    targetOriginSha256: TARGET_ORIGIN_SHA256,
    manifestSha256,
    wireSha256: sha256(wire),
    shortcutName: 'Upload To WHT',
    hubsignWireBase64: Buffer.from(wire, 'utf8').toString('base64'),
  };
}

function isSandboxLoopbackFailure(error) {
  const messages = [];
  let current = error;
  while (current && messages.length < 5) {
    messages.push(String(current.message ?? current));
    current = current.cause;
  }
  const message = messages.join(' ');
  return message.includes('EACCES') && message.includes('127.0.0.1');
}

async function createHarness({ root = undefined, calls = [], delayMs = 0, timeoutMs = 30_000 } = {}) {
  await mkdir(TEST_ROOT, { recursive: true });
  const persistTo = root ?? await mkdtemp(join(TEST_ROOT, 'private-signing-worker-'));
  const options = convertV4MiniflareOptions({
    script: WORKER_SOURCE,
    modules: true,
    name: 'wht-private-signing-worker-test',
    compatibilityDate: '2026-10-20',
    bindings: {
      WHT_SIGNING_RECEIPT_TOKEN: TOKEN,
      HUBSIGN_ENDPOINT: 'https://hubsign.routinehub.services/sign',
      HUBSIGN_TIMEOUT_MS: String(timeoutMs),
    },
    durableObjects: {
      SIGNING_OPERATIONS: { className: 'SigningOperation', useSQLite: true },
    },
    outboundService: async request => {
      calls.push(new Uint8Array(await request.arrayBuffer()));
      if (delayMs) await delay(delayMs);
      return new Response(SIGNED_BYTES, {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
      });
    },
    port: 0,
    log: new NoOpLog(),
    unsafeRegisterWorker: false,
    resourcePersistencePath: persistTo,
  });
  const mf = new Miniflare(options);
  await mf.ready;
  return { mf, root: persistTo, calls, delayMs, timeoutMs };
}

async function restartHarness(harness) {
  await harness.mf.dispose();
  const restarted = await createHarness({
    root: harness.root,
    calls: harness.calls,
    delayMs: harness.delayMs,
    timeoutMs: harness.timeoutMs,
  });
  harness.mf = restarted.mf;
}

async function responseValue(response) {
  const bytes = new Uint8Array(await response.arrayBuffer());
  let body;
  try { body = JSON.parse(new TextDecoder().decode(bytes)); } catch { body = undefined; }
  return { response, body, bytes };
}

async function post(harness, payload, token = TOKEN) {
  const response = await harness.mf.dispatchFetch('https://private-worker.test/sign', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return responseValue(response);
}

async function postWithClientDrop(harness, payload, token = TOKEN) {
  const controller = new AbortController();
  const pending = harness.mf.dispatchFetch('https://private-worker.test/sign', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: controller.signal,
  });
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    return await responseValue(await pending);
  } catch (error) {
    if (error?.name === 'AbortError' || error?.cause?.code === 'ABORT_ERR') return undefined;
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function recover(harness, idempotencyKey, token = TOKEN) {
  const response = await harness.mf.dispatchFetch(
    `https://private-worker.test/recover?idempotencyKey=${idempotencyKey}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  return responseValue(response);
}

async function closeHarness(harness) {
  await harness.mf.dispose();
  await rm(harness.root, { recursive: true, force: true });
}

async function skipIfSandboxed(t, error) {
  if (!isSandboxLoopbackFailure(error)) throw error;
  t.skip('local sandbox blocks Miniflare workerd loopback; CI runs this real runtime suite');
  return true;
}

test('workerd SQLite Durable Object serializes concurrent claims and rejects changed metadata', async t => {
  const harness = await createHarness({ delayMs: 100 });
  try {
    let responses;
    try {
      const payload = makePayload();
      responses = await Promise.all([post(harness, payload), post(harness, payload)]);
    } catch (error) {
      if (await skipIfSandboxed(t, error)) return;
    }
    assert.deepEqual(responses.map(response => response.response.status).sort(), [201, 409]);
    assert.equal(harness.calls.length, 1);
    const recovered = await post(harness, makePayload());
    assert.equal(recovered.response.status, 200);
    const changedManifest = await post(harness, makePayload({ manifestSha256: 'd'.repeat(64) }));
    assert.equal(changedManifest.response.status, 409);
    const changedWire = await post(harness, makePayload({ shortcut: '<plist><dict><key>changed</key></dict></plist>' }));
    assert.equal(changedWire.response.status, 409);
    assert.equal(harness.calls.length, 1);
  } finally {
    await closeHarness(harness);
  }
});

test('workerd SQLite Durable Object recovers signed bytes after dropped response and restart', async t => {
  const harness = await createHarness({ delayMs: 25 });
  try {
    let first;
    try {
      first = await postWithClientDrop(harness, makePayload());
    } catch (error) {
      if (await skipIfSandboxed(t, error)) return;
    }
    assert.ok(first === undefined || first.response.status === 201);
    assert.equal(harness.calls.length, 1);
    await restartHarness(harness);
    const recoveredReceipt = await post(harness, makePayload());
    assert.equal(recoveredReceipt.response.status, 200);
    assert.equal(recoveredReceipt.body.status, 'completed');
    const recoveredBytes = await recover(harness, operationKey());
    assert.equal(recoveredBytes.response.status, 200);
    assert.equal(recoveredBytes.response.headers.get('cache-control'), 'no-store');
    assert.equal(recoveredBytes.response.headers.get('content-type'), 'application/octet-stream');
    assert.equal(recoveredBytes.response.headers.get('x-wht-idempotency-key'), operationKey());
    assert.equal(recoveredBytes.response.headers.get('x-wht-signed-sha256'), sha256(SIGNED_BYTES));
    assert.deepEqual(recoveredBytes.bytes, SIGNED_BYTES);
    const replayedBytes = await recover(harness, operationKey());
    assert.deepEqual(replayedBytes.bytes, SIGNED_BYTES);
    assert.equal(harness.calls.length, 1);
  } finally {
    await closeHarness(harness);
  }
});

test('workerd SQLite Durable Object keeps ambiguous provider intent across restart and never resends', async t => {
  const harness = await createHarness({ delayMs: 200, timeoutMs: 50 });
  try {
    let first;
    try {
      first = await post(harness, makePayload());
    } catch (error) {
      if (await skipIfSandboxed(t, error)) return;
    }
    assert.equal(first.response.status, 502);
    assert.equal(first.body.error, 'ambiguous_signer_result');
    assert.equal(harness.calls.length, 1);
    await restartHarness(harness);
    const second = await post(harness, makePayload());
    assert.equal(second.response.status, 409);
    assert.equal(second.body.error, 'operation_ambiguous');
    const blockedRecovery = await recover(harness, operationKey());
    assert.equal(blockedRecovery.response.status, 409);
    assert.equal(blockedRecovery.body.error, 'operation_ambiguous');
    assert.equal(harness.calls.length, 1);
  } finally {
    await closeHarness(harness);
  }
});

test('workerd private endpoint authenticates recovery and validates wire before provider call', async t => {
  const harness = await createHarness();
  try {
    let unauthorized;
    try {
      unauthorized = await post(harness, makePayload(), 'wrong-token');
    } catch (error) {
      if (await skipIfSandboxed(t, error)) return;
    }
    assert.equal(unauthorized.response.status, 401);
    const unauthorizedRecovery = await recover(harness, operationKey(), 'wrong-token');
    assert.equal(unauthorizedRecovery.response.status, 401);

    const malformed = makePayload();
    malformed.hubsignWireBase64 = Buffer.from('{"shortcut":"tampered"}', 'utf8').toString('base64');
    const rejected = await post(harness, malformed);
    assert.equal(rejected.response.status, 400);
    assert.equal(harness.calls.length, 0);

    const completed = await post(harness, makePayload());
    assert.equal(completed.response.status, 201);
    const validRecovery = await recover(harness, operationKey());
    assert.equal(validRecovery.response.status, 200);
    assert.deepEqual(validRecovery.bytes, SIGNED_BYTES);
    assert.equal(harness.calls.length, 1);
  } finally {
    await closeHarness(harness);
  }
});
