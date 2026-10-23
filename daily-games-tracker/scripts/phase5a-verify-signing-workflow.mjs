// Static local preparation check only; no execution, network or signing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function verifySigningWorkflow(workflow, lock) {
  const has = text => assert.ok(workflow.includes(text), `Missing signing guard: ${text}`);
  has('if: ${{ false && inputs.confirm_external_signing }}');
  has('REVIEWED_APPLICATION_COMMIT:');
  has('test "$REVIEWED_APPLICATION_COMMIT" != \'0000000000000000000000000000000000000000\'');
  const sourceGuard = 'test "$TRUSTED_APPLICATION_COMMIT" = "$REVIEWED_APPLICATION_COMMIT"';
  has(sourceGuard);
  assert.ok(workflow.indexOf(sourceGuard) < workflow.indexOf('uses: actions/checkout@'));
  has('test "$GITHUB_EVENT_NAME" = workflow_dispatch');
  has('test "$GITHUB_REF" = refs/heads/main');
  has('permissions:\n  contents: read');
  has('persist-credentials: false');
  has('ref: ${{ inputs.trusted_application_commit }}');
  has(`CHERRI_COMMIT: ${lock.compiler.commit}`);
  has('test "$(git -C "$source_dir" rev-parse HEAD)" = "$CHERRI_COMMIT"');
  has('export GOTOOLCHAIN=local');
  has('go -C "$source_dir" mod verify');
  assert.match(workflow, new RegExp(`go-version: ["']?${lock.go.version.replaceAll('.', '\\.')}`));
  has(`runs-on: ${lock.build.runner}`);
  const actionPins = new Map(Object.values(lock.actions).map(item => [item.repository, item.commit]));
  for (const match of workflow.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    assert.equal(match[2], actionPins.get(match[1]), `Unexpected action pin ${match[1]}`);
    assert.match(match[2], /^[0-9a-f]{40}$/);
  }
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --output "$RUNNER_TEMP/upload-first"');
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --output "$RUNNER_TEMP/upload-second"');
  has('phase5a_compare_upload.py');
  const freeze = 'phase5a_upload_signing.py prepare --build-directory "$RUNNER_TEMP/upload-first" --output "$RUNNER_TEMP/upload-review-package"';
  const send = 'phase5a_upload_signing.py send';
  has(freeze); has(send);
  assert.ok(workflow.indexOf(freeze) < workflow.indexOf(send));
  has('--expected-manifest-sha256 "$APPROVED_MANIFEST_SHA256"');
  has('--expected-wire-sha256 "$APPROVED_WIRE_SHA256"');
  assert.match(workflow, /^\s+PYTHONOPTIMIZE: ["']?0["']?\s*$/m);
  has('if: ${{ always() }}');
  has('retention-days: 1');
  has('run: test -s "$RUNNER_TEMP/upload-signing-evidence/Upload to WHT_signed.shortcut"');
  assert.doesNotMatch(workflow, /^\s+(pull_request|pull_request_target|push):/m);
  assert.doesNotMatch(workflow, /secrets\.|download-artifact@|signing-package-probes/);
  // Expressions may enter through quoted environment values, never shell code.
  for (const block of workflow.matchAll(/\brun: \|\n((?: {10}[^\n]*\n|\n)*)/g)) {
    assert.ok(!block[1].includes('${{'), 'Workflow expression interpolated into shell');
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const workflow = await readFile(resolve(root, '../.github/workflows/shortcut-sign-disabled.yml'), 'utf8');
  const lock = JSON.parse(await readFile(resolve(root, 'shortcut/cherri-migration/toolchain.lock.json'), 'utf8'));
  verifySigningWorkflow(workflow, lock);
  console.log('Disabled full-client signing preparation guards passed; no execution performed.');
}
