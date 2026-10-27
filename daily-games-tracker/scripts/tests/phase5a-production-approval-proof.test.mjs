import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../../.github/workflows/shortcut-production-approval-proof.yml', import.meta.url);
const verifierUrl = new URL('../phase5a-verify-production-approval-proof.mjs', import.meta.url);

test('production approval proof only performs the protected read-only check', async () => {
  assert.ok(existsSync(workflowUrl) && existsSync(verifierUrl), 'production proof workflow and verifier exist');
  const workflow = await readFile(workflowUrl, 'utf8');
  const { verifyProductionApprovalProof } = await import(verifierUrl);
  assert.equal(verifyProductionApprovalProof(workflow), true);
  for (const [before, after] of [
    ['workflow_dispatch:', 'push:'],
    ['environment: wht-shortcut-signing', 'environment: unprotected'],
    ['  actions: read', '  actions: write'],
    ['persist-credentials: false', 'persist-credentials: true'],
    ['phase5a-approval-rehearsal.mjs --production', 'phase5a-approval-rehearsal.mjs'],
    ["github.ref == 'refs/heads/main'", "github.ref != 'refs/heads/main'"],
  ]) {
    assert.ok(workflow.includes(before));
    assert.throws(() => verifyProductionApprovalProof(workflow.replace(before, after)));
  }
  assert.throws(() => verifyProductionApprovalProof(workflow + '\n      - run: curl https://example.invalid\n'));
});
