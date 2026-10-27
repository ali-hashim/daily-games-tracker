import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifySigningWorkflow } from '../phase5a-verify-signing-workflow.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/shortcut-sign-disabled.yml', import.meta.url), 'utf8');
const lock = JSON.parse(await readFile(new URL('../../shortcut/cherri-migration/toolchain.lock.json', import.meta.url), 'utf8'));

test('protected Actions-only workflow retains all boundaries', () => {
  assert.equal(verifySigningWorkflow(workflow, lock), true);
});

test('the exact approval check precedes any package build or provider transfer', () => {
  const check = workflow.indexOf('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production');
  assert.ok(check > workflow.indexOf('name: Check out only the protected reviewed source commit'));
  assert.ok(check < workflow.indexOf('name: Rebuild pinned compiler with verified module graph'));
  assert.match(workflow, /\n  actions: read\n/);
  assert.match(workflow, /WHT_REVIEWED_APPLICATION_COMMIT/);
});

const expression = '$' + '{{';
const mutations = [
  ['automatic main trigger', '  push:\n    branches: [main]', '  removed-trigger:\n    branches: [main]'],
  ['environment protection', 'environment: wht-shortcut-signing', 'environment: unprotected'],
  ['approval verification', 'node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production', 'true'],
  ['approval read permission', '  actions: read', '  actions: none'],
  ['source allowlist', 'test "$REVIEWED_APPLICATION_COMMIT" = "$GITHUB_SHA"', 'true'],
  ['unset source stop', 'test "$REVIEWED_APPLICATION_COMMIT" !=', 'test "$REVIEWED_APPLICATION_COMMIT" ='],
  ['reviewed commit secret', 'REVIEWED_APPLICATION_COMMIT: ' + expression + ' secrets.WHT_REVIEWED_APPLICATION_COMMIT }}', 'REVIEWED_APPLICATION_COMMIT: https://runtime.example.invalid'],
  ['runtime origin secret', 'WHT_RUNTIME_ORIGIN: ' + expression + ' secrets.WHT_RUNTIME_ORIGIN }}', 'WHT_RUNTIME_ORIGIN: https://runtime.example.invalid'],
  ['output encryption secret', 'WHT_SIGNING_OUTPUT_KEY: ' + expression + ' secrets.WHT_SIGNING_OUTPUT_KEY }}', 'WHT_SIGNING_OUTPUT_KEY: unset'],
  ['migrated ambiguity secret', 'WHT_AMBIGUOUS_SIGNING_RECORD: ' + expression + ' secrets.WHT_AMBIGUOUS_SIGNING_RECORD }}', 'WHT_AMBIGUOUS_SIGNING_RECORD: unset'],
  ['ambiguous recovery input', 'confirm_ambiguous_recovery:', 'confirm_ambiguous_recovery_removed:'],
  ['ambiguous recovery authorization secret', 'WHT_AMBIGUOUS_RECOVERY_AUTH: ' + expression + ' secrets.WHT_AMBIGUOUS_RECOVERY_AUTH }}', 'WHT_AMBIGUOUS_RECOVERY_AUTH: unset'],
  ['recovery first attempt guard', 'test "$GITHUB_RUN_ATTEMPT" = 1', 'test "$GITHUB_RUN_ATTEMPT" = 2'],
  ['manual recovery guard', 'test "$GITHUB_EVENT_NAME" = workflow_dispatch', 'test "$GITHUB_EVENT_NAME" = push'],
  ['status permission', '  statuses: write', '  statuses: read'],
  ['serialized protected run', 'cancel-in-progress: false', 'cancel-in-progress: true'],
  ['reserved origin guard', 'assert host != "localhost" and not host.endswith((".invalid", ".example", ".test"))', 'assert True'],
  ['action pin', '11bd71901bbe5b1630ceea73d27597364c9af683', 'v4'],
  ['stable status anchor', 'fetch-depth: 0', 'fetch-depth: 1'],
  ['Python assertion enforcement', 'PYTHONOPTIMIZE: "0"', 'PYTHONOPTIMIZE: "1"'],
  ['compiler checkout identity', 'test "$(git -C "$source_dir" rev-parse HEAD)" = "$CHERRI_COMMIT"', 'true'],
  ['module verification', 'go -C "$source_dir" mod verify', 'true'],
  ['nonreserved first build', '--require-nonreserved-origin --output "$RUNNER_TEMP/upload-first"', '--output "$RUNNER_TEMP/upload-first"'],
  ['nonreserved second build', '--require-nonreserved-origin --output "$RUNNER_TEMP/upload-second"', '--output "$RUNNER_TEMP/upload-second"'],
  ['fresh freeze', 'phase5a_upload_signing.py prepare', 'echo prepare'],
  ['strict package validation', 'phase5a_upload_signing.py validate', 'echo validate'],
  ['encrypted intent', 'phase5a_actions_signing.mjs prepare', 'echo prepare'],
  ['direct HubSign send', 'phase5a_actions_signing.mjs send', 'echo send'],
  ['encrypted provider outcome capture', '--outcome-path "$RUNNER_TEMP/wht-signing-outcome.enc"', '--outcome-path "$RUNNER_TEMP/wht-signing-result.enc"'],
  ['encrypted result upload', 'name: ' + expression + ' steps.prepare.outputs.result_artifact }}', 'name: signed.shortcut'],
  ['public package upload', 'path: ' + expression + ' steps.prepare.outputs.intent_path }}', 'path: ' + expression + ' runner.temp }}/upload-review-package'],
];

for (const [name, before, after] of mutations) {
  test('refuses removed or changed ' + name, () => {
    assert.ok(workflow.includes(before));
    assert.throws(() => verifySigningWorkflow(workflow.replace(before, after), lock));
  });
}

test('workflow has no legacy service or plaintext payload configuration', () => {
  assert.doesNotMatch(workflow, /private-signing-worker|WHT_SIGNING_RECEIPT_(URL|TOKEN)|phase5a_private_receipt/);
  assert.match(workflow, /actions\/upload-artifact@[0-9a-f]{40}/);
});
