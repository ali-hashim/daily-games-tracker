// Static local preparation check only; no execution, network or signing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { MANUAL_RESIGN_REASON_CODES } from './phase5a_actions_signing.mjs';

export function verifySigningWorkflow(workflow, lock) {
  const has = text => assert.ok(workflow.includes(text), 'Missing Actions signing guard: ' + text);
  const expression = '$' + '{{';
  has("if: " + expression + " (github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch'");
  has('  push:');
  has('    branches: [main]');
  has('environment: wht-shortcut-signing');
  has('WHT_RUNTIME_ORIGIN: ' + expression + ' secrets.WHT_RUNTIME_ORIGIN }}');
  has('WHT_R2_ACCOUNT_ID: ' + expression + ' secrets.WHT_R2_ACCOUNT_ID }}');
  has('WHT_R2_BUCKET_NAME: ' + expression + ' secrets.WHT_R2_BUCKET_NAME }}');
  has('WHT_R2_ACCESS_KEY_ID: ' + expression + ' secrets.WHT_R2_ACCESS_KEY_ID }}');
  has('WHT_R2_SECRET_ACCESS_KEY: ' + expression + ' secrets.WHT_R2_SECRET_ACCESS_KEY }}');
  has('WHT_AMBIGUITY_RECORD_SHA256: ' + expression + ' secrets.WHT_AMBIGUITY_RECORD_SHA256 }}');
  has('WHT_AMBIGUOUS_RECOVERY_AUTH: ' + expression + ' secrets.WHT_AMBIGUOUS_RECOVERY_AUTH }}');
  has('WHT_AMBIGUOUS_RECOVERY_REQUESTED: ' + expression + " github.event_name == 'workflow_dispatch' && inputs.confirm_ambiguous_recovery == true }}");
  has('confirm_ambiguous_recovery:');
  has('confirm_manual_resign:');
  has('default: false');
  has('manual_resign_request_id:');
  has('manual_resign_source_commit:');
  const reasonStart = workflow.indexOf('      manual_resign_reason:');
  const reasonEnd = workflow.indexOf('      confirm_earlier_request_may_have_completed:', reasonStart);
  assert.ok(reasonStart >= 0 && reasonEnd > reasonStart, 'Manual re-sign reason choice input must be present');
  const reasonInput = workflow.slice(reasonStart, reasonEnd);
  assert.match(reasonInput, /^        type: choice$/m, 'Manual re-sign reason must be a finite workflow choice');
  assert.match(reasonInput, /^        options:$/m, 'Manual re-sign reason choices must be explicit');
  for (const reasonCode of MANUAL_RESIGN_REASON_CODES) {
    assert.ok(reasonInput.split(/\r?\n/).includes('          - ' + reasonCode), 'Workflow reason choices must include ' + reasonCode);
  }
  assert.equal(reasonInput.match(/^          - /gm)?.length, MANUAL_RESIGN_REASON_CODES.length, 'Workflow and state-machine reason choices must match exactly');
  has('confirm_earlier_request_may_have_completed:');
  has('WHT_MANUAL_RESIGN_REQUESTED: ' + expression + " github.event_name == 'workflow_dispatch' && inputs.confirm_manual_resign == true }}");
  has('WHT_MANUAL_RESIGN_REQUEST_ID: ' + expression + ' inputs.manual_resign_request_id }}');
  has('WHT_MANUAL_RESIGN_SOURCE_COMMIT: ' + expression + ' inputs.manual_resign_source_commit }}');
  has('WHT_MANUAL_RESIGN_REASON: ' + expression + ' inputs.manual_resign_reason }}');
  has('WHT_CONFIRM_EARLIER_REQUEST_MAY_HAVE_COMPLETED: ' + expression + " github.event_name == 'workflow_dispatch' && inputs.confirm_earlier_request_may_have_completed == true }}");
  has('node daily-games-tracker/scripts/phase5a_actions_signing.mjs validate-manual-resign');
  assert.ok(workflow.indexOf('name: Validate optional manual re-sign authorization')
    < workflow.indexOf('name: Rebuild pinned compiler with verified module graph'));
  has('default: false');
  has('permissions:');
  has('  contents: read');
  has('  actions: read');
  has('  statuses: write');
  has('concurrency:');
  has('group: full-upload-sign-' + expression + ' github.ref }}');
  has('cancel-in-progress: false');
  assert.doesNotMatch(workflow, /REVIEWED_APPLICATION_COMMIT/);
  has('test "$(git rev-parse HEAD)" = "$GITHUB_SHA"');
  has('test -n "$WHT_R2_ACCOUNT_ID"');
  has('test -n "$WHT_R2_BUCKET_NAME"');
  has('test -n "$WHT_R2_ACCESS_KEY_ID"');
  has('test -n "$WHT_R2_SECRET_ACCESS_KEY"');
  has('[[ "$WHT_AMBIGUITY_RECORD_SHA256" =~ ^[0-9a-f]{64}$ ]]');
  has('if [[ "$WHT_AMBIGUOUS_RECOVERY_REQUESTED" == true ]]; then');
  has('test "$GITHUB_EVENT_NAME" = workflow_dispatch');
  has('test "$GITHUB_RUN_ATTEMPT" = 1');
  has('test -n "$WHT_AMBIGUOUS_RECOVERY_AUTH"');
  has('assert host != "localhost" and not host.endswith((".invalid", ".example", ".test"))');
  has('uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683');
  has('fetch-depth: 0');
  has('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production');
  assert.ok(workflow.indexOf('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production') < workflow.indexOf('name: Rebuild pinned compiler with verified module graph'));
  has('name: Establish stable protected status anchor');
  has('git rev-list --max-parents=0 HEAD');
  has('WHT_SIGNING_STATUS_ANCHOR=${roots[0]}');
  has('uses: actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16');
  has('test "$(git -C "$source_dir" rev-parse HEAD)" = "$CHERRI_COMMIT"');
  has('export GOTOOLCHAIN=local');
  has('go -C "$source_dir" mod verify');
  has('go-version: "' + lock.go.version);
  has('runs-on: ' + lock.build.runner);
  const actionPins = new Map(Object.values(lock.actions).map(item => [item.repository, item.commit]));
  for (const match of workflow.matchAll(/uses:\s*([^@\s]+)@([^\s#]+)/g)) {
    assert.equal(match[2], actionPins.get(match[1]), 'Unexpected action pin ' + match[1]);
    assert.match(match[2], /^[0-9a-f]{40}$/);
  }
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-first"');
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-second"');
  has('phase5a_compare_upload.py "$RUNNER_TEMP/upload-first/Upload To WHT_unsigned.shortcut" "$RUNNER_TEMP/upload-second/Upload To WHT_unsigned.shortcut"');
  has('phase5a_upload_signing.py prepare --build-directory "$RUNNER_TEMP/upload-first" --runtime-origin "$WHT_RUNTIME_ORIGIN" --output "$RUNNER_TEMP/upload-review-package"');
  has('phase5a_upload_signing.py validate');
  has('phase5a_actions_signing.mjs prepare');
  has('phase5a_actions_signing.mjs send');
  has('phase5a_actions_signing.mjs publish');
  has('phase5a_actions_signing.mjs complete');
  has('daily-games-tracker/scripts/phase5a_actions_signing.mjs');
  has('--signed-path "$RUNNER_TEMP/wht-signed.shortcut"');
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-first" >/dev/null 2>&1');
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-second" >/dev/null 2>&1');
  has('phase5a_upload_signing.py prepare --build-directory "$RUNNER_TEMP/upload-first" --runtime-origin "$WHT_RUNTIME_ORIGIN" --output "$RUNNER_TEMP/upload-review-package" >/dev/null 2>&1');
  has('> "$RUNNER_TEMP/package-validation.json" 2>/dev/null');
  has('--wire-sha "$WIRE_SHA256" >/dev/null 2>&1');
  has('--signed-path "$RUNNER_TEMP/wht-signed.shortcut" >/dev/null 2>&1');
  has('echo "::add-mask::$manifest_sha256"');
  has('echo "::add-mask::$wire_sha256"');
  assert.doesNotMatch(workflow, /WHT_SIGNING_OUTPUT_KEY|WHT_AMBIGUOUS_SIGNING_RECORD|\.enc\b|actions\/upload-artifact@/);
  assert.doesNotMatch(workflow, /echo[^\n]*WHT_MANUAL_RESIGN_REASON|WHT_MANUAL_RESIGN_REASON[^\n]*GITHUB_OUTPUT/);
  const prepare = workflow.indexOf('name: Persist private R2 intent before provider transfer');
  const send = workflow.indexOf('name: Send exactly one direct HubSign request');
  const publish = workflow.indexOf('name: Upload signed Shortcut and private latest manifest');
  const complete = workflow.indexOf('name: Mark private R2 delivery complete');
  assert.ok(prepare >= 0 && prepare < send && send < publish && publish < complete, 'private intent, single provider call, canonical delivery, then completion must stay ordered');
  assert.doesNotMatch(workflow, /phase5a_private_receipt|WHT_SIGNING_RECEIPT_(URL|TOKEN)|private-signing-worker|workers\.dev/);
  assert.doesNotMatch(workflow, /\bpull_request(_target)?:/);
  assert.doesNotMatch(workflow, /github\.event_name == 'pull_request/);
  assert.match(workflow, /^\s+PYTHONOPTIMIZE: ["']?0["']?\s*$/m);
  for (const block of workflow.matchAll(/\brun: \|\n((?: {10}[^\n]*\n|\n)*)/g)) {
    assert.ok(!block[1].includes('$' + '{' + '{'), 'Workflow expression interpolated into shell');
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const workflow = await readFile(resolve(root, '../.github/workflows/shortcut-sign-disabled.yml'), 'utf8');
  const lock = JSON.parse(await readFile(resolve(root, 'shortcut/cherri-migration/toolchain.lock.json'), 'utf8'));
  verifySigningWorkflow(workflow, lock);
  console.log('Protected Actions-only signing workflow guards passed; no execution performed.');
}
