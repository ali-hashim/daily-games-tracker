import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { migrateAmbiguityState } from "../phase5a-migrate-r2-state.mjs";

const workflow = await readFile(
  new URL("../../../.github/workflows/shortcut-r2-migrate.yml", import.meta.url),
  "utf8",
).catch(() => null);

const originalPlaintext = Buffer.from(
  '{"schemaVersion":1,"status":"ambiguous","logicalSourceIdentity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","wireSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}',
  "utf8",
);
const signingKey = "synthetic-signing-key";
const envelope = {
  version: 1,
  algorithm: "aes-256-gcm",
  nonce: "fixture",
  ciphertext: "fixture",
  tag: "fixture",
};
const encodedRecord = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64");

function migrationEnvironment(overrides = {}) {
  return {
    WHT_CONFIRM_MIGRATION: "true",
    WHT_AMBIGUOUS_SIGNING_RECORD: encodedRecord,
    WHT_SIGNING_OUTPUT_KEY: signingKey,
    WHT_LEGACY_DECODER_PATH: "synthetic-legacy-decoder.mjs",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_SHA: "1234567890123456789012345678901234567890",
    GITHUB_RUN_ATTEMPT: "1",
    ...overrides,
  };
}

function fakeLegacyDecoder({ bytes = originalPlaintext } = {}) {
  return {
    decodeMigratedAmbiguityRecord(encoded, key) {
      assert.equal(encoded, encodedRecord);
      assert.equal(key, signingKey);
      return JSON.parse(bytes.toString("utf8"));
    },
    decryptPrivateEnvelope(value, key) {
      assert.deepEqual(value, envelope);
      assert.equal(key, signingKey);
      return Buffer.from(bytes);
    },
  };
}

function fakeStore({ existing = null, reportedDigest } = {}) {
  let stored = existing === null ? null : Buffer.from(existing);
  const calls = [];
  return {
    calls,
    getStored: () => stored,
    async getOptional(key) {
      calls.push({ method: "getOptional", key });
      return stored === null ? null : Buffer.from(stored);
    },
    async putVerified(key, bytes, contentType) {
      calls.push({ method: "putVerified", key, contentType, bytes: Buffer.from(bytes) });
      stored = Buffer.from(bytes);
      return reportedDigest ?? createHash("sha256").update(bytes).digest("hex");
    },
  };
}

async function migrate(options) {
  return migrateAmbiguityState(options);
}

test("migration writes the exact validated legacy plaintext to the private R2 object", async () => {
  const store = fakeStore();

  const result = await migrate({
    env: migrationEnvironment(),
    store,
    legacyDecoder: fakeLegacyDecoder(),
  });

  assert.deepEqual(
    store.calls.map(({ method, key }) => [method, key]),
    [
      ["getOptional", "signing/migrated-ambiguity.json"],
      ["putVerified", "signing/migrated-ambiguity.json"],
    ],
  );
  assert.equal(store.calls[1].contentType, "application/json");
  assert.deepEqual(store.calls[1].bytes, originalPlaintext);
  assert.deepEqual(store.getStored(), originalPlaintext);
  assert.deepEqual(result, {
    sha256: createHash("sha256").update(originalPlaintext).digest("hex"),
    alreadyPresent: false,
  });
});

test("migration rejects an existing different private record without overwriting it", async () => {
  const previous = Buffer.from('{"status":"existing private state"}', "utf8");
  const store = fakeStore({ existing: previous });

  await assert.rejects(
    migrate({ env: migrationEnvironment(), store, legacyDecoder: fakeLegacyDecoder() }),
    /Private signing state migration failed closed/,
  );
  assert.deepEqual(
    store.calls.map(({ method }) => method),
    ["getOptional"],
  );
  assert.deepEqual(store.getStored(), previous);
});

test("migration is idempotent when the exact plaintext record is already present", async () => {
  const store = fakeStore({ existing: originalPlaintext });

  const result = await migrate({
    env: migrationEnvironment(),
    store,
    legacyDecoder: fakeLegacyDecoder(),
  });

  assert.deepEqual(
    store.calls.map(({ method }) => method),
    ["getOptional"],
  );
  assert.equal(result.alreadyPresent, true);
  assert.equal(result.sha256, createHash("sha256").update(originalPlaintext).digest("hex"));
});

test("migration rejects an unconfirmed, non-main, non-dispatch, or rerun context before private storage access", async (t) => {
  const mutations = [
    ["missing confirmation", { WHT_CONFIRM_MIGRATION: "false" }],
    ["non-manual event", { GITHUB_EVENT_NAME: "push" }],
    ["non-main ref", { GITHUB_REF: "refs/heads/topic" }],
    ["rerun attempt", { GITHUB_RUN_ATTEMPT: "2" }],
  ];

  for (const [label, overrides] of mutations) {
    await t.test(label, async () => {
      const store = fakeStore();
      await assert.rejects(
        migrate({
          env: migrationEnvironment(overrides),
          store,
          legacyDecoder: fakeLegacyDecoder(),
        }),
        /Private signing state migration failed closed/,
      );
      assert.deepEqual(store.calls, []);
    });
  }
});

