import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const SUPPORTED_DISPOSITIONS = Object.freeze(["pass", "pending", "blocked", "waived"]);
export const SIGNED_CANDIDATE_SHA256 =
  "19b4be2bd3c920ff6061e416d364bf53c8e2cd2d6161d0330a430dd0274b90cd";
export const PREVIEW_ALIAS = "https://preview.example.invalid";

export const REQUIRED_REFERENCES = Object.freeze([
  "shortcut/PHASE_5A_HANDOFF.md",
  "shortcut/PHASE_5A_NATIVE_ACCEPTANCE.md",
  "PHASE_5A_PLAN.md",
  "EXECUTION_PLAN.md",
  "../Daily_Games_Tracker_Final_Implementation_Plan.md#20-launch-checklist",
  "../Daily_Games_Tracker_Final_Implementation_Plan.md#21-definition-of-done",
]);

export const REQUIRED_PHASE9_GATE_IDS = Object.freeze([
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
]);

export const REQUIRED_PHASE5A_GATE_IDS = Object.freeze([
  "phase5a.accepted-source-revision",
  "phase5a.compiler-lock-and-build",
  "phase5a.signed-candidate",
  "phase5a.native-core-flows",
  "phase5a.saved-result-integrity",
  "phase5a.protected-signing-workflow",
  "phase5a.rollback-reference",
  "phase5a.phase5b-handoff",
]);

export const REQUIRED_PHASE5A_LIMITATIONS = Object.freeze({
  "phase5a.native-edge-case-matrix": "native edge-case matrix",
  "phase5a.native-race-concurrency": "native race/concurrency exercise",
  "phase5a.general-reproducibility": "general byte/semantic reproducibility",
  "phase5a.operational-signing-activation": "operational signing activation",
  "phase5a.user-reported-backup": "user-reported-only backup without independent identifier/hash",
});

const PHASE5B_HANDOFF_DEPENDENCIES = Object.freeze([
  "phase5a.saved-result-integrity",
  "phase5a.protected-signing-workflow",
  "phase5a.rollback-reference",
]);

const BOUNDED_OR_UNPROVEN_WORDING =
  /\b(?:bounded|pending|no pretest|unproven|unproved|not (?:independently|established|verified)|remains open)\b/i;
const CONTRADICTORY_PASS_WORDING =
  /\b(?:not|no|never|without|unavailable|missing|absent|disabled|unproved|unverified|unconfirmed|pending|remains|still)\b|(?<!read-)\bonly\b/i;

const NON_PASS_GATE_IDS = Object.freeze({
  "launch.terms-compatibility": "terms compatibility review",
  "launch.pages-d1": "Cloudflare Pages/D1 production project",
  "launch.production-secrets": "production secrets and environment separation",
  "launch.shortcut-release": "public Shortcut release/install URL",
  "launch.ios-version-matrix": "two-iOS-version device matrix",
  "launch.safari-pwa-login": "Safari and Home Screen PWA login coverage",
  "launch.admin-recovery": "administrator recovery documentation",
  "launch.device-invitations": "player invitations",
  "launch.seven-player-pilot": "seven-player pilot",
  "launch.clipboard-privacy": "native clipboard privacy coverage",
  "launch.backup-restore": "external backup restore",
  "launch.monitoring-free-tier": "current Cloudflare/free-tier margin",
});

const allItems = (ledger) => [
  ["gates", ledger?.gates],
  ["phase5a", ledger?.phase5a],
  ["limitations", ledger?.limitations],
  ["rehearsal", ledger?.rehearsal],
  ["operational_evidence", ledger?.operational_evidence],
];

function addFailure(failures, message) {
  failures.push(message);
}

function validateItems(failures, collectionName, items) {
  if (!Array.isArray(items) || items.length === 0) {
    addFailure(failures, `${collectionName} must be a non-empty array`);
    return [];
  }

  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!item || typeof item !== "object") {
      addFailure(failures, `${collectionName}[${index}] must be an object`);
      continue;
    }
    if (typeof item.id !== "string" || item.id.length === 0) {
      addFailure(failures, `${collectionName}[${index}] must have a non-empty id`);
    } else if (ids.has(item.id)) {
      addFailure(failures, `${collectionName} contains duplicate id ${item.id}`);
    } else {
      ids.add(item.id);
    }
    if (!SUPPORTED_DISPOSITIONS.includes(item.disposition)) {
      addFailure(
        failures,
        `${collectionName}.${item.id ?? index} has unsupported disposition ${String(item.disposition)}; must be one of ${SUPPORTED_DISPOSITIONS.join(", ")}`,
      );
    }
    if (typeof item.evidence !== "string" || item.evidence.trim().length === 0) {
      addFailure(failures, `${collectionName}.${item.id ?? index} must include evidence text`);
    }
    if (!Array.isArray(item.references) || item.references.length === 0) {
      addFailure(
        failures,
        `${collectionName}.${item.id ?? index} must include at least one reference`,
      );
    }
  }
  return ids;
}

