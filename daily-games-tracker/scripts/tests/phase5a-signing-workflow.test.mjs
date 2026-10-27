import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { verifySigningWorkflow } from '../phase5a-verify-signing-workflow.mjs';

const workflow = await readFile(new URL('../../../.github/workflows/shortcut-sign-disabled.yml', import.meta.url), 'utf8');
const lock = JSON.parse(await readFile(new URL('../../shortcut/cherri-migration/toolchain.lock.json', import.meta.url), 'utf8'));

test('protected Actions-only workflow retains all boundaries', () => {
  assert.equal(verifySigningWorkflow(workflow, lock), true);
});

test('the standing authorization check precedes any package build or provider transfer', async () => {
  const check = workflow.indexOf('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production');
  assert.ok(check > workflow.indexOf('name: Check out only the protected reviewed source commit'));
  assert.ok(check < workflow.indexOf('name: Rebuild pinned compiler with verified module graph'));
  assert.match(workflow, /name: Verify standing protected production authorization/);
  assert.match(workflow, /\n  actions: read\n/);
  assert.doesNotMatch(workflow, /REVIEWED_APPLICATION_COMMIT/);
  const verifier = await readFile(new URL('../phase5a-approval-rehearsal.mjs', import.meta.url), 'utf8');
  assert.match(verifier, /assert\.equal\(mainBranch\?\.commit\?\.sha, context\.sha\)/);
  assert.match(verifier, /assert\.equal\(mainBranch\?\.protected, true\)/);
  assert.match(verifier, /assert\.equal\(rules\.length, 0, 'Production signing authorization must not require per-run reviewers'\)/);
  assert.match(verifier, /mode === 'production' \? undefined : get\(`\/actions\/runs\/\$\{runId\}\/approvals`\)/);
  assert.match(verifier, /mode === 'production' \? get\('\/branches\/main'\) : undefined/);
});

const expression = '$' + '{{';
const mutations = [
  ['automatic main trigger', '  push:\n    branches: [main]', '  removed-trigger:\n    branches: [main]'],
  ['environment protection', 'environment: wht-shortcut-signing', 'environment: unprotected'],
  ['standing authorization verification', 'node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production', 'true'],
  ['Actions API read permission', '  actions: read', '  actions: none'],
  ['checkout commit identity', 'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"', 'true'],
  ['runtime origin secret', 'WHT_RUNTIME_ORIGIN: ' + expression + ' secrets.WHT_RUNTIME_ORIGIN }}', 'WHT_RUNTIME_ORIGIN: https://runtime.example.invalid'],
  ['R2 account secret', 'WHT_R2_ACCOUNT_ID: ' + expression + ' secrets.WHT_R2_ACCOUNT_ID }}', 'WHT_R2_ACCOUNT_ID: unset'],
  ['R2 bucket secret', 'WHT_R2_BUCKET_NAME: ' + expression + ' secrets.WHT_R2_BUCKET_NAME }}', 'WHT_R2_BUCKET_NAME: unset'],
  ['R2 access key secret', 'WHT_R2_ACCESS_KEY_ID: ' + expression + ' secrets.WHT_R2_ACCESS_KEY_ID }}', 'WHT_R2_ACCESS_KEY_ID: unset'],
  ['R2 secret key secret', 'WHT_R2_SECRET_ACCESS_KEY: ' + expression + ' secrets.WHT_R2_SECRET_ACCESS_KEY }}', 'WHT_R2_SECRET_ACCESS_KEY: unset'],
  ['migrated ambiguity digest secret', 'WHT_AMBIGUITY_RECORD_SHA256: ' + expression + ' secrets.WHT_AMBIGUITY_RECORD_SHA256 }}', 'WHT_AMBIGUITY_RECORD_SHA256: unset'],
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
  ['private R2 intent', 'phase5a_actions_signing.mjs prepare', 'echo prepare'],
  ['direct HubSign send', 'phase5a_actions_signing.mjs send', 'echo send'],
  ['private R2 publication', 'phase5a_actions_signing.mjs publish', 'echo publish'],
  ['success gate', 'phase5a_actions_signing.mjs complete', 'echo complete'],
  ['migrated ambiguity digest format', '[[ "$WHT_AMBIGUITY_RECORD_SHA256" =~ ^[0-9a-f]{64}$ ]]', 'test -n "$WHT_AMBIGUITY_RECORD_SHA256"'],
  ['manifest digest masking', 'echo "::add-mask::$manifest_sha256"', 'echo "digest=$manifest_sha256"'],
  ['wire digest masking', 'echo "::add-mask::$wire_sha256"', 'echo "digest=$wire_sha256"'],
  ['private signed-file handoff', '--signed-path "$RUNNER_TEMP/wht-signed.shortcut"', '--signed-path "$RUNNER_TEMP/other.shortcut"'],
  ['private first build output suppression', '--output "$RUNNER_TEMP/upload-first" >/dev/null 2>&1', '--output "$RUNNER_TEMP/upload-first"'],
  ['private second build output suppression', '--output "$RUNNER_TEMP/upload-second" >/dev/null 2>&1', '--output "$RUNNER_TEMP/upload-second"'],
  ['private freeze output suppression', '--output "$RUNNER_TEMP/upload-review-package" >/dev/null 2>&1', '--output "$RUNNER_TEMP/upload-review-package"'],
  ['package validation error suppression', '> "$RUNNER_TEMP/package-validation.json" 2>/dev/null', '> "$RUNNER_TEMP/package-validation.json"'],
  ['private prepare output suppression', '--wire-sha "$WIRE_SHA256" >/dev/null 2>&1', '--wire-sha "$WIRE_SHA256"'],
  ['private delivery output suppression', '--signed-path "$RUNNER_TEMP/wht-signed.shortcut" >/dev/null 2>&1', '--signed-path "$RUNNER_TEMP/wht-signed.shortcut"'],
];

