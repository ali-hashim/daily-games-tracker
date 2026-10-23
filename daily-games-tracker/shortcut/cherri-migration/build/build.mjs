import { readFile, writeFile, mkdir, mkdtemp, copyFile, readdir, stat, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { basename, dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareRuntimeFixtures } from "./runtime-fixtures.mjs";
import { assertSafeGeneratedPath } from "./path-safety.mjs";

// No downloads, installs, signing requests, or application requests occur here.
// --prepare only generates source. --check executes an explicitly supplied tool.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const modes = args.filter((arg) => arg === "--prepare" || arg === "--check");
if (modes.length !== 1)
  throw new Error("Choose exactly one mode: --prepare or --check --compiler PATH [--python PATH] [--check-fixtures].");
const options = new Map();
let checkFixtures = false;
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === "--prepare" || arg === "--check") continue;
  if (arg === "--check-fixtures") {
    if (checkFixtures) throw new Error("--check-fixtures may be supplied only once.");
    checkFixtures = true;
    continue;
  }
  if (arg === "--sign")
    throw new Error("Signing is not implemented or approved. Review the exact unsigned payload first.");
  if (arg === "--compiler" || arg === "--python") {
    if (options.has(arg)) throw new Error(`${arg} may be supplied only once.`);
    const path = args[index + 1];
    if (!path || path.startsWith("--")) throw new Error(`${arg} requires a path value.`);
    options.set(arg, path);
    index += 1;
    continue;
  }
  throw new Error(`Unknown argument ${arg}. Use --prepare or --check --compiler PATH [--python PATH] [--check-fixtures].`);
}
const mode = modes[0];
if (mode === "--prepare" && options.size > 0)
  throw new Error("--prepare does not accept --compiler or --python.");
if (mode === "--prepare" && checkFixtures)
  throw new Error("--prepare does not accept --check-fixtures.");
if (mode === "--check" && !options.has("--compiler"))
  throw new Error("--check requires --compiler PATH to an independently built, verified pinned compiler.");
const compilerPath = mode === "--check" ? resolve(options.get("--compiler")) : null;
if (compilerPath) {
  try {
    if (!(await stat(compilerPath)).isFile()) throw new Error("not a file");
  } catch {
    throw new Error("Compiler must be an existing file.");
  }
}
const out = join(root, "out");
await mkdir(out, { recursive: true });
await assertSafeGeneratedPath(out, root);
const compiled = join(out, "compiled");
const compiledFixtures = join(out, "compiled-fixtures");
const workRoot = join(out, ".work");
const inspectionPath = join(out, "inspection.json");
const fixtureInspectionPath = join(out, "runtime-fixture-inspection.json");
if (mode === "--prepare") {
  await assertSafeGeneratedPath(compiled, out);
  await assertSafeGeneratedPath(compiledFixtures, out);
  await assertSafeGeneratedPath(workRoot, out);
  await assertSafeGeneratedPath(inspectionPath, out, { allowBoundary: true });
  await assertSafeGeneratedPath(fixtureInspectionPath, out, { allowBoundary: true });
  await rm(compiled, { recursive: true, force: true });
  await rm(compiledFixtures, { recursive: true, force: true });
  await rm(workRoot, { recursive: true, force: true });
  await rm(inspectionPath, { force: true });
  await rm(fixtureInspectionPath, { force: true });
}
const lockPath = join(root, "toolchain.lock.json");
const lockBytes = await readFile(lockPath);
const lock = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(lockBytes));
const lockSha256 = sha256(lockBytes);
const buildFlags = lock?.build?.flags;
if (
  !Array.isArray(buildFlags) ||
  buildFlags.length === 0 ||
  buildFlags.some((flag) => typeof flag !== "string" || !flag.startsWith("--")) ||
  new Set(buildFlags).size !== buildFlags.length
)
  throw new Error("toolchain.lock.json must provide build.flags as CLI flags.");
for (const requiredFlag of ["--skip-sign", "--derive-uuids"])
  if (!buildFlags.includes(requiredFlag))
    throw new Error(`Routine builds must use lock build.flags with ${requiredFlag}.`);
if (buildFlags.includes("--sign"))
  throw new Error("Routine builds must use lock build.flags without --sign.");
if (!/^[0-9a-f]{40}$/.test(lock.compiler?.commit ?? ""))
  throw new Error("toolchain.lock.json must provide a full lowercase compiler commit.");
if (typeof lock.go?.version !== "string" || lock.go.version.length === 0)
  throw new Error("toolchain.lock.json must provide a Go version.");