function validateRequiredIds(failures, collectionName, ids, requiredIds) {
  for (const requiredId of requiredIds) {
    if (!ids.has(requiredId)) {
      addFailure(failures, `${collectionName} is missing required item ${requiredId}`);
    }
  }
}

function evidenceText(entry) {
  return [entry?.evidence, entry?.evidence_contract?.source, entry?.evidence_contract?.description]
    .filter((value) => typeof value === "string")
    .join(" ");
}

function requireEvidenceContract(failures, entry, requirement) {
  const contract = entry?.evidence_contract;
  const evidence = typeof entry?.evidence === "string" ? entry.evidence : "";
  const text = evidenceText(entry);
  if (!contract || contract.verified !== true || contract.basis !== requirement.basis) {
    addFailure(
      failures,
      `${entry.id} requires ${requirement.label} with a verified ${requirement.basis} evidence contract`,
    );
    return;
  }
  if (BOUNDED_OR_UNPROVEN_WORDING.test(text) || CONTRADICTORY_PASS_WORDING.test(text)) {
    addFailure(
      failures,
      `${entry.id} cannot use bounded/pending/no-pretest or other unproven wording for a pass`,
    );
  }
  if (requirement.pattern && !requirement.pattern.test(evidence)) {
    addFailure(failures, `${entry.id} requires ${requirement.label}`);
  }
  if (requirement.validate) {
    requirement.validate(failures, entry, contract);
  }
}

