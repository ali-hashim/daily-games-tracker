import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const manifestVerifier = resolve(repoRoot, 'daily-games-tracker/scripts/phase5a-verify-manifest.mjs');
const toolchainVerifier = resolve(repoRoot, 'daily-games-tracker/scripts/phase5a-verify-toolchain.mjs');
const lockPath = resolve(repoRoot, 'daily-games-tracker/shortcut/cherri-migration/toolchain.lock.json');
const workflowPath = resolve(repoRoot, '.github/workflows/cherri-alert-experiment.yml');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const run = (script, args) => spawnSync(process.execPath, [script, ...args], { cwd: repoRoot, encoding: 'utf8' });
const output = result => `${result.stdout ?? ''}${result.stderr ?? ''}`;

async function makeManifestFixture() {
  const directory = await mkdtemp(join(tmpdir(), 'phase5a-verifier-'));
  const lockBytes = await readFile(lockPath);
  const lock = JSON.parse(lockBytes);
  const prepared = {
    compiler: lock.compiler,
    go: lock.go,
    flags: lock.build.flags,
    capture: lock.capture,
    experiments: ['01-alert.cherri', '02-input.cherri', '03-safari.cherri', '04-capture.cherri', '05-json.cherri', '06-routing.cherri', '07-completion.cherri']
      .map((source, index) => ({ source, sha256: String(index + 1).repeat(64) })),
  };
  const artifactNames = [
    'Cherri-alert-probe_unsigned.shortcut',
    'Cherri-alert-probe-second_unsigned.shortcut',
    'Cherri-probe-02_unsigned.shortcut',
    'Cherri-probe-03_unsigned.shortcut',
    'Cherri-probe-04_unsigned.shortcut',
    'Cherri-probe-05_unsigned.shortcut',
    'Cherri-probe-06_unsigned.shortcut',
    'Cherri-probe-07_unsigned.shortcut',
  ];
  const artifacts = [];
  for (const name of artifactNames) {
    const bytes = Buffer.from(`synthetic unsigned artifact: ${name}\n`, 'utf8');
    await writeFile(join(directory, name), bytes);
    artifacts.push({ name, sha256: digest(bytes) });
  }
  const manifest = {
    applicationCommit: 'e82c5b2b60546d743db344a65deb51663e8b1aba',
    toolchainLockSha256: digest(lockBytes),
    compiler: prepared.compiler,
    go: prepared.go,
    buildFlags: prepared.flags,
    capture: prepared.capture,
    sourceHashes: prepared.experiments,
    artifacts,
    signing: 'not performed',
    nativeExecution: 'not performed',
  };
  const preparedPath = join(directory, 'prepared-source-manifest.json');
  const manifestPath = join(directory, 'manifest.json');
  await writeFile(preparedPath, `${JSON.stringify(prepared, null, 2)}\n`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, manifestPath, preparedPath, manifest };
}

