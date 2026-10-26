import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifySigningWorkflow } from '../phase5a-verify-signing-workflow.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/shortcut-sign-disabled.yml', import.meta.url), 'utf8');
const lock = JSON.parse(await readFile(new URL('../../shortcut/cherri-migration/toolchain.lock.json', import.meta.url), 'utf8'));
test('protected full-client workflow retains all boundaries', () => {
  assert.equal(verifySigningWorkflow(workflow, lock), true);
});
const mutations = [
  ['automatic main trigger', '  push:\n    branches: [main]', '  removed-trigger:\n    branches: [main]'],
  ['main/manual job guard', "github.event_name == 'workflow_dispatch'", "github.event_name == 'push'"],
  ['environment protection', 'environment: wht-shortcut-signing', 'environment: unprotected'],
  ['source allowlist', 'test "$REVIEWED_APPLICATION_COMMIT" = "$GITHUB_SHA"', 'true'],
  ['unset source stop', 'test "$REVIEWED_APPLICATION_COMMIT" !=', 'test "$REVIEWED_APPLICATION_COMMIT" ='],
  ['reviewed commit secret', 'REVIEWED_APPLICATION_COMMIT: ${{ secrets.WHT_REVIEWED_APPLICATION_COMMIT }}', 'REVIEWED_APPLICATION_COMMIT: https://runtime.example.invalid'],
  ['runtime origin secret', 'WHT_RUNTIME_ORIGIN: ${{ secrets.WHT_RUNTIME_ORIGIN }}', 'WHT_RUNTIME_ORIGIN: https://runtime.example.invalid'],
  ['private receipt secret', 'WHT_SIGNING_RECEIPT_URL: ${{ secrets.WHT_SIGNING_RECEIPT_URL }}', 'WHT_SIGNING_RECEIPT_URL: https://private.example.invalid/receipt'],
['reserved origin guard', 'assert host != "localhost" and not host.endswith((".invalid", ".example", ".test"))', 'assert True'],
  ['action pin', '11bd71901bbe5b1630ceea73d27597364c9af683', 'v4'],
  ['Python assertion enforcement', 'PYTHONOPTIMIZE: "0"', 'PYTHONOPTIMIZE: "1"'],
  ['compiler checkout identity', 'test "$(git -C "$source_dir" rev-parse HEAD)" = "$CHERRI_COMMIT"', 'true'],
  ['module verification', 'go -C "$source_dir" mod verify', 'true'],
  ['nonreserved first build', '--require-nonreserved-origin --output "$RUNNER_TEMP/upload-first"', '--output "$RUNNER_TEMP/upload-first"'],
  ['nonreserved second build', '--require-nonreserved-origin --output "$RUNNER_TEMP/upload-second"', '--output "$RUNNER_TEMP/upload-second"'],
  ['fresh freeze', 'phase5a_upload_signing.py prepare', 'echo prepare'],
  ['durable sign operation', '            sign', '            claim'],
  ['runtime origin binding', '--runtime-origin "$WHT_RUNTIME_ORIGIN"', '--runtime-origin "https://runtime.example.invalid"'],
  ['wire approval', '--expected-wire-sha256 "$wire_sha256"', ''],
  ['manifest approval', '--expected-manifest-sha256 "$manifest_sha256"', ''],
  ['private receipt persistence', '> "$RUNNER_TEMP/private-signing-receipt.json"', ''],
  ['public artifact', 'actions/checkout@', 'actions/upload-artifact@'],
];
for (const [name, before, after] of mutations) {
  test(`refuses removed or changed ${name}`, () => {
    assert.ok(workflow.includes(before));
    assert.throws(() => verifySigningWorkflow(workflow.replace(before, after), lock));
  });
}
