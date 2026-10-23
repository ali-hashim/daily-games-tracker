import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

const args = process.argv.slice(2);
const valueFor = flag => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const manifestArg = valueFor('--manifest');
const artifactsArg = valueFor('--artifacts');
const preparedArg = valueFor('--prepared');
const lockArg = valueFor('--lock');
if (!manifestArg || !artifactsArg || !preparedArg || !lockArg) {
  throw new Error('Usage: node phase5a-verify-manifest.mjs --manifest PATH --artifacts DIR --prepared PATH --lock PATH');
}

const manifest = JSON.parse(await readFile(resolve(manifestArg), 'utf8'));
const prepared = JSON.parse(await readFile(resolve(preparedArg), 'utf8'));
const lockPath = resolve(lockArg);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const sha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
const digest = async path => createHash('sha256').update(await readFile(path)).digest('hex');
const canonical = value => JSON.stringify(value);

// This validates hashes, structure, and provenance metadata only. It does not
// inspect binary plist contents for secrets, device codes, or native behavior.
expect(manifest.signing === 'not performed', 'unsigned manifest must state signing was not performed');
expect(manifest.nativeExecution === 'not performed', 'manifest must state native execution was not performed');
expect(sha256(manifest.toolchainLockSha256), 'manifest must include the toolchain lock SHA-256');
expect(sha256(manifest.capture?.sha256), 'manifest must include the capture SHA-256');
expect(manifest.compiler?.commit && /^[0-9a-f]{40}$/.test(manifest.compiler.commit), 'manifest must include a full compiler commit');
expect(Array.isArray(manifest.sourceHashes) && manifest.sourceHashes.length > 0, 'manifest must include source hashes');
expect(Array.isArray(manifest.artifacts) && manifest.artifacts.length > 0, 'manifest must include output artifact hashes');

const lockSha256 = await digest(lockPath);
expect(manifest.toolchainLockSha256 === lockSha256, 'manifest toolchain lock SHA-256 does not match the supplied lock');
expect(manifest.compiler?.commit === lock.compiler?.commit, 'manifest compiler commit differs from lock');
expect(manifest.go?.version === lock.go?.version, 'manifest Go version differs from lock');
expect(canonical(manifest.buildFlags) === canonical(lock.build?.flags), 'manifest compiler flags differ from lock');
expect(manifest.capture?.sha256 === lock.capture?.sha256, 'manifest capture hash differs from lock');
expect(manifest.capture?.bytes === lock.capture?.bytes, 'manifest capture byte count differs from lock');

expect(manifest.compiler?.commit === prepared.compiler?.commit, 'manifest compiler commit differs from prepared source manifest');
expect(manifest.go?.version === prepared.go?.version, 'manifest Go version differs from prepared source manifest');
expect(canonical(manifest.buildFlags) === canonical(prepared.flags), 'manifest compiler flags differ from prepared source manifest');
expect(manifest.capture?.sha256 === prepared.capture?.sha256, 'manifest capture hash differs from prepared source manifest');

const preparedSources = Array.isArray(prepared.experiments) ? prepared.experiments : [];
const manifestSources = Array.isArray(manifest.sourceHashes) ? manifest.sourceHashes : [];
const sourceShape = entries => entries.map(entry => ({ source: entry?.source, sha256: entry?.sha256 })).sort((a, b) => String(a.source).localeCompare(String(b.source)));
expect(canonical(sourceShape(manifestSources)) === canonical(sourceShape(preparedSources)), 'manifest source hashes differ from prepared source manifest');
for (const source of manifestSources) {
  expect(typeof source?.source === 'string' && source.source.length > 0, 'each source hash must name a source');
  expect(sha256(source?.sha256), `source ${source?.source ?? '<missing>'} must have a SHA-256`);
}

const artifactRoot = resolve(artifactsArg);
const expectedArtifactCount = preparedSources.length + 1; // alert probe is compiled twice for reproducibility.
expect(manifest.artifacts.length === expectedArtifactCount, `manifest must contain exactly ${expectedArtifactCount} unsigned artifacts`);
const artifactNames = new Set();
for (const artifact of manifest.artifacts ?? []) {
  expect(artifact?.name && sha256(artifact.sha256), `artifact ${artifact?.name ?? '<missing>'} must have a SHA-256`);
  if (artifact?.name && typeof artifact.name === 'string') {
    const artifactPath = resolve(artifactRoot, artifact.name);
    const relativeName = relative(artifactRoot, artifactPath);
    expect(!isAbsolute(artifact.name) && relativeName === artifact.name && !artifact.name.split(/[\\/]/).includes('..'), `artifact path must stay inside output directory: ${artifact.name}`);
    expect(artifact.name.endsWith('_unsigned.shortcut'), `artifact must be unsigned: ${artifact.name}`);
    expect(!artifactNames.has(artifact.name), `manifest contains a duplicate artifact: ${artifact.name}`);
    artifactNames.add(artifact.name);
    try {
      const actualSha256 = await digest(artifactPath);
      expect(actualSha256 === artifact.sha256, `artifact hash mismatch for ${artifact.name}`);
    } catch {
      failures.push(`manifest artifact is missing from output directory: ${artifact.name}`);
    }
  }
}
try {
  const outputUnsignedNames = (await readdir(artifactRoot, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.endsWith('_unsigned.shortcut'))
    .map(entry => entry.name)
    .sort();
  const declaredUnsignedNames = [...artifactNames].sort();
  expect(outputUnsignedNames.length === expectedArtifactCount, `output directory must contain exactly ${expectedArtifactCount} unsigned artifacts`);
  expect(canonical(outputUnsignedNames) === canonical(declaredUnsignedNames), 'output unsigned artifacts must exactly match manifest declarations');
} catch (error) {
  failures.push(`unable to enumerate output artifacts: ${error.message}`);
}

if (failures.length) {
  throw new Error(`Phase 5A manifest verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(JSON.stringify({
  artifactCount: manifest.artifacts.length,
  sourceCount: manifest.sourceHashes.length,
  captureSha256: manifest.capture.sha256,
  toolchainLockSha256: manifest.toolchainLockSha256,
  status: 'unsigned manifest hash/provenance metadata passed; binary secret/native inspection is outside this verifier',
}, null, 2));
