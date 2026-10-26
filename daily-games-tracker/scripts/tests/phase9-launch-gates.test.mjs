import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyLedger } from "../phase9-verify-launch-gates.mjs";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const verifierPath = resolve(
  repoRoot,
  "daily-games-tracker/scripts/phase9-verify-launch-gates.mjs",
);
const rehearsalPath = resolve(repoRoot, "daily-games-tracker/scripts/phase9-rehearse-recovery.mjs");
const launchLedgerPath = resolve(repoRoot, "daily-games-tracker/reports/phase9-launch-gates.json");
const signedCandidateSha256 = "19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd";
const previewAlias = "https://preview.winstitute-of-higher-thinking.pages.dev";
const requiredReferences = [
  "shortcut/PHASE_5A_HANDOFF.md",
  "shortcut/PHASE_5A_NATIVE_ACCEPTANCE.md",
  "PHASE_5A_PLAN.md",
  "EXECUTION_PLAN.md",
  "../Daily_Games_Tracker_Final_Implementation_Plan.md#20-launch-checklist",
  "../Daily_Games_Tracker_Final_Implementation_Plan.md#21-definition-of-done",
];
const phase9ChecklistIds = [
  "launch.terms-compatibility",
  "launch.pages-d1",
  "launch.production-secrets",
  "launch.access-admin",
  "launch.migrations",
  "launch.seed-config",
  "launch.shortcut-release",
  "launch.ios-version-matrix",
  "launch.safari-pwa-login",
  "launch.admin-recovery",
  "launch.device-invitations",
  "launch.seven-player-pilot",
  "launch.clipboard-privacy",
  "launch.backup-restore",
  "launch.monitoring-free-tier",
];
const phase5aFormalIds = [
  "phase5a.accepted-source-revision",
  "phase5a.compiler-lock-and-build",
  "phase5a.signed-candidate",
  "phase5a.native-core-flows",
  "phase5a.saved-result-integrity",
  "phase5a.protected-signing-workflow",
  "phase5a.rollback-reference",
  "phase5a.phase5b-handoff",
];
const limitationText = {
  "phase5a.native-edge-case-matrix": "The native edge-case matrix remains an unproved limitation.",
  "phase5a.native-race-concurrency":
    "The native race/concurrency exercise remains an unproved limitation.",
  "phase5a.general-reproducibility":
    "general byte/semantic reproducibility remains an unproved limitation.",
  "phase5a.operational-signing-activation":
    "operational signing activation remains an unproved limitation.",
  "phase5a.user-reported-backup":
    "The user-reported-only backup without independent identifier/hash remains an unproved limitation.",
};

const gate = (id, disposition) => ({
  id,
  title: id,
  disposition,
  evidence: "Recorded evidence for the ledger contract test.",
  references: ["EXECUTION_PLAN.md"],
});

const phase5aGate = (id, disposition) => ({
  ...gate(id, disposition),
  references: ["shortcut/PHASE_5A_HANDOFF.md", "PHASE_5A_PLAN.md"],
});

function validLedger() {
  return {
    schema_version: 1,
    phase: "Phase 9",
    generated_at: "2026-10-25",
    preview: { alias: previewAlias },
    candidate: {
      name: "Upload to WHT",
      signed_sha256: signedCandidateSha256,
    },
    references: requiredReferences,
    gates: [
      ...phase9ChecklistIds.map((id) => gate(id, "pending")),
      gate("launch.pass-example", "pass"),
      gate("launch.pending-example", "pending"),
      gate("launch.blocked-example", "blocked"),
      gate("launch.waived-example", "waived"),
    ],
    phase5a: [
      ...phase5aFormalIds.map((id) =>
        phase5aGate(
          id,
          id.includes("protected") ||
            id.includes("rollback") ||
            id.includes("saved") ||
            id.includes("handoff")
            ? "pending"
            : "pass",
        ),
      ),
    ],
    limitations: [
      phase5aGate("phase5a.native-edge-case-matrix", "waived"),
      phase5aGate("phase5a.native-race-concurrency", "waived"),
      phase5aGate("phase5a.general-reproducibility", "waived"),
      phase5aGate("phase5a.operational-signing-activation", "pending"),
      phase5aGate("phase5a.user-reported-backup", "pending"),
    ].map((entry) => ({
      ...entry,
      limitation: limitationText[entry.id],
    })),
    rehearsal: [gate("rehearsal.local-check", "pass")],
    operational_evidence: [gate("operational.preview-health", "pass")],
  };
}