if (typeof lock.build?.runner !== "string" || lock.build.runner.length === 0)
  throw new Error("toolchain.lock.json must provide a build runner.");
const capturePath = resolve(root, "..", "capture-safari.js");
const captureBytes = await readFile(capturePath);
const captureText = new TextDecoder("utf-8", { fatal: true }).decode(captureBytes);
if (!Buffer.from(captureText, "utf8").equals(captureBytes))
  throw new Error("Capture must round-trip exactly as UTF-8.");
const expectedCaptureSha256 = "fb50c544f795a5db5102c6e936b3bea723eca7fd92f4c6677d2780bfdf0ba2fb";
const expectedCaptureBytes = 5250;
if (lock.capture?.source !== "daily-games-tracker/shortcut/capture-safari.js")
  throw new Error("toolchain.lock.json capture.source does not identify the maintained capture.");
if (lock.capture?.sha256 !== expectedCaptureSha256 || lock.capture?.bytes !== expectedCaptureBytes)
  throw new Error("toolchain.lock.json capture metadata does not match the approved capture.");
if (captureBytes.length !== expectedCaptureBytes || sha256(captureBytes) !== expectedCaptureSha256)
  throw new Error("Maintained capture bytes or SHA-256 differ from the approved capture.");
const raw = (text) => "'" + text.replaceAll("'", "\\'") + "'";
const captureSource = `#define name WHT Exact Capture Probe\n#define mac false\n#define inputs webpage, text\n#define from sharesheet\n#define noinput stopwith "Share a Safari webpage to this probe."\n\naction 'runjavascriptonwebpage' whtExactCapture(variable webpage: 'WFInput', rawtext javascript: 'WFJavaScript')\n\n@originalInput = ShortcutInput\nconst inputType = typeOf(@originalInput)\nalert(inputType, "Original input type")\nconst captureResult = whtExactCapture(@originalInput, ${raw(captureText)})\nquicklook(captureResult)\nstop()\n`;
await writeFile(join(out, "04-capture.cherri"), captureSource, "utf8");
const sourceNames = (await readdir(join(root, "source")))
  .filter((name) => /^0[1-7]-.+\.cherri$/.test(name))
  .sort();
