// Static local preparation check only; no execution, network or signing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function verifySigningWorkflow(workflow, lock) {
  const has = text => assert.ok(workflow.includes(text), 'Missing Actions signing guard: ' + text);
  const expression = '$' + '{{';
  has("if: " + expression + " (github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch'");
  has('  push:');
  has('    branches: [main]');
  has('environment: wht-shortcut-signing');
  has('REVIEWED_APPLICATION_COMMIT: ' + expression + ' secrets.WHT_REVIEWED_APPLICATION_COMMIT }}');
  has('WHT_RUNTIME_ORIGIN: ' + expression + ' secrets.WHT_RUNTIME_ORIGIN }}');
  has('WHT_SIGNING_OUTPUT_KEY: ' + expression + ' secrets.WHT_SIGNING_OUTPUT_KEY }}');
  has('WHT_AMBIGUOUS_SIGNING_RECORD: ' + expression + ' secrets.WHT_AMBIGUOUS_SIGNING_RECORD }}');
  has('WHT_AMBIGUOUS_RECOVERY_AUTH: ' + expression + ' secrets.WHT_AMBIGUOUS_RECOVERY_AUTH }}');
  has('WHT_AMBIGUOUS_RECOVERY_REQUESTED: ' + expression + " github.event_name == 'workflow_dispatch' && inputs.confirm_ambiguous_recovery == true }}");
  has('confirm_ambiguous_recovery:');
  has('default: false');
  has('permissions:');
  has('  contents: read');
  has('  actions: read');
  has('  statuses: write');
  has('concurrency:');
  has('group: full-upload-sign-' + expression + ' github.ref }}');
  has('cancel-in-progress: false');
  has("test \"$REVIEWED_APPLICATION_COMMIT\" != '0000000000000000000000000000000000000000'");
  has('test "$REVIEWED_APPLICATION_COMMIT" = "$GITHUB_SHA"');
  has('test -n "$WHT_AMBIGUOUS_SIGNING_RECORD"');
  has('if [[ "$WHT_AMBIGUOUS_RECOVERY_REQUESTED" == true ]]; then');
  has('test "$GITHUB_EVENT_NAME" = workflow_dispatch');
  has('test "$GITHUB_RUN_ATTEMPT" = 1');
  has('test -n "$WHT_AMBIGUOUS_RECOVERY_AUTH"');
  has('assert host != "localhost" and not host.endswith((".invalid", ".example", ".test"))');
  has('base64.b64encode(decoded).decode("ascii") == key and len(decoded) == 32');
  has('uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683');
  has('fetch-depth: 0');
  has('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production');
  assert.ok(workflow.indexOf('node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production') < workflow.indexOf('name: Rebuild pinned compiler with verified module graph'));
  has('name: Establish stable protected status anchor');
  has('git rev-list --max-parents=0 HEAD');
  has('WHT_SIGNING_STATUS_ANCHOR=${roots[0]}');
  has('uses: actions/setup-go@924ae3a1cded613372ab5595356fb5720e22ba16');
  has('uses: actions/upload-artifact@615b319bd27bb32c3d64dca6b6ed6974d5fbe653');
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
  has('phase5a_actions_signing.mjs complete');
  has('daily-games-tracker/scripts/phase5a_actions_signing.mjs');
  has('--intent-path "$RUNNER_TEMP/wht-signing-intent.enc"');
  has('--outcome-path "$RUNNER_TEMP/wht-signing-outcome.enc"');
  has('--result-path "$RUNNER_TEMP/wht-signing-result.enc"');
  has('name: ' + expression + ' steps.prepare.outputs.intent_artifact }}');
  has('name: ' + expression + ' steps.prepare.outputs.result_artifact }}');
  has('name: Upload encrypted provider outcome');
  has("if: " + expression + " always() && steps.send.outcome == 'failure' }}");
  has('retention-days: 90');
  assert.equal((workflow.match(/actions\/upload-artifact@/g) || []).length, 3);
  const uploadBlocks = workflow.split(/(?=\n      - name:)/).filter(block => block.includes('actions/upload-artifact@'));
  assert.equal(uploadBlocks.length, 3);
  for (const block of uploadBlocks) assert.doesNotMatch(block, /upload-review-package|upload-first|upload-second|unsigned\.shortcut/);
  const intentUpload = workflow.indexOf('name: Upload encrypted signing intent');
  const send = workflow.indexOf('name: Send exactly one direct HubSign request');
  const outcomeUpload = workflow.indexOf('name: Upload encrypted provider outcome');
  const resultUpload = workflow.indexOf('name: Upload encrypted signed result');
  assert.ok(intentUpload >= 0 && intentUpload < send && send < outcomeUpload && outcomeUpload < resultUpload, 'intent upload must precede the one send, outcome evidence follows it, and result upload follows it');
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