test("verifier accepts a ledger containing pass, pending, blocked, and waived dispositions", () => {
  assert.deepEqual(verifyLedger(validLedger()), []);
});

test("verifier rejects unsupported dispositions", () => {
  const ledger = validLedger();
  ledger.gates[0].disposition = "complete";

  assert.match(verifyLedger(ledger).join("\n"), /unsupported disposition|must be one of/);
});

test("verifier rejects a ledger that omits a required Phase 5A limitation", () => {
  const ledger = validLedger();
  ledger.limitations = ledger.limitations.filter(
    (entry) => entry.id !== "phase5a.native-race-concurrency",
  );

  assert.match(
    verifyLedger(ledger).join("\n"),
    /native-race-concurrency|required Phase 5A limitation/,
  );
});

test("verifier rejects protected signing and rollback gates marked pass", () => {
  const ledger = validLedger();
  ledger.phase5a.find((entry) => entry.id === "phase5a.protected-signing-workflow").disposition =
    "pass";
  ledger.phase5a.find((entry) => entry.id === "phase5a.rollback-reference").disposition = "pass";

  const failures = verifyLedger(ledger).join("\n");
  assert.match(failures, /protected(?: signing workflow|-signing-workflow)/);
  assert.match(failures, /rollback(?: reference|-reference)/);
});

test("verifier rejects a Phase 5B handoff pass while closeout dependencies are not all pass", () => {
  const ledger = validLedger();
  ledger.phase5a.find((entry) => entry.id === "phase5a.phase5b-handoff").disposition = "pass";

  const failures = verifyLedger(ledger).join("\n");
  assert.match(failures, /phase5b-handoff.*requires.*saved-result-integrity/i);
  assert.match(failures, /phase5b-handoff.*requires.*protected-signing-workflow/i);
  assert.match(failures, /phase5b-handoff.*requires.*rollback-reference/i);
});

test("verifier rejects bounded saved-result evidence promoted to pass", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";

  assert.match(verifyLedger(ledger).join("\n"), /saved-result-integrity.*independent evidence/i);
});

test("verifier rejects protected signing pass without explicit activated operational evidence", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.protected-signing-workflow");
  entry.disposition = "pass";

  assert.match(
    verifyLedger(ledger).join("\n"),
    /protected-signing-workflow.*activated.*operational evidence/i,
  );
});

test("verifier rejects rollback pass without independent identifier and hash evidence", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.rollback-reference");
  entry.disposition = "pass";

  assert.match(
    verifyLedger(ledger).join("\n"),
    /rollback-reference.*independently identified.*hash evidence/i,
  );
});

test("verifier rejects saved-result pass when independent evidence is unavailable", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";
  entry.evidence = "Independent saved-result evidence is unavailable.";
  entry.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "independent evidence record",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /saved-result-integrity.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects protected-signing pass when the workflow is disabled", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.protected-signing-workflow");
  entry.disposition = "pass";
  entry.evidence =
    "The protected signing workflow is disabled; no operational activation is recorded.";
  entry.evidence_contract = {
    basis: "operational",
    verified: true,
    source: "reviewed workflow record",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /protected-signing-workflow.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects rollback pass when the hash is unavailable", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.rollback-reference");
  entry.disposition = "pass";
  entry.evidence = "Independently identified rollback artifact has hash unavailable.";
  entry.evidence_contract = {
    basis: "independent_artifact",
    verified: true,
    identifier: "rollback-artifact-2026-10-25",
    sha256: "a".repeat(64),
    source: "independent artifact record",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /rollback-reference.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects pass when evidence contract source or description contradicts the disposition", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";
  entry.evidence =
    "Independent database export and restored-database comparison verified all key rows and constraints.";
  entry.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "Independent evidence source is unavailable.",
    description: "The independent evidence description is missing.",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /saved-result-integrity.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects pass when evidence itself uses unproven wording", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";
  entry.evidence = "Independent saved-result evidence is unproven for this revision.";
  entry.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "independent read-only evidence record",
    description: "The independent evidence record was inspected.",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /saved-result-integrity.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects pass when evidence contract source uses unproven wording", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";
  entry.evidence = "Independent saved-result evidence was inspected and verified.";
  entry.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "The independent evidence source is unproven.",
    description: "The independent evidence record was inspected.",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /saved-result-integrity.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects pass when evidence contract description uses unproven wording", () => {
  const ledger = validLedger();
  const entry = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  entry.disposition = "pass";
  entry.evidence = "Independent saved-result evidence was inspected and verified.";
  entry.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "independent read-only evidence record",
    description: "The independent evidence description is unproven.",
  };

  assert.match(
    verifyLedger(ledger).join("\n"),
    /saved-result-integrity.*cannot use.*unproven wording/i,
  );
});