test("migration refuses malformed decoded data and does not write it", async () => {
  const extraField = Buffer.from(
    '{"schemaVersion":1,"status":"ambiguous","logicalSourceIdentity":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","wireSha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","other":"not permitted"}',
    "utf8",
  );
  const store = fakeStore();

  await assert.rejects(
    migrate({
      env: migrationEnvironment(),
      store,
      legacyDecoder: fakeLegacyDecoder({ bytes: extraField }),
    }),
    /Private signing state migration failed closed/,
  );
  assert.deepEqual(store.calls, []);
});

test("migration fails closed when R2 readback digest does not match exact plaintext", async () => {
  const store = fakeStore({ reportedDigest: "0".repeat(64) });

  await assert.rejects(
    migrate({ env: migrationEnvironment(), store, legacyDecoder: fakeLegacyDecoder() }),
    /Private signing state migration failed closed/,
  );
  assert.deepEqual(
    store.calls.map(({ method }) => method),
    ["getOptional", "putVerified"],
  );
});

function verifyWorkflow(source) {
  const required = [
    "  workflow_dispatch:",
    "      confirm_migration:\n        description:",
    "        required: true",
    "        type: boolean\n        default: false",
    "permissions:\n  contents: read\n  actions: read",
    "if: github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main' && inputs.confirm_migration == true",
    "environment: wht-shortcut-signing",
    "cancel-in-progress: false",
    "uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2",
    "fetch-depth: 0",
    "persist-credentials: false",
    "node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production",
    "5aa8b090221a89791486a328fba49b7e2144873f:daily-games-tracker/scripts/phase5a_actions_signing.mjs",
    "WHT_AMBIGUOUS_SIGNING_RECORD: ${{ secrets.WHT_AMBIGUOUS_SIGNING_RECORD }}",
    "WHT_SIGNING_OUTPUT_KEY: ${{ secrets.WHT_SIGNING_OUTPUT_KEY }}",
    "WHT_R2_ACCOUNT_ID: ${{ secrets.WHT_R2_ACCOUNT_ID }}",
    "WHT_R2_BUCKET_NAME: ${{ secrets.WHT_R2_BUCKET_NAME }}",
    "WHT_R2_ACCESS_KEY_ID: ${{ secrets.WHT_R2_ACCESS_KEY_ID }}",
    "WHT_R2_SECRET_ACCESS_KEY: ${{ secrets.WHT_R2_SECRET_ACCESS_KEY }}",
    "node daily-games-tracker/scripts/phase5a-migrate-r2-state.mjs",
    ">/dev/null 2>&1",
  ];
  for (const text of required)
    assert.ok(source.includes(text), `workflow is missing protected migration behavior: ${text}`);
  assert.doesNotMatch(
    source,
    /statuses:\s*write|HubSign|upload-artifact|WHT_AMBIGUITY_RECORD_SHA256/,
  );
  assert.ok(
    source.indexOf("--production") < source.indexOf("name: Load the immutable legacy decoder"),
  );
  assert.ok(
    source.indexOf("name: Load the immutable legacy decoder") <
      source.indexOf("name: Migrate the original ambiguity record"),
  );
  assert.ok(
    source.indexOf("name: Migrate the original ambiguity record") <
      source.indexOf("WHT_AMBIGUOUS_SIGNING_RECORD:"),
  );
  return true;
}

test("manual migration workflow is guarded and keeps private output suppressed", () => {
  assert.equal(typeof workflow, "string", "manual migration workflow should exist");
  assert.equal(verifyWorkflow(workflow), true);
});

for (const [name, before, after] of [
  ["default-off confirmation", "default: false", "default: true"],
  ["protected main ref", "github.ref == 'refs/heads/main'", "github.ref == 'refs/heads/any'"],
  ["environment gate", "environment: wht-shortcut-signing", "environment: unprotected"],
  [
    "approval proof",
    "node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production",
    "true",
  ],
  [
    "immutable legacy decoder source",
    "5aa8b090221a89791486a328fba49b7e2144873f:daily-games-tracker/scripts/phase5a_actions_signing.mjs",
    "HEAD:daily-games-tracker/scripts/phase5a_actions_signing.mjs",
  ],
  [
    "legacy key secret",
    "WHT_SIGNING_OUTPUT_KEY: ${{ secrets.WHT_SIGNING_OUTPUT_KEY }}",
    "WHT_SIGNING_OUTPUT_KEY: unset",
  ],
  [
    "R2 secret key",
    "WHT_R2_SECRET_ACCESS_KEY: ${{ secrets.WHT_R2_SECRET_ACCESS_KEY }}",
    "WHT_R2_SECRET_ACCESS_KEY: unset",
  ],
  ["private output suppression", ">/dev/null 2>&1", ""],
]) {
  test(`workflow mutation is rejected when ${name} changes`, { skip: workflow === null }, () => {
    assert.ok(workflow.includes(before), `mutation fixture for ${name} should match`);
    assert.throws(() => verifyWorkflow(workflow.replace(before, after)));
  });
}
