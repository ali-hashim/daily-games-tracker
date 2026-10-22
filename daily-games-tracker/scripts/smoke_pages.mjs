import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const port = process.env.WHT_SMOKE_PORT ?? "8791";
const origin = `http://127.0.0.1:${port}`;
const wrangler = fileURLToPath(
  new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url),
);
const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const state = await mkdtemp(join(tmpdir(), "wht-pages-smoke-"));
const inviteToken = randomBytes(32).toString("base64url");
const inviteHash = createHash("sha256").update(inviteToken).digest("hex");
const expiresAt = new Date(Date.now() + 86_400_000).toISOString();
runWrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", state]);
runWrangler([
  "d1",
  "execute",
  "DB",
  "--local",
  "--persist-to",
  state,
  "--command",
  `INSERT INTO players (id, display_name) VALUES ('smoke-player', 'Smoke Test'); INSERT INTO registration_invites (id, player_id, token_hash, expires_at, created_by) VALUES ('smoke-invite', 'smoke-player', '${inviteHash}', '${expiresAt}', 'test');`,
]);
const child = spawn(
  process.execPath,
  [
    wrangler,
    "pages",
    "dev",
    "dist",
    "--port",
    port,
    "--show-interactive-dev-session=false",
    "--log-level",
    "error",
    "--persist-to",
    state,
  ],
  { cwd: projectDirectory, stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);

let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));

