import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { assertSafeGeneratedPath } from "./path-safety.mjs";

const ROUTING_CASES = [
  ["validation-already-submitted", "already_submitted", "submitted"],
  ["validation-valid-submit-submitted", "valid", "submitted"],
  ["validation-valid-submit-already-submitted", "valid", "already_submitted"],
  ["validation-valid-submit-error", "valid", "error"],
  ["validation-valid-submit-update-required", "valid", "update_required"],
  ["validation-valid-submit-unknown", "valid", "unknown"],
  ["validation-error", "error", "submitted"],
  ["validation-update-required", "update_required", "submitted"],
  ["validation-unknown", "unknown", "submitted"],
];

const COMPLETION_CASES = [
  ["present", "@presentResponse"],
  ["empty", "@emptyResponse"],
  ["null", "@nullResponse"],
  ["missing", "@missingResponse"],
];

const replaceOnce = (source, pattern, replacement, label) => {
  if (!pattern.test(source)) throw new Error(`Maintained ${label} template is missing its fixture selector.`);
  return source.replace(pattern, replacement);
};

/**
 * Generate credential-free source variants for native fixture review.
 * These files deliberately stay outside the seven-probe compile set.
 */
export async function prepareRuntimeFixtures({ root, out, sha256 }) {
  const sourceRoot = join(root, "source");
  const fixtureRoot = join(out, "fixtures");
  await assertSafeGeneratedPath(fixtureRoot, out);
  await rm(fixtureRoot, { recursive: true, force: true });
  await mkdir(fixtureRoot, { recursive: true });

  const routingTemplate = await readFile(join(sourceRoot, "06-routing.cherri"), "utf8");
  const completionTemplate = await readFile(join(sourceRoot, "07-completion.cherri"), "utf8");
  const routingTemplateSha256 = sha256(Buffer.from(routingTemplate, "utf8"));
  const completionTemplateSha256 = sha256(Buffer.from(completionTemplate, "utf8"));
  const routingSelector = /^@validationStatus = "[^"]+"\r?\n@submitStatus = "[^"]+"/m;
  const completionSelector = /^@fixtureResponse = @presentResponse$/m;
  const entries = [];

  const writeFixture = async (probe, name, source, selector, templateSha256) => {
    const relativeName = `fixtures/${probe}/${name}.cherri`;
    const destination = join(out, relativeName);
    const content = `// Generated from ${selector}; credential-free fixture source only.\n${source}`;
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content, "utf8");
    entries.push({
      name: relativeName,
      probe,
      case: name,
      template: selector,
      templateSha256,
      sha256: sha256(Buffer.from(content, "utf8")),
      compiled: false,
    });
  };

  for (const [name, validationStatus, submitStatus] of ROUTING_CASES) {
    const source = replaceOnce(
      routingTemplate,
      routingSelector,
      `@validationStatus = "${validationStatus}"\n@submitStatus = "${submitStatus}"`,
      "06-routing.cherri",
    );
    await writeFixture(
      "06-routing",
      name,
      source,
      "source/06-routing.cherri",
      routingTemplateSha256,
    );
  }
  for (const [name, response] of COMPLETION_CASES) {
    const source = replaceOnce(
      completionTemplate,
      completionSelector,
      `@fixtureResponse = ${response}`,
      "07-completion.cherri",
    );
    await writeFixture(
      "07-completion",
      name,
      source,
      "source/07-completion.cherri",
      completionTemplateSha256,
    );
  }
  return entries;
}
