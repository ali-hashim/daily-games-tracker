import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This is a local/static guard for the checked-in workflow. It deliberately
// performs no network, compiler, signing, or deployment operation.
const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(scriptRoot, '..');
const args = process.argv.slice(2);

const valueFor = flag => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

const lockArg = valueFor('--lock');
const workflowArg = valueFor('--workflow');
if (!lockArg || !workflowArg) {
  throw new Error('Usage: node phase5a-verify-toolchain.mjs --lock PATH --workflow PATH');
}

const lockPath = resolve(repoRoot, lockArg);
const workflowPath = resolve(repoRoot, workflowArg);
const lock = JSON.parse(await readFile(lockPath, 'utf8'));
const workflow = await readFile(workflowPath, 'utf8');
const failures = [];

const expect = (condition, message) => {
  if (!condition) failures.push(message);
};
const escaped = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = value => workflow.includes(value);

expect(lock.schemaVersion === 1, 'toolchain lock schemaVersion must be 1');
expect(lock.compiler?.commit && /^[0-9a-f]{40}$/.test(lock.compiler.commit), 'lock compiler commit must be a full SHA-1');
expect(lock.go?.version && /^1\.\d+\.\d+$/.test(lock.go.version), 'lock Go version must be a complete version');
expect(lock.build?.runner, 'lock must declare a runner');
expect(Array.isArray(lock.build?.flags) && lock.build.flags.includes('--skip-sign'), 'lock must require --skip-sign');
expect(Array.isArray(lock.build?.flags) && lock.build.flags.includes('--derive-uuids'), 'lock must require --derive-uuids');