for (const [name, before, after] of mutations) {
  test('refuses removed or changed ' + name, () => {
    assert.ok(workflow.includes(before));
    assert.throws(() => verifySigningWorkflow(workflow.replaceAll(before, after), lock));
  });
}

test('workflow has no legacy service or plaintext payload configuration', () => {
  assert.doesNotMatch(workflow, /private-signing-worker|WHT_SIGNING_RECEIPT_(URL|TOKEN)|phase5a_private_receipt/);
  assert.doesNotMatch(workflow, /WHT_SIGNING_OUTPUT_KEY|WHT_AMBIGUOUS_SIGNING_RECORD|actions\/upload-artifact@|\.enc\b/);
  assert.match(workflow, /WHT_R2_ACCOUNT_ID: .*secrets\.WHT_R2_ACCOUNT_ID/);
  assert.match(workflow, /WHT_AMBIGUITY_RECORD_SHA256: .*secrets\.WHT_AMBIGUITY_RECORD_SHA256/);
  const sendStep = workflow.slice(workflow.indexOf('name: Send exactly one direct HubSign request'), workflow.indexOf('name: Upload signed Shortcut and private latest manifest'));
  const publishStep = workflow.slice(workflow.indexOf('name: Upload signed Shortcut and private latest manifest'), workflow.indexOf('name: Mark private R2 delivery complete'));
  assert.match(sendStep, /--source-commit "\$GITHUB_SHA"/);
  assert.match(sendStep, /--signed-path "\$RUNNER_TEMP\/wht-signed\.shortcut"/);
  assert.match(publishStep, /phase5a_actions_signing\.mjs publish/);
  assert.match(publishStep, /--manifest-sha "\$MANIFEST_SHA256"/);
});

test('send CLI preserves migrated-recovery authorization after prepare', async () => {
  const source = await readFile(new URL('../phase5a_actions_signing.mjs', import.meta.url), 'utf8');
  assert.match(source, /else if \(command === 'send'\) await sendSigningFromCli\(args\)/);
  const sendAdapter = source.slice(source.indexOf('export async function sendSigningFromCli'), source.indexOf('export async function publishSigning'));
  assert.match(sendAdapter, /recoveryRequested: environment\.WHT_AMBIGUOUS_RECOVERY_REQUESTED === 'true'/);
  assert.match(sendAdapter, /recoveryAuthorization: environment\.WHT_AMBIGUOUS_RECOVERY_AUTH/);
});