export function verifyLedger(ledger, options = {}) {
  const failures = [];
  if (!ledger || typeof ledger !== "object" || Array.isArray(ledger)) {
    return ["ledger must be a JSON object"];
  }

  if (ledger.schema_version !== 1) {
    addFailure(failures, "ledger schema_version must be 1");
  }
  if (ledger.phase !== "Phase 9") {
    addFailure(failures, "ledger phase must be Phase 9");
  }
  if (ledger.preview?.alias !== PREVIEW_ALIAS) {
    addFailure(failures, `ledger preview.alias must be ${PREVIEW_ALIAS}`);
  }
  if (ledger.candidate?.signed_sha256 !== SIGNED_CANDIDATE_SHA256) {
    addFailure(
      failures,
      `ledger must preserve signed candidate SHA-256 ${SIGNED_CANDIDATE_SHA256}`,
    );
  }

  if (!Array.isArray(ledger.references)) {
    addFailure(failures, "ledger references must be an array");
  } else {
    for (const requiredReference of REQUIRED_REFERENCES) {
      if (!ledger.references.includes(requiredReference)) {
        addFailure(failures, `ledger is missing required reference ${requiredReference}`);
      }
    }
    if (options.checkReferences) {
      const root = options.root ?? resolve(dirname(fileURLToPath(import.meta.url)), "..");
      for (const reference of ledger.references) {
        const fileReference = typeof reference === "string" ? reference.split("#", 1)[0] : "";
        if (!fileReference) continue;
        if (!existsSync(resolve(root, fileReference))) {
          addFailure(failures, `ledger reference does not exist: ${reference}`);
        }
      }
    }
  }

  const idsByCollection = new Map();
  for (const [collectionName, items] of allItems(ledger)) {
    idsByCollection.set(collectionName, validateItems(failures, collectionName, items));
  }
  validateRequiredIds(failures, "gates", idsByCollection.get("gates"), REQUIRED_PHASE9_GATE_IDS);
  validateRequiredIds(
    failures,
    "phase5a",
    idsByCollection.get("phase5a"),
    REQUIRED_PHASE5A_GATE_IDS,
  );

  const limitationItems = Array.isArray(ledger.limitations) ? ledger.limitations : [];
  const limitationsById = new Map(limitationItems.map((item) => [item?.id, item]));
  for (const [id, requiredText] of Object.entries(REQUIRED_PHASE5A_LIMITATIONS)) {
    const item = limitationsById.get(id);
    if (!item) {
      addFailure(failures, `missing required Phase 5A limitation ${id}`);
      continue;
    }
    if (typeof item.limitation !== "string" || !item.limitation.includes(requiredText)) {
      addFailure(failures, `${id} must preserve limitation text: ${requiredText}`);
    }
    if (item.disposition === "pass") {
      addFailure(failures, `${id} is a formal limitation and cannot be marked pass`);
    }
    if (
      id.endsWith("native-edge-case-matrix") ||
      id.endsWith("native-race-concurrency") ||
      id.endsWith("general-reproducibility")
    ) {
      if (item.disposition !== "waived") {
        addFailure(failures, `${id} must remain explicitly waived`);
      }
    }
  }

  for (const [id, label] of Object.entries(NON_PASS_GATE_IDS)) {
    const item = [
      ...(ledger.gates ?? []),
      ...(ledger.phase5a ?? []),
      ...(ledger.limitations ?? []),
    ].find((entry) => entry?.id === id);
    if (item?.disposition === "pass") {
      addFailure(failures, `${label} (${id}) cannot be marked pass without direct evidence`);
    }
  }

  const signingGate = (ledger.phase5a ?? []).find(
    (item) => item?.id === "phase5a.protected-signing-workflow",
  );
  if (!signingGate) {
    addFailure(failures, "phase5a must include protected signing workflow");
  }

  const rollbackGate = (ledger.phase5a ?? []).find(
    (item) => item?.id === "phase5a.rollback-reference",
  );
  if (!rollbackGate) {
    addFailure(failures, "phase5a must include rollback reference");
  } else if (rollbackGate.disposition === "pass") {
    requireEvidenceContract(failures, rollbackGate, {
      basis: "independent_artifact",
      label: "independently identified/hash evidence",
      pattern: /independent(?:ly)?[\s-]+(?:identified|verified).*hash/i,
      validate: (validationFailures, entry, contract) => {
        if (typeof contract.identifier !== "string" || contract.identifier.trim().length === 0) {
          addFailure(
            validationFailures,
            `${entry.id} requires an independently identified rollback artifact`,
          );
        }
        if (typeof contract.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(contract.sha256)) {
          addFailure(
            validationFailures,
            `${entry.id} requires an independently verified SHA-256 hash`,
          );
        }
      },
    });
  }

  const savedResultGate = (ledger.phase5a ?? []).find(
    (item) => item?.id === "phase5a.saved-result-integrity",
  );
  if (savedResultGate?.disposition === "pass") {
    requireEvidenceContract(failures, savedResultGate, {
      basis: "independent",
      label: "explicit independent evidence",
      pattern: /independent/i,
    });
  }

  if (signingGate?.disposition === "pass") {
    requireEvidenceContract(failures, signingGate, {
      basis: "operational",
      label: "activated/operational evidence",
      pattern: /(?:activated|operational|executed|successful)/i,
    });
  }

  const phase5aById = new Map((ledger.phase5a ?? []).map((item) => [item?.id, item]));
  const phase5bHandoff = phase5aById.get("phase5a.phase5b-handoff");
  if (phase5bHandoff?.disposition === "pass") {
    for (const dependencyId of PHASE5B_HANDOFF_DEPENDENCIES) {
      if (phase5aById.get(dependencyId)?.disposition !== "pass") {
        addFailure(
          failures,
          `phase5a.phase5b-handoff requires ${dependencyId} to be pass before the handoff can be pass`,
        );
      }
    }
  }

  return failures;
}

function parseLedgerPath(args) {
  const index = args.indexOf("--ledger");
  return index === -1
    ? resolve(dirname(fileURLToPath(import.meta.url)), "../reports/phase9-launch-gates.json")
    : args[index + 1];
}

async function main() {
  const ledgerPath = parseLedgerPath(process.argv.slice(2));
  if (!ledgerPath) {
    throw new Error("Usage: node phase9-verify-launch-gates.mjs [--ledger PATH]");
  }
  const ledger = JSON.parse(await readFile(resolve(ledgerPath), "utf8"));
  const failures = verifyLedger(ledger, {
    checkReferences: true,
    root: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  });
  if (failures.length > 0) {
    console.error(JSON.stringify({ status: "fail", failures }, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify(
      {
        status: "pass",
        phase: ledger.phase,
        signedCandidateSha256: ledger.candidate.signed_sha256,
        counts: {
          phase9: ledger.gates.length,
          phase5a: ledger.phase5a.length,
          limitations: ledger.limitations.length,
          rehearsal: ledger.rehearsal.length,
          operationalEvidence: ledger.operational_evidence.length,
        },
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