test("verifier rejects a Phase 5B handoff with contradictory passed closeout evidence", () => {
  const ledger = validLedger();
  const saved = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  saved.disposition = "pass";
  saved.evidence = "Independent saved-result evidence is unavailable.";
  saved.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "independent evidence record",
  };

  const signing = ledger.phase5a.find((item) => item.id === "phase5a.protected-signing-workflow");
  signing.disposition = "pass";
  signing.evidence =
    "The protected signing workflow is disabled; no operational activation is recorded.";
  signing.evidence_contract = {
    basis: "operational",
    verified: true,
    source: "reviewed workflow record",
  };

  const rollback = ledger.phase5a.find((item) => item.id === "phase5a.rollback-reference");
  rollback.disposition = "pass";
  rollback.evidence = "Independently identified rollback artifact has hash unavailable.";
  rollback.evidence_contract = {
    basis: "independent_artifact",
    verified: true,
    identifier: "rollback-artifact-2026-10-25",
    sha256: "a".repeat(64),
    source: "independent artifact record",
  };
  ledger.phase5a.find((item) => item.id === "phase5a.phase5b-handoff").disposition = "pass";

  const failures = verifyLedger(ledger).join("\n");
  assert.match(failures, /saved-result-integrity/i);
  assert.match(failures, /protected-signing-workflow/i);
  assert.match(failures, /rollback-reference/i);
});

test("verifier accepts a future closeout only with explicit independent and operational evidence", () => {
  const ledger = validLedger();
  const saved = ledger.phase5a.find((item) => item.id === "phase5a.saved-result-integrity");
  saved.disposition = "pass";
  saved.evidence =
    "Independent database export and restored-database comparison verified all key rows and constraints.";
  saved.evidence_contract = {
    basis: "independent",
    verified: true,
    source: "independent read-only export and restore comparison",
  };

  const signing = ledger.phase5a.find((item) => item.id === "phase5a.protected-signing-workflow");
  signing.disposition = "pass";
  signing.evidence =
    "The protected signing workflow was activated and executed operationally for the reviewed payload.";
  signing.evidence_contract = {
    basis: "operational",
    verified: true,
    source: "reviewed workflow run",
  };

  const rollback = ledger.phase5a.find((item) => item.id === "phase5a.rollback-reference");
  rollback.disposition = "pass";
  rollback.evidence =
    "Independently identified rollback artifact and hash-verified before restore rehearsal.";
  rollback.evidence_contract = {
    basis: "independent_artifact",
    verified: true,
    identifier: "rollback-artifact-2026-10-25",
    sha256: "a".repeat(64),
    source: "independent artifact hash record",
  };

  ledger.phase5a.find((item) => item.id === "phase5a.phase5b-handoff").disposition = "pass";

  assert.deepEqual(verifyLedger(ledger), []);
});

test("checked-in launch ledger passes the command-line verifier", () => {
  const result = spawnSync(process.execPath, [verifierPath, "--ledger", launchLedgerPath], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /"status":\s*"pass"/);
});

test("local recovery rehearsal exports, restores, and verifies a disposable D1 database", () => {
  const result = spawnSync(process.execPath, [rehearsalPath], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;

  assert.equal(result.status, 0, output);
  assert.match(output, /"status":\s*"pass"/);
  assert.match(output, /external.*Time Travel.*production.*restore.*pending/i);
});
