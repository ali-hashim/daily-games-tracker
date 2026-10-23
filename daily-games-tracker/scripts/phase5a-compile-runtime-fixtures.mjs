import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

// Compile only the generated runtime fixture sources. The seven core probes
// and their eight-artifact manifest remain a separate workflow contract.
// This helper is credential-free and performs no network, signing, or native
// execution operation.
const args = process.argv.slice(2);
const valueFor = flag => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};
const rootArg = valueFor('--root');
const compilerArg = valueFor('--compiler');
const captureArg = valueFor('--capture');
const outputArg = valueFor('--output');
const lockArg = valueFor('--lock');
const python = valueFor('--python') ?? 'python3';
if (!rootArg || !compilerArg || !captureArg || !outputArg || !lockArg) {
  throw new Error('Usage: node phase5a-compile-runtime-fixtures.mjs --root PATH --compiler PATH --capture PATH --output DIR --lock PATH [--python PATH]');
}

const migrationRoot = resolve(rootArg);
const compiler = resolve(compilerArg);
const capture = resolve(captureArg);
const outputRoot = resolve(outputArg);
const lockPath = resolve(lockArg);
const fixturesRoot = join(migrationRoot, 'out', 'fixtures');
const inspector = join(migrationRoot, 'build', 'inspect-shortcut.py');
const flags = ['--skip-sign', '--derive-uuids'];
const fixtureCases = [
  ...[
    'validation-already-submitted',
    'validation-valid-submit-submitted',
    'validation-valid-submit-already-submitted',
    'validation-valid-submit-error',
    'validation-valid-submit-update-required',
    'validation-valid-submit-unknown',
    'validation-error',
    'validation-update-required',
    'validation-unknown',
  ].map(name => `06-routing/${name}.cherri`),
  ...['present', 'empty', 'null', 'missing'].map(name => `07-completion/${name}.cherri`),
];

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const safeRelative = (base, target) => {
  const value = relative(base, target).replaceAll('\\', '/');
  if (!value || value.startsWith('../') || value.includes('/../') || value.includes('..\\') || value.startsWith('/')) {
    throw new Error(`Unsafe generated path: ${value}`);
  }
  return value;
};
const run = (command, commandArgs, cwd) => {
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8', shell: false, timeout: 120000 });
  if (result.error || result.status !== 0) {
    const detail = [result.error?.message, result.stderr, result.stdout]
      .filter(value => typeof value === 'string' && value.length > 0)
      .join('\n')
      .trim();
    throw new Error(`${command} failed (exit ${result.status ?? 'unknown'}): ${detail || 'no process output'}`);
  }
  return result.stdout;
};
const listFiles = async directory => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};
const writeChecksums = async (root, names) => {
  const hashes = {};
  for (const name of [...names].sort()) hashes[name] = sha256(await readFile(join(root, name)));
  const lines = Object.entries(hashes).map(([name, digest]) => `${digest}  ${name}`);
  await writeFile(join(root, 'RUNTIME-FIXTURES-SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
  return hashes;
};

const lock = JSON.parse(await readFile(lockPath, 'utf8'));
if (lock.compiler?.commit !== 'd2072c62ea708e7727099fab94fa28b0bcec747b') {
  throw new Error('Runtime fixture compiler commit does not match the maintained lock.');
}
if (JSON.stringify(lock.build?.flags) !== JSON.stringify(flags)) {
  throw new Error('Runtime fixture compiler flags do not match the maintained lock.');
}
const sourceFiles = await listFiles(fixturesRoot);
const sourceNames = sourceFiles.map(file => safeRelative(fixturesRoot, file)).filter(name => extname(name) === '.cherri').sort();
if (JSON.stringify(sourceNames) !== JSON.stringify([...fixtureCases].sort())) {
  throw new Error(`Expected exactly 13 generated runtime fixture sources; found ${sourceNames.length}: ${sourceNames.join(', ')}`);
}
const captureBytes = await readFile(capture);
const expectedCapture = lock.capture ?? {};
if (sha256(captureBytes) !== expectedCapture.sha256 || captureBytes.length !== expectedCapture.bytes) {
  throw new Error('Capture source does not match the maintained toolchain lock.');
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });
const workRoot = join(outputRoot, '.work');
await mkdir(workRoot, { recursive: true });
const artifactNames = [];
const reportNames = [];
const fixtures = [];
try {
  for (const sourceName of sourceNames) {
    const source = join(fixturesRoot, sourceName);
    const experiment = sourceName.startsWith('06-routing/') ? '06' : '07';
    const work = await mkdtemp(join(workRoot, basename(source, '.cherri') + '-'));
    const isolatedSource = join(work, basename(source));
    await copyFile(source, isolatedSource);
    run(compiler, [isolatedSource, ...flags], dirname(compiler));
    const created = (await readdir(work)).filter(name => name.endsWith('_unsigned.shortcut'));
    if (created.length !== 1) throw new Error(`Expected one unsigned artifact for ${sourceName}; found ${created.length}.`);
    const artifact = join(work, created[0]);
    const inspectorArgs = [inspector, artifact, '--experiment', experiment, '--capture', capture];
    inspectorArgs.push('--strict-current');
    const report = JSON.parse(run(python, inspectorArgs, migrationRoot));
    const artifactBytes = await readFile(artifact);
    const artifactRelative = `artifacts/${sourceName.slice(0, -'.cherri'.length)}.shortcut`;
    const reportRelative = `reports/${sourceName.slice(0, -'.cherri'.length)}.json`;
    const artifactPath = join(outputRoot, artifactRelative);
    const reportPath = join(outputRoot, reportRelative);
    await mkdir(dirname(artifactPath), { recursive: true });
    await mkdir(dirname(reportPath), { recursive: true });
    await copyFile(artifact, artifactPath);
    const reportBytes = jsonBytes(report);
    await writeFile(reportPath, reportBytes);
    if (report.structuralChecks !== 'passed' || report.sha256 !== sha256(artifactBytes)) {
      throw new Error(`Canonical inspector did not pass ${sourceName}.`);
    }
    artifactNames.push(artifactRelative);
    reportNames.push(reportRelative);
    fixtures.push({
      source: sourceName,
      probe: experiment,
      sourceSha256: sha256(await readFile(source)),
      artifact: { path: artifactRelative, bytes: artifactBytes.length, sha256: sha256(artifactBytes), signing: 'not performed' },
      inspection: { path: reportRelative, bytes: reportBytes.length, sha256: sha256(reportBytes), structuralChecks: report.structuralChecks, nativeExecution: report.nativeExecution },
    });
  }
} finally {
  await rm(workRoot, { recursive: true, force: true });
}

const manifest = {
  schemaVersion: 1,
  status: 'runtime fixture sources compiled and structurally inspected; native execution unproven',
  signing: 'not performed',
  transfer: 'not performed',
  nativeExecution: 'not performed',
  compiler: {
    commit: lock.compiler.commit,
    binarySha256: sha256(await readFile(compiler)),
    flags,
  },
  toolchainLock: { path: safeRelative(resolve(migrationRoot, '..', '..', '..'), lockPath), sha256: sha256(await readFile(lockPath)) },
  capture: { path: safeRelative(resolve(migrationRoot, '..', '..', '..'), capture), bytes: captureBytes.length, sha256: sha256(captureBytes) },
  fixtureCount: fixtures.length,
  fixtures,
  checksums: 'RUNTIME-FIXTURES-SHA256SUMS',
};
const manifestRelative = 'manifest.json';
const packageFiles = [...artifactNames, ...reportNames];
manifest.fileHashes = Object.fromEntries(packageFiles.sort().map(name => [name, sha256(readFileSync(join(outputRoot, name)))]));
await writeFile(join(outputRoot, manifestRelative), jsonBytes(manifest));
await writeChecksums(outputRoot, [...packageFiles, manifestRelative]);
console.log(JSON.stringify({ output: outputRoot, fixtureCount: fixtures.length, status: manifest.status }, null, 2));
