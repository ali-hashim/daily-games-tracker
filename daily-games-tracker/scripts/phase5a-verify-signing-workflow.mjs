// Static local preparation check only; no execution, network or signing.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function verifySigningWorkflow(workflow, lock) {
  const has = text => assert.ok(workflow.includes(text), `Missing signing guard: ${text}`);
  has("if: ${{ (github.event_name == 'push' && github.ref == 'refs/heads/main') || (github.event_name == 'workflow_dispatch'");
  has('  push:\n    branches: [main]\n    paths:');
  has('      - daily-games-tracker/shortcut/cherri-migration/source/**');
  has('      - daily-games-tracker/scripts/phase5a*.py');
  has('      - daily-games-tracker/scripts/tests/phase5a*.test.mjs');
  has('environment: wht-shortcut-signing');
  has('WHT_RUNTIME_ORIGIN: ${{ secrets.WHT_RUNTIME_ORIGIN }}');
  has('REVIEWED_APPLICATION_COMMIT: ${{ secrets.WHT_REVIEWED_APPLICATION_COMMIT }}');
  has('WHT_SIGNING_RECEIPT_URL: ${{ secrets.WHT_SIGNING_RECEIPT_URL }}');
  has('WHT_SIGNING_RECEIPT_TOKEN: ${{ secrets.WHT_SIGNING_RECEIPT_TOKEN }}');
  has('assert host != "localhost" and not host.endswith((".invalid", ".example", ".test"))');
  has('test "$REVIEWED_APPLICATION_COMMIT" != \'0000000000000000000000000000000000000000\'');
  const sourceGuard = 'test "$REVIEWED_APPLICATION_COMMIT" = "$GITHUB_SHA"';
  has(sourceGuard);
  assert.ok(workflow.indexOf(sourceGuard) < workflow.indexOf('uses: actions/checkout@'));
  has('if [ "$GITHUB_EVENT_NAME" = push ]; then');
  has('elif [ "$GITHUB_EVENT_NAME" = workflow_dispatch ]; then');
  has('test "$GITHUB_REF" = refs/heads/main');
  has('permissions:\n  contents: read');
  has('persist-credentials: false');
  has('ref: ${{ github.sha }}');
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
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-first"');
  has('phase5a_build_upload.py --compiler "$RUNNER_TEMP/cherri" --runtime-origin "$WHT_RUNTIME_ORIGIN" --require-nonreserved-origin --output "$RUNNER_TEMP/upload-second"');
  has('phase5a_compare_upload.py "$RUNNER_TEMP/upload-first/Upload To WHT_unsigned.shortcut" "$RUNNER_TEMP/upload-second/Upload To WHT_unsigned.shortcut"');
  const freeze = 'phase5a_upload_signing.py prepare --build-directory "$RUNNER_TEMP/upload-first" --runtime-origin "$WHT_RUNTIME_ORIGIN" --output "$RUNNER_TEMP/upload-review-package"';
  has(freeze);
  has('phase5a_private_receipt.py \\\n            --endpoint "$WHT_SIGNING_RECEIPT_URL" \\\n            sign');
  has('--runtime-origin "$WHT_RUNTIME_ORIGIN"');
  has('--expected-manifest-sha256 "$manifest_sha256"');
  has('--expected-wire-sha256 "$wire_sha256"');
  has('> "$RUNNER_TEMP/private-signing-receipt.json"');
  has('            recover');
  has('--expected-signed-sha256 "$signed_sha256"');
  has('--output "$signed_output"');
  has('assert hashlib.sha256(signed).hexdigest() == sys.argv[2]');
  assert.ok(workflow.indexOf(freeze) < workflow.indexOf('phase5a_private_receipt.py'));
  assert.doesNotMatch(workflow, /phase5a_private_receipt\.py[\s\S]{0,600}\bclaim\b/);
  assert.doesNotMatch(workflow, /phase5a_private_receipt\.py[\s\S]{0,600}\bcomplete\b/);
  assert.doesNotMatch(workflow, /phase5a_upload_signing\.py send/);
  assert.doesNotMatch(workflow, /signed-shortcut|upload-signing-evidence/);
  assert.match(workflow, /^\s+PYTHONOPTIMIZE: ["']?0["']?\s*$/m);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@/);
  assert.doesNotMatch(workflow, /approved_manifest_sha256|approved_wire_sha256|trusted_application_commit/);
  assert.doesNotMatch(workflow, /[A-Za-z0-9-]+\.pages\.dev/);
  assert.doesNotMatch(workflow, /^\s+(pull_request|pull_request_target):/m);
  // Expressions may enter through job/step metadata, never shell code.
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
  console.log('Protected full-client signing workflow guards passed; no execution performed.');
}
