import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function verifyApproval({ environment, run, approvals, context, mode = 'rehearsal', branchPolicies, mainBranch }) {
  assert.ok(mode === 'rehearsal' || mode === 'production');
  const environmentName = mode === 'production' ? 'wht-shortcut-signing' : 'wht-signing-approval-rehearsal';
  assert.match(context.sha, /^[0-9a-f]{40}$/);
  assert.match(context.runId, /^[1-9][0-9]*$/);
  assert.equal(context.ref, 'refs/heads/main');
  assert.equal(context.attempt, '1');
  assert.equal(String(run.id), context.runId);
  assert.equal(run.head_sha, context.sha);
  assert.equal(run.head_branch, 'main');
  if (mode === 'production') {
    assert.ok(context.event === 'push' || context.event === 'workflow_dispatch');
    assert.equal(run.event, context.event);
    assert.equal(environment.deployment_branch_policy?.protected_branches, false);
    assert.equal(environment.deployment_branch_policy?.custom_branch_policies, true);
    assert.equal(mainBranch?.protected, true);
    assert.equal(mainBranch?.commit?.sha, context.sha);
    assert.equal(branchPolicies?.total_count, 1);
    assert.ok(Array.isArray(branchPolicies.branch_policies));
    assert.equal(branchPolicies.branch_policies.length, 1);
    assert.equal(branchPolicies.branch_policies[0].name, 'main');
    assert.equal(branchPolicies.branch_policies[0].type, 'branch');
  } else {
    assert.equal(run.event, 'workflow_dispatch');
  }
  assert.equal(run.run_attempt, 1);
  assert.equal(environment.name, environmentName);
  assert.ok(Number.isSafeInteger(environment.id) && environment.id > 0);
  assert.equal(environment.can_admins_bypass, false);
  assert.ok(Array.isArray(environment.protection_rules));
  const rules = environment.protection_rules.filter(rule => rule.type === 'required_reviewers');
  if (mode === 'production') {
    assert.equal(rules.length, 0, 'Production signing authorization must not require per-run reviewers');
    return true;
  }
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
  assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--production'));
  const mode = process.argv[2] === '--production' ? 'production' : 'rehearsal';
  const environmentName = mode === 'production' ? 'wht-shortcut-signing' : 'wht-signing-approval-rehearsal';
  const { GITHUB_API_URL: api, GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, GITHUB_RUN_ID: runId, GITHUB_SHA: sha, GITHUB_REF: ref, GITHUB_RUN_ATTEMPT: attempt, GITHUB_EVENT_NAME: event } = process.env;
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
  const [environment, run, approvals, branchPolicies, mainBranch] = await Promise.all([
    get(`/environments/${environmentName}`),
    get(`/actions/runs/${runId}`),
    mode === 'production' ? undefined : get(`/actions/runs/${runId}/approvals`),
    mode === 'production' ? get(`/environments/${environmentName}/deployment-branch-policies?per_page=100`) : undefined,
    mode === 'production' ? get('/branches/main') : undefined,
  ]);
  verifyApproval({ environment, run, approvals, branchPolicies, mainBranch, mode, context: {runId, sha, ref, attempt, event} });
  console.log(mode === 'production' ? 'Standing production signing authorization verified.' : 'Protected manual approval rehearsal passed.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Read-only approval rehearsal failed closed.'); process.exitCode = 1; });
}
