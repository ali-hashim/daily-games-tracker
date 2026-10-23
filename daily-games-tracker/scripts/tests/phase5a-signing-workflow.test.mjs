import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifySigningWorkflow } from '../phase5a-verify-signing-workflow.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/shortcut-sign-disabled.yml', import.meta.url), 'utf8');
const lock = JSON.parse(await readFile(new URL('../../shortcut/cherri-migration/toolchain.lock.json', import.meta.url), 'utf8'));
test('canonical disabled full-client workflow retains all boundaries', () => {
  assert.equal(verifySigningWorkflow(workflow, lock), true);
});
const mutations = [
  ['permanent false guard', 'false && inputs.confirm_external_signing', 'inputs.confirm_external_signing'],
  ['source allowlist', 'test "$TRUSTED_APPLICATION_COMMIT" = "$REVIEWED_APPLICATION_COMMIT"', 'true'],
  ['unset source stop', 'test "$REVIEWED_APPLICATION_COMMIT" !=', 'test "$REVIEWED_APPLICATION_COMMIT" ='],
  ['action pin', '11bd71901bbe5b1630ceea73d27597364c9af683', 'v4'],
  ['Python assertion enforcement', 'PYTHONOPTIMIZE: "0"', 'PYTHONOPTIMIZE: "1"'],
  ['compiler checkout identity', 'test "$(git -C "$source_dir" rev-parse HEAD)" = "$CHERRI_COMMIT"', 'true'],
  ['module verification', 'go -C "$source_dir" mod verify', 'true'],
  ['fresh freeze', 'phase5a_upload_signing.py prepare', 'echo prepare'],
  ['wire approval', '--expected-wire-sha256 "$APPROVED_WIRE_SHA256"', ''],
  ['manifest approval', '--expected-manifest-sha256 "$APPROVED_MANIFEST_SHA256"', ''],
  ['shell input interpolation', '          set -euo pipefail', '          echo ${{ inputs.trusted_application_commit }}'],
];
for (const [name, before, after] of mutations) {
  test(`refuses removed or changed ${name}`, () => {
    assert.ok(workflow.includes(before));
    assert.throws(() => verifySigningWorkflow(workflow.replace(before, after), lock));
  });
}
