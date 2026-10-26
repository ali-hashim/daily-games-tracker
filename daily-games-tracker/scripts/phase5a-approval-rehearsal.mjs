import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const environmentName = 'wht-signing-approval-rehearsal';

export function verifyApproval({ environment, run, approvals, context }) {
  assert.match(context.sha, /^[0-9a-f]{40}$/);
  assert.match(context.runId, /^[1-9][0-9]*$/);
  assert.equal(context.ref, 'refs/heads/main');
  assert.equal(context.attempt, '1');
  assert.equal(String(run.id), context.runId);
  assert.equal(run.head_sha, context.sha);
  assert.equal(run.head_branch, 'main');
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.run_attempt, 1);
  assert.equal(environment.name, environmentName);
  assert.ok(Number.isSafeInteger(environment.id) && environment.id > 0);
  assert.equal(environment.can_admins_bypass, false);
  assert.ok(Array.isArray(environment.protection_rules));
  const rules = environment.protection_rules.filter(rule => rule.type === 'required_reviewers');
  assert.equal(rules.length, 1);
  assert.ok(Array.isArray(rules[0].reviewers) && rules[0].reviewers.length > 0);
  // Teams require membership lookup and are deliberately not accepted here.
  assert.ok(rules[0].reviewers.every(item => item.type === 'User' && Number.isSafeInteger(item.reviewer?.id) && item.reviewer.id > 0));
  assert.ok(Array.isArray(approvals));
  const relevant = approvals.filter(item => Array.isArray(item.environments) && item.environments.some(env => env.id === environment.id && env.name === environmentName));
  assert.equal(relevant.length, 1);
  const approval = relevant[0];
  assert.equal(approval.state, 'approved');
  assert.equal(approval.comment, `reviewed ${context.sha}`);
  assert.ok(rules[0].reviewers.some(item => item.reviewer.id === approval.user?.id));
  return true;
}

async function main() {
  const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, GITHUB_RUN_ID: runId, GITHUB_SHA: sha, GITHUB_REF: ref, GITHUB_RUN_ATTEMPT: attempt } = process.env;
  assert.equal(api, 'https://api.github.com');
  assert.match(repository, /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/);
  assert.ok(token);
  assert.match(runId, /^[1-9][0-9]*$/);
  const base = `${api}/repos/${repository}`;
  async function get(path) {
    const response = await fetch(base + path, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.ok(body.length <= 1_000_000);
    return JSON.parse(body);
  }
  const [environment, run, approvals] = await Promise.all([
    get(`/environments/${environmentName}`), get(`/actions/runs/${runId}`), get(`/actions/runs/${runId}/approvals`),
  ]);
  verifyApproval({ environment, run, approvals, context: {runId, sha, ref, attempt} });
  console.log('Read-only approval rehearsal passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Read-only approval rehearsal failed closed.'); process.exitCode = 1; });
}
