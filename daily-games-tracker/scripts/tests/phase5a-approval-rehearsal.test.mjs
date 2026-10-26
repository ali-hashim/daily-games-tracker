import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';

const moduleUrl = new URL('../phase5a-approval-rehearsal.mjs', import.meta.url);
const sha = '1234567890abcdef1234567890abcdef12345678';
const fixture = () => ({
  environment: { id: 10, name: 'wht-signing-approval-rehearsal', can_admins_bypass: false, protection_rules: [{type: 'required_reviewers', reviewers: [{type: 'User', reviewer: {id: 42}}]}] },
  run: { id: 55, head_sha: sha, head_branch: 'main', event: 'workflow_dispatch', run_attempt: 1 },
  approvals: [{ state: 'approved', comment: `reviewed ${sha}`, user: {id: 42}, environments: [{id: 10, name: 'wht-signing-approval-rehearsal'}] }],
  context: {runId: '55', sha, ref: 'refs/heads/main', attempt: '1'},
});

test('accepts only a matching first-attempt review by the configured user', async () => {
  assert.ok(existsSync(moduleUrl), 'approval evaluator exists');
  const { verifyApproval } = await import(moduleUrl);
  assert.equal(verifyApproval(fixture()), true);
  for (const mutate of [
    x => { x.environment.can_admins_bypass = true; },
    x => { x.environment.protection_rules = []; },
    x => { x.environment.protection_rules[0].reviewers[0].reviewer.id = 99; },
    x => { x.approvals[0].comment = 'reviewed wrong'; },
    x => { x.approvals[0].state = 'rejected'; },
    x => { x.approvals[0].environments[0].id = 99; },
    x => { x.run.head_sha = '0'.repeat(40); },
    x => { x.run.run_attempt = 2; },
    x => { x.context.attempt = '2'; },
    x => { x.context.ref = 'refs/heads/other'; },
    x => { x.run.event = 'push'; },
    x => { x.approvals = []; },
  ]) {
    const input = fixture();
    mutate(input);
    assert.throws(() => verifyApproval(input));
  }
});
