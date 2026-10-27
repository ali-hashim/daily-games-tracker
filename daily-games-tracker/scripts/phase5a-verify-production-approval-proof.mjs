import assert from 'node:assert/strict';

// Deliberately allow only this small workflow: an added step, secret, event,
// or permission must be reviewed before it can become a signing proof.
export function verifyProductionApprovalProof(workflow) {
  const expected = `name: Production signing authorization proof (no signing)
on:
  workflow_dispatch:
permissions:
  contents: read
  actions: read
jobs:
  proof:
    if: \${{ github.ref == 'refs/heads/main' }}
    runs-on: ubuntu-24.04
    environment: wht-shortcut-signing
    timeout-minutes: 5
    steps:
      - name: Check out the run revision
        uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          ref: \${{ github.sha }}
          persist-credentials: false
      - name: Verify standing production authorization without signing
        env:
          GITHUB_TOKEN: \${{ github.token }}
        run: node daily-games-tracker/scripts/phase5a-approval-rehearsal.mjs --production
`;
  assert.equal(workflow.replace(/\r\n/g, '\n'), expected);
  return true;
}
