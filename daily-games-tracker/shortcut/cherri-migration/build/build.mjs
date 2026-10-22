import { readFile, writeFile, mkdir, mkdtemp, copyFile, readdir, stat, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// No downloads, installs, signing requests, or application requests occur here.
// --prepare only generates source. --check executes an explicitly supplied tool.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
if (args.includes("--sign"))
  throw new Error(
    "Signing is not implemented or approved. Review the exact unsigned payload first.",
  );
if (
  args.some(
    (arg) =>
      !["--prepare", "--check", "--compiler", "--python"].includes(arg) &&
      !args.some((v, i) => ["--compiler", "--python"].includes(v) && args[i + 1] === arg),
  )
)
  throw new Error("Unknown argument. Use --prepare or --check --compiler PATH [--python PATH].");
const out = join(root, "out");
await mkdir(out, { recursive: true });
const compiled = join(out, "compiled");
const capturePath = resolve(root, "..", "capture-safari.js");
const captureBytes = await readFile(capturePath);
const captureText = new TextDecoder("utf-8", { fatal: true }).decode(captureBytes);
if (!Buffer.from(captureText, "utf8").equals(captureBytes))
  throw new Error("Capture must round-trip exactly as UTF-8.");
const raw = (text) => "'" + text.replaceAll("'", "\\'") + "'";
const captureSource = `#include 'actions/basic'\n#define name WHT Exact Capture Probe\n#define mac false\n#define inputs webpage, text\n#define from sharesheet\n#define noinput stopwith "Share a Safari webpage to this probe."\n\naction 'runjavascriptonwebpage' whtExactCapture(variable webpage: 'WFInput', rawtext javascript: 'WFJavaScript')\n\n@originalInput = ShortcutInput\nconst inputType = typeOf(@originalInput)\nalert(inputType, "Original input type")\nconst captureResult = whtExactCapture(@originalInput, ${raw(captureText)})\nquicklook(captureResult)\nstop()\n`;
await writeFile(join(out, "04-capture.cherri"), captureSource, "utf8");
const sourceNames = (await readdir(join(root, "source")))
  .filter((name) => name.endsWith(".cherri"))
  .sort();
for (const name of sourceNames) await copyFile(join(root, "source", name), join(out, name));
const lock = JSON.parse(await readFile(join(root, "toolchain.lock.json"), "utf8"));
const manifest = {
  schemaVersion: 1,
  status: "prepared; not compiled",
  compiler: lock.compiler,
  go: lock.go,
  flags: ["--skip-sign", "--derive-uuids"],
  capture: { sha256: sha256(captureBytes), bytes: captureBytes.length },
  experiments: [],
  nativeAcceptance: "not performed",
  signing: "not performed",
};
const names = [...sourceNames, "04-capture.cherri"].sort();
for (const name of names)
  manifest.experiments.push({ source: name, sha256: sha256(await readFile(join(out, name))) });
if (args.includes("--check")) {
  if (!args.includes("--compiler") || !value("--compiler"))
    throw new Error(
      "--check requires --compiler PATH to an independently built, verified pinned compiler.",
    );
  const compiler = resolve(value("--compiler"));
  if (!(await stat(compiler)).isFile()) throw new Error("Compiler must be an existing file.");
  manifest.compilerBinarySha256 = sha256(await readFile(compiler));
  const python = args.includes("--python")
    ? value("--python")
    : process.platform === "win32"
      ? "python"
      : "python3";
  const inspections = [];
  await rm(compiled, { recursive: true, force: true });
  await mkdir(compiled, { recursive: true });
  const execute = (command, commandArgs, cwd = out) => {
    const result = spawnSync(command, commandArgs, {
      cwd,
      encoding: "utf8",
      timeout: 120000,
      shell: false,
    });
    if (result.error || result.status !== 0)
      throw new Error(
        `${command} failed: ${result.error?.message ?? result.stderr ?? result.stdout}`,
      );
    return result.stdout;
  };
  for (const name of names) {
    const work = await mkdtemp(join(out, name.replace(".cherri", "") + "-"));
    await copyFile(join(out, name), join(work, name));
    execute(compiler, [join(work, name), "--skip-sign", "--derive-uuids"], work);
    // Each invocation uses a fresh directory, so stale output cannot pass.
    const created = (await readdir(work)).filter((n) => n.endsWith(".shortcut"));
    if (created.length !== 1)
      throw new Error(
        `Expected exactly one new unsigned Shortcut for ${name}; found ${created.length}.`,
      );
    const artifact = join(work, created[0]);
    const report = JSON.parse(
      execute(python, [
        join(root, "build", "inspect-shortcut.py"),
        artifact,
        "--experiment",
        name.split("-")[0],
        "--capture",
        capturePath,
      ]),
    );
    inspections.push(report);
    const published = join(compiled, name.replace(".cherri", ".shortcut"));
    await copyFile(artifact, published);
    const manifestEntry = manifest.experiments.find((experiment) => experiment.source === name);
    manifestEntry.artifact = published.slice(root.length + 1).replaceAll("\\", "/");
    manifestEntry.artifactSha256 = report.sha256;
  }
  manifest.status =
    "unsigned experiments compiled and structurally inspected; native execution unproven";
  await writeFile(join(out, "inspection.json"), JSON.stringify(inspections, null, 2) + "\n");
}
await writeFile(join(out, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `${manifest.status}; ${names.length} experiments; capture SHA-256 ${manifest.capture.sha256}`,
);