const runner = workflow.match(/runs-on:\s*([^\s#]+)/)?.[1];
expect(runner === lock.build?.runner, `workflow runner ${runner ?? '<missing>'} differs from lock ${lock.build?.runner ?? '<missing>'}`);

const compilerCommit = workflow.match(/CHERRI_COMMIT:\s*([0-9a-f]{40})/)?.[1];
expect(compilerCommit === lock.compiler?.commit, 'workflow compiler commit differs from lock');

const goVersion = workflow.match(/go-version:\s*["']?([^\s"']+)["']?/)?.[1];
expect(goVersion === lock.go?.version, 'workflow Go version differs from lock');

for (const flag of lock.build?.flags ?? []) {
  expect(has(flag), `workflow is missing required compiler flag ${flag}`);
}

for (const action of ['checkout', 'setupGo', 'uploadArtifact']) {
  const entry = lock.actions?.[action];
  expect(entry?.repository && entry?.commit, `lock action ${action} is incomplete`);
  if (entry?.repository && entry?.commit) {
    const match = workflow.match(new RegExp(`uses:\\s*${escaped(entry.repository)}@([0-9a-f]{40})`));
    expect(match?.[1] === entry.commit, `workflow ${entry.repository} pin differs from lock`);
  }
}

const lockedActionsByRepository = new Map(
  Object.values(lock.actions ?? [])
    .filter(action => action?.repository && action?.commit)
    .map(action => [action.repository, action.commit]),
);
const actionLines = workflow.split(/\r?\n/).filter(line => /\buses:\s*/.test(line));
for (const line of actionLines) {
  const match = line.match(/\buses:\s*([^@#\s]+)@([^\s#]+)/);
  expect(match && /^[0-9a-f]{40}$/.test(match[2]), `workflow action must use a full commit pin: ${line.trim()}`);
  if (match) {
    expect(lockedActionsByRepository.has(match[1]), `workflow uses an action not present in the lock: ${match[1]}`);
    expect(lockedActionsByRepository.get(match[1]) === match[2], `workflow action pin differs from lock: ${match[1]}`);
  }
}

const compilerInvocations = workflow.split(/\r?\n/).filter(line => /^\s*["']?\$RUNNER_TEMP\/cherri["']?\s/.test(line));
expect(compilerInvocations.length > 0, 'workflow must invoke the pinned compiler at least once');
for (const line of compilerInvocations) {
  const flags = [...line.matchAll(/\s(--[a-z0-9-]+)/gi)].map(match => match[1]);
  for (const flag of lock.build?.flags ?? []) {
    expect(flags.includes(flag), `compiler invocation is missing locked flag ${flag}: ${line.trim()}`);
  }
  expect(flags.every(flag => lock.build.flags.includes(flag)), `compiler invocation includes an unlocked flag: ${line.trim()}`);
}

expect(has('permissions:\n  contents: read'), 'workflow must grant contents: read only');
expect(has('persist-credentials: false'), 'checkout must not persist credentials');
expect(has('retention-days: 1'), 'unsigned artifacts must retain for one day');
expect(has('timeout-minutes: 15'), 'build job must have a bounded timeout');
expect(!has('--sign'), 'routine unsigned workflow must not invoke --sign');
expect(!/\bsecrets\./i.test(workflow), 'routine unsigned workflow must not reference repository secrets');
expect(has('.github/workflows/cherri-alert-experiment.yml'), 'workflow must trigger on its own changes');
expect(has('daily-games-tracker/shortcut/cherri-migration/toolchain.lock.json'), 'workflow must trigger on lock changes');
expect(has('daily-games-tracker/scripts/phase5a-verify-toolchain.mjs'), 'workflow must trigger on verifier changes');
expect(has('daily-games-tracker/scripts/phase5a-verify-manifest.mjs'), 'workflow must trigger on manifest verifier changes');
expect(has('daily-games-tracker/scripts/phase5a_prepare_signing_package.py'), 'workflow must trigger on offline signing-package changes');
expect(has('daily-games-tracker/scripts/phase5a-compile-runtime-fixtures.mjs'), 'workflow must trigger on runtime fixture compiler changes');
expect(has('daily-games-tracker/scripts/phase5a*.py'), 'workflow must trigger on Phase 5A Python helper changes');
expect(has('daily-games-tracker/scripts/PHASE5A_*.md'), 'workflow must trigger on Phase 5A helper documentation changes');
expect(has('daily-games-tracker/scripts/PHASE_5A_*.md'), 'workflow must trigger on offline signing-package documentation changes');
expect(has('daily-games-tracker/scripts/inspect_phase5a_shortcut.py'), 'workflow must trigger on inspector changes');
expect(has('daily-games-tracker/scripts/tests/**'), 'workflow must trigger on inspector regression fixture changes');
expect(has('daily-games-tracker/scripts/tests/fixtures/**'), 'workflow must trigger on Phase 5A fixture changes');
expect(has('inspector_flags+=(--strict-current)'), 'workflow must pass --strict-current to the maintained 06/07 inspector checks');
expect(has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --output "$RUNNER_TEMP/upload-first"'), 'workflow must build the first complete unsigned client');
expect(has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --output "$RUNNER_TEMP/upload-second"'), 'workflow must build the second complete unsigned client');
expect(has('phase5a_compare_upload.py "$RUNNER_TEMP/upload-first/Upload to WHT_unsigned.shortcut" "$RUNNER_TEMP/upload-second/Upload to WHT_unsigned.shortcut"'), 'workflow must compare the complete-client native contract');
expect(has('phase5a_upload_signing.py prepare --build-directory "$RUNNER_TEMP/upload-first"'), 'workflow must freeze the inspected complete-client review package offline');
expect(!has('phase5a_upload_signing.py send'), 'routine workflow must not send a signing payload');

const capturePath = lock.capture?.source;
if (capturePath && lock.capture?.sha256) {
  const capture = await readFile(resolve(repoRoot, capturePath));
  const digest = createHash('sha256').update(capture).digest('hex');
  expect(digest === lock.capture.sha256, `capture SHA-256 ${digest} differs from lock ${lock.capture.sha256}`);
  expect(capture.byteLength === lock.capture.bytes, `capture byte count ${capture.byteLength} differs from lock ${lock.capture.bytes}`);
} else {
  failures.push('lock capture source and SHA-256 are required');
}

if (failures.length) {
  throw new Error(`Phase 5A toolchain verification failed:\n- ${failures.join('\n- ')}`);
}

console.log(JSON.stringify({
  lock: lockPath,
  workflow: workflowPath,
  compilerCommit: lock.compiler.commit,
  goVersion: lock.go.version,
  runner: lock.build.runner,
  flags: lock.build.flags,
  actionPins: Object.fromEntries(Object.entries(lock.actions).map(([name, action]) => [name, action.commit])),
  captureSha256: lock.capture.sha256,
  status: 'workflow and lock agree; unsigned-only guard passed',
}, null, 2));