try {
  await waitUntilReady();

  const health = await fetch(`${origin}/api/health`);
  const healthJson = await health.json();
  assert.equal(health.status, 200);
  assert.equal(healthJson.status, "ok");
  assert.equal(healthJson.schemaVersion, 2);
  assert.equal(healthJson.request_id, health.headers.get("X-Request-ID"));
  assert.equal(health.headers.get("Cache-Control"), "no-store");

  const games = await fetch(`${origin}/api/games`);
  const gamesJson = await games.json();
  assert.deepEqual(
    gamesJson.games.map((game) => game.id),
    ["krillion", "maptap"],
  );
  assert.ok(gamesJson.request_id);

  const missing = await fetch(`${origin}/api/not-real`);
  const missingJson = await missing.json();
  assert.equal(missing.status, 404);
  assert.equal(missingJson.error_code, "NOT_FOUND");
  assert.ok(missingJson.request_id);

  const wrongMethod = await fetch(`${origin}/api/health`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  const methodJson = await wrongMethod.json();
  assert.equal(wrongMethod.status, 405);
  assert.equal(methodJson.error_code, "METHOD_NOT_ALLOWED");
  assert.equal(wrongMethod.headers.get("Allow"), "GET");

  const serviceWorker = await fetch(`${origin}/sw.js`);
  assert.equal(serviceWorker.status, 200);
  assert.equal(serviceWorker.headers.get("Cache-Control"), "no-cache");

  const home = await fetch(`${origin}/`);
  assert.match(await home.text(), /Winstitute of Higher Thinking/);

  const admin = await fetch(`${origin}/api/admin/players`);
  assert.ok([403, 503].includes(admin.status), "Anonymous admin access must fail closed");
  const adminPage = await fetch(`${origin}/admin`);
  assert.ok([403, 503].includes(adminPage.status), "Anonymous users must not load the admin UI");
  assert.equal(adminPage.headers.get("Cache-Control"), "no-store");

  const registrationPage = await fetch(`${origin}/register/${inviteToken}`);
  assert.equal(registrationPage.status, 200, "Valid invitation must load the registration shell");
  assert.equal(
    new URL(registrationPage.url).pathname.split("/")[1],
    "register",
    "Registration must not redirect to the public home page",
  );
  assert.equal(
    registrationPage.headers.get("Cache-Control"),
    "no-store",
    "Registration must not enter HTTP caches",
  );
  assert.equal(registrationPage.headers.get("Referrer-Policy"), "no-referrer");

  const registration = await fetch(`${origin}/api/register/${inviteToken}/redeem`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ label: "Smoke device" }),
  });
  assert.equal(registration.status, 201, "Registration must create a device and initial session");
  const registrationBody = await registration.json();
  const sessionCookie = registration.headers.get("Set-Cookie");
  assert.ok(
    sessionCookie?.includes("Secure; HttpOnly; SameSite=Lax"),
    "Session cookie attributes are missing",
  );
  assert.ok(
    typeof registrationBody.device_code === "string",
    "Registration must display a device code once",
  );

  const deviceStatus = await fetch(`${origin}/api/auth/device/status`, {
    headers: { Authorization: `Device ${registrationBody.device_code}` },
  });
  assert.equal(deviceStatus.status, 200, "Registered device must authenticate");
  const me = await fetch(`${origin}/api/auth/me`, {
    headers: { Cookie: sessionCookie.split(";")[0] },
  });
  assert.equal(me.status, 200, "Initial browser session must authenticate");
  // Device login exercises actual Pages route dispatch and both Set-Cookie headers.
  const browserPost = (path, cookie = "") =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json", Cookie: cookie },
      body: "{}",
    });
  const loginPage = await fetch(`${origin}/login`);
  assert.equal(loginPage.status, 200);
  assert.equal(loginPage.headers.get("Cache-Control"), "no-store");
  const loginStart = await browserPost("/api/auth/device/start");
  assert.equal(loginStart.status, 201);
  const loginBody = await loginStart.json();
  const flowCookie = loginStart.headers.getSetCookie()[0].split(";")[0];
  const launchUrl = new URL(loginBody.shortcut_url);
  assert.equal(launchUrl.searchParams.get("name"), "Upload to WHT");
  const challenge = launchUrl.searchParams.get("text").slice("DGT_LOGIN_V1:".length);
  assert.equal((await browserPost("/api/auth/device/complete", flowCookie)).status, 202);
  const approval = await fetch(`${origin}/api/auth/device/approve`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Device ${registrationBody.device_code}`,
    },
    body: JSON.stringify({ challenge }),
  });
  assert.equal(approval.status, 200);
  assert.equal(approval.headers.get("Set-Cookie"), null);
  assert.equal((await approval.json()).return_url, `${origin}/login`);
  assert.equal((await browserPost("/api/auth/device/complete")).status, 410);
  const completion = await browserPost("/api/auth/device/complete", flowCookie);
  assert.equal(completion.status, 200);
  const completionCookies = completion.headers.getSetCookie();
  assert.equal(completionCookies.length, 2);
  const loginSession = completionCookies.find((cookie) => cookie.startsWith("dgt_session="));
  assert.ok(loginSession.includes("Secure; HttpOnly; SameSite=Lax"));
  assert.ok(
    completionCookies.find((cookie) => cookie.startsWith("dgt_login_flow=")).includes("Max-Age=0"),
  );
  assert.equal(
    (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: loginSession.split(";")[0] } }))
      .status,
    200,
  );
  assert.equal((await browserPost("/api/auth/device/complete", flowCookie)).status, 410);
  const logout = await browserPost("/api/auth/logout", loginSession.split(";")[0]);
  assert.equal(logout.status, 200);
  assert.equal(
    (await fetch(`${origin}/api/auth/me`, { headers: { Cookie: loginSession.split(";")[0] } }))
      .status,
    401,
  );
  // A synthetic current-day result stays entirely inside this disposable local D1 database.
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "long",
    day: "numeric",
  }).format(new Date());
  const capture = {
    capture_schema: "dgt.capture.v1",
    source_kind: "shared_text",
    shared_text: `www.maptap.gg ${date}\n72🫢 99🔥 87🎓 78😁 80👏\nFinal score: 810`,
  };
  const sendImport = (mode, extra = {}) =>
    fetch(`${origin}/api/import/${mode}`, {
      method: "POST",
      headers: {
        Authorization: `Device ${registrationBody.device_code}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ shortcut_version: 1, capture, ...extra }),
    });
  const validResponse = await sendImport("validate");
  assert.equal(validResponse.status, 200, "Import validation must route through Pages");
  const valid = await validResponse.json();
  assert.equal(valid.status, "valid");
  assert.match(valid.confirmation_text, /Player: Smoke Test/);
  assert.equal(validResponse.headers.get("Cache-Control"), "no-store");
  assert.equal(Object.hasOwn(valid, "confirmed_result_hash"), false);
  const savedResponse = await sendImport("submit");
  assert.equal(savedResponse.status, 200, "Confirmed import must save atomically");
  const saved = await savedResponse.json();
  assert.equal(saved.status, "submitted");
  assert.equal(saved.final_score, 810);
  assert.match(saved.scoreboard_text, /KRILLION/);
  assert.match(saved.scoreboard_text, /MAPTAP/);
  assert.match(saved.scoreboard_text, /73 · 99 · 87 · 78 · 80/);
  assert.equal(saved.wht_url, `${origin}/daily/${valid.game_date}`);
  assert.equal(saved.completion_message, "Upload successful. Scoreboard copied to clipboard.");
  for (const mode of ["validate", "submit"]) {
    const duplicate = await sendImport(mode);
    assert.equal(duplicate.status, 200);
    const repeated = await duplicate.json();
    assert.equal(repeated.status, "already_submitted");
    assert.equal(repeated.message, "You already have a result saved for this game today.");
    assert.equal(repeated.scoreboard_text, saved.scoreboard_text);
    assert.equal(repeated.wht_url, saved.wht_url);
    assert.equal(
      repeated.completion_message,
      "You already have a result saved for this game today. Scoreboard copied to clipboard.",
    );
  }

  const invalidImport = await fetch(`${origin}/api/import/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shortcut_version: 1, capture }),
  });
  assert.equal(invalidImport.status, 401);
  assert.equal((await invalidImport.json()).error_code, "DEVICE_NOT_AUTHORIZED");
  const replay = await fetch(`${origin}/api/register/${inviteToken}/redeem`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(replay.status, 410, "Consumed invitation must not work twice");

  console.log(
    `PASS: Pages/Functions/D1 smoke test (schema ${healthJson.schemaVersion}; games ${gamesJson.games
      .map((game) => game.id)
      .join(
        ", ",
      )}; JSON 404/405; registration, device/session authentication, login start/approve/complete/logout, replay protection, cache policy)`,
  );
} catch (error) {
  if (output.trim()) console.error(output.trim());
  throw error;
} finally {
  stopProcessTree(child.pid);
  await rm(state, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Wrangler exited early with ${child.exitCode}`);
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Expected while the local runtime starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Wrangler did not become ready within 20 seconds");
}

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
    return;
  }
  child.kill("SIGTERM");
}

function runWrangler(args) {
  const result = spawnSync(process.execPath, [wrangler, ...args], {
    cwd: projectDirectory,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, `Local D1 setup failed: ${result.stderr}`);
}