for (const name of sourceNames) await copyFile(join(root, "source", name), join(out, name));
const manifest = {
  schemaVersion: 1,
  status: "prepared; not compiled",
  compiler: lock.compiler,
  go: lock.go,
  compilerVerification: "not performed; prepared source only",
  compilerBinarySha256: null,
  provenance: {
    compilerCommit: lock.compiler.commit,
    compilerSourceArchiveSha256: lock.compiler.sourceArchiveSha256 ?? null,
    localCompiler: "not supplied",
  },
  flags: buildFlags,
  buildFlags,
  toolchainLockSha256: lockSha256,
  capture: { sha256: sha256(captureBytes), bytes: captureBytes.length },
  experiments: [],
  sourceHashes: [],
  artifacts: [],
  runtimeFixtures: {
    status: "prepared; not compiled",
    copyFailureRuntime: "requires native device permission testing",
    variants: [],
  },
  reproducibility: {
    disposition: lock.build?.byteReproducibility ?? "not established",
    compared: false,
    byteIdentical: null,
    propertyListsSemanticallyEqual: null,
    differingPaths: [],
  },
  nativeExecution: "not performed",
  nativeAcceptance: "not performed",
  signing: "not performed",
};
const names = [...sourceNames, "04-capture.cherri"].sort();
manifest.runtimeFixtures.variants = await prepareRuntimeFixtures({ root, out, sha256 });
for (const name of names) {
  const sourceHash = sha256(await readFile(join(out, name)));
  manifest.experiments.push({ source: name, sha256: sourceHash });
  manifest.sourceHashes.push({ name, sha256: sourceHash });
}
if (mode === "--check") {
  const compiler = compilerPath;
  manifest.compilerBinarySha256 = sha256(await readFile(compiler));
  manifest.compilerVerification = "supplied compiler binary hashed; source and Go pins remain caller responsibility";
  manifest.provenance.localCompiler = "supplied; path omitted from manifest";
  const python = options.has("--python")
    ? options.get("--python")
    : process.platform === "win32"
      ? "python"
      : "python3";
  const inspections = [];
  await assertSafeGeneratedPath(compiled, out);
  await assertSafeGeneratedPath(compiledFixtures, out);
  await assertSafeGeneratedPath(workRoot, out);
  await assertSafeGeneratedPath(inspectionPath, out, { allowBoundary: true });
  await assertSafeGeneratedPath(fixtureInspectionPath, out, { allowBoundary: true });
  await rm(compiled, { recursive: true, force: true });
  await mkdir(compiled, { recursive: true });
  await rm(compiledFixtures, { recursive: true, force: true });
  if (checkFixtures) await mkdir(compiledFixtures, { recursive: true });
  await rm(workRoot, { recursive: true, force: true });
  await mkdir(workRoot, { recursive: true });
  const execute = (command, commandArgs, cwd = out) => {
    const result = spawnSync(command, commandArgs, {
      cwd,
      encoding: "utf8",
      timeout: 120000,
      shell: false,
    });
    if (result.error || result.status !== 0) {
      const detail = [result.error?.message, result.stderr, result.stdout]
        .filter((value) => typeof value === "string" && value.length > 0)
        .join("\n")
        .trim();
      throw new Error(
        `${command} failed (exit ${result.status ?? "unknown"}): ${detail || "no process output"}`,
      );
    }
    return result.stdout;
  };
  const compileOne = async (name, experiment = name.split("-")[0], strictCurrent = true) => {
    const sourceName = basename(name);
    const work = await mkdtemp(join(workRoot, sourceName.replace(".cherri", "") + "-"));
    await copyFile(join(out, name), join(work, sourceName));
    // Cherri resolves its embedded action definitions relative to the process
    // working directory. Keep the source in an isolated work directory while
    // running from the supplied compiler's directory, which may be a pinned
    // source checkout or a release bundle containing those definitions.
    execute(compiler, [join(work, sourceName), ...buildFlags], dirname(compiler));
    // Each invocation uses a fresh directory, so stale output cannot pass.
    const created = (await readdir(work)).filter((n) => n.endsWith(".shortcut"));
    if (created.length !== 1)
      throw new Error(
        `Expected exactly one new unsigned Shortcut for ${name}; found ${created.length}.`,
      );
    const artifact = join(work, created[0]);
    const inspectorArgs = [
      join(root, "build", "inspect-shortcut.py"),
      artifact,
      "--experiment",
      experiment,
      "--capture",
      capturePath,
    ];
    if (strictCurrent && (experiment === "06" || experiment === "07")) inspectorArgs.push("--strict-current");
    const report = JSON.parse(execute(python, inspectorArgs));
    return { artifact, report };
  };
  for (const name of names) {
    const { artifact, report } = await compileOne(name);
    inspections.push(report);
    const published = join(compiled, name.replace(".cherri", ".shortcut"));
    await copyFile(artifact, published);
    manifest.artifacts.push({ name: name.replace(".cherri", ".shortcut"), sha256: report.sha256 });
    const manifestEntry = manifest.experiments.find((experiment) => experiment.source === name);
    manifestEntry.artifact = published.slice(root.length + 1).replaceAll("\\", "/");
    manifestEntry.artifactSha256 = report.sha256;
    if (name === "01-alert.cherri") {
      const second = await compileOne(name);
      const comparison = JSON.parse(
        execute(python, [
          join(root, "build", "compare-plists.py"),
          artifact,
          second.artifact,
        ]),
      );
      manifest.reproducibility = {
        disposition: manifest.reproducibility.disposition,
        compared: true,
        ...comparison,
      };
    }
  }
  const fixtureInspections = [];
  if (checkFixtures) {
    for (const entry of manifest.runtimeFixtures.variants) {
      const experiment = entry.probe.split("-")[0];
      const { artifact, report } = await compileOne(entry.name, experiment, experiment === "07");
      const published = join(compiledFixtures, entry.probe, `${entry.case}.shortcut`);
      const publishedDirectory = dirname(published);
      await assertSafeGeneratedPath(publishedDirectory, compiledFixtures);
      await mkdir(publishedDirectory, { recursive: true });
      await assertSafeGeneratedPath(published, compiledFixtures);
      await copyFile(artifact, published);
      entry.compiled = true;
      entry.artifact = published.slice(root.length + 1).replaceAll("\\", "/");
      entry.artifactSha256 = report.sha256;
      entry.inspection = "structural checks passed; native execution unproven";
      fixtureInspections.push({ ...report, fixture: entry.name });
    }
    manifest.runtimeFixtures.status =
      "compiled and structurally inspected; native execution unproven";
    await writeFile(fixtureInspectionPath, JSON.stringify(fixtureInspections, null, 2) + "\n");
  }
  manifest.status =
    "unsigned experiments compiled and structurally inspected; native execution unproven";
  await writeFile(inspectionPath, JSON.stringify(inspections, null, 2) + "\n");
}
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `${manifest.status}; ${names.length} experiments; ${manifest.runtimeFixtures.variants.length} runtime fixtures; capture SHA-256 ${manifest.capture.sha256}`,
);