async function rewriteManifest(fixture, mutate) {
  const manifest = JSON.parse(await readFile(fixture.manifestPath, 'utf8'));
  mutate(manifest);
  await writeFile(fixture.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

function verifyManifest(fixture) {
  return run(manifestVerifier, [
    '--manifest', fixture.manifestPath,
    '--artifacts', fixture.directory,
    '--prepared', fixture.preparedPath,
    '--lock', lockPath,
  ]);
}

test('manifest verifier accepts a complete unsigned eight-artifact fixture', async () => {
  const fixture = await makeManifestFixture();
  try {
    const result = verifyManifest(fixture);
    assert.equal(result.status, 0, output(result));
    assert.match(result.stdout, /artifactCount/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('manifest verifier rejects changed artifact bytes and stale digest', async () => {
  const fixture = await makeManifestFixture();
  try {
    await writeFile(join(fixture.directory, fixture.manifest.artifacts[0].name), 'mutated bytes\n');
    const result = verifyManifest(fixture);
    assert.notEqual(result.status, 0);
    assert.match(output(result), /artifact hash mismatch/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('manifest verifier rejects a corrupted artifact digest', async () => {
  const fixture = await makeManifestFixture();
  try {
    await rewriteManifest(fixture, manifest => { manifest.artifacts[0].sha256 = '0'.repeat(64); });
    const result = verifyManifest(fixture);
    assert.notEqual(result.status, 0);
    assert.match(output(result), /artifact hash mismatch/);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
});

test('manifest verifier rejects a source omission, lock drift, and path escape', async t => {
  for (const [name, mutate, pattern] of [
    ['source omission', manifest => manifest.sourceHashes.pop(), /source hashes differ/],
    ['lock drift', manifest => { manifest.toolchainLockSha256 = '0'.repeat(64); }, /lock SHA-256 does not match/],
    ['artifact count', manifest => manifest.artifacts.pop(), /exactly 8 unsigned artifacts/],
    ['path escape', manifest => { manifest.artifacts[0].name = '../outside.shortcut'; }, /path must stay inside/],
  ]) {
    await t.test(name, async () => {
      const fixture = await makeManifestFixture();
      try {
        await rewriteManifest(fixture, mutate);
        const result = verifyManifest(fixture);
        assert.notEqual(result.status, 0);
        assert.match(output(result), pattern);
      } finally {
        await rm(fixture.directory, { recursive: true, force: true });
      }
    });
  }
});

function verifyToolchain(workflow) {
  return run(toolchainVerifier, ['--lock', lockPath, '--workflow', workflow]);
}

test('toolchain verifier accepts the maintained workflow', async () => {
  const result = verifyToolchain(workflowPath);
  assert.equal(result.status, 0, output(result));
});

test('toolchain verifier rejects runner drift, unknown action pins, and a missing per-invocation flag', async t => {
  const original = await readFile(workflowPath, 'utf8');
  const directory = await mkdtemp(join(tmpdir(), 'phase5a-workflow-'));
  try {
    for (const [name, mutate, pattern] of [
      ['runner drift', text => text.replace('runs-on: ubuntu-24.04', 'runs-on: ubuntu-latest'), /workflow runner/],
      ['unknown action', text => `${text}\n      - uses: actions/cache@${'a'.repeat(40)}\n`, /action not present in the lock/],
      ['missing compiler flag', text => text.replace('"$RUNNER_TEMP/cherri" "$dir/01-alert.cherri" --skip-sign --derive-uuids', '"$RUNNER_TEMP/cherri" "$dir/01-alert.cherri"'), /missing locked flag/],
      ['missing strict current inspector guard', text => text.replace('inspector_flags+=(--strict-current)', 'inspector_flags+=(--experiment-only)'), /strict-current/],
      ['missing full client repeat', text => text.replace('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "https://runtime.example.invalid" --output "$RUNNER_TEMP/upload-second"', 'removed-full-client-repeat'), /second complete unsigned client/],
      ['missing full client comparison', text => text.replace('phase5a_compare_upload.py', 'removed-comparison.py'), /same sanitized test origin/],
      ['missing complete-client comparison origin', text => text.replace('phase5a_compare_upload.py "$RUNNER_TEMP/upload-first/Upload To WHT_unsigned.shortcut" "$RUNNER_TEMP/upload-second/Upload To WHT_unsigned.shortcut" --runtime-origin "https://runtime.example.invalid"', 'phase5a_compare_upload.py "$RUNNER_TEMP/upload-first/Upload To WHT_unsigned.shortcut" "$RUNNER_TEMP/upload-second/Upload To WHT_unsigned.shortcut"'), /same sanitized test origin/],
      ['signing transfer in routine workflow', text => text.replace('phase5a_upload_signing.py prepare', 'phase5a_upload_signing.py send'), /must not send a signing payload/],
    ]) {
      await t.test(name, async () => {
        const candidate = join(directory, `${name.replaceAll(' ', '-')}.yml`);
        await writeFile(candidate, mutate(original));
        const result = verifyToolchain(candidate);
        assert.notEqual(result.status, 0);
        assert.match(output(result), pattern);
      });
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
