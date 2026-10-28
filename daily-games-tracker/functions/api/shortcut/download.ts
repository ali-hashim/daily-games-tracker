import { ApiError, requireMethod } from "../../_lib/http";
import { authenticateSession, refreshSession } from "../../_lib/sessions";
import type { AppData, AppEnv } from "../../_lib/runtime";

const MANIFEST_KEY = "latest.json";
const MAX_MANIFEST_BYTES = 4 * 1024;
const MAX_SHORTCUT_BYTES = 8 * 1024 * 1024;
const GENERIC_UNAVAILABLE_MESSAGE = "The Shortcut download is unavailable. Try again later.";

interface ShortcutManifest {
  commit: string;
  sha256: string;
  key: string;
}

export const onRequest: PagesFunction<AppEnv, string, AppData> = async ({ request, env, data }) => {
  requireMethod(request, ["GET"]);
  const session = await authenticateSession(request, env);
  await refreshSession(env, session);

  try {
    const bucket = env.SHORTCUT_BUCKET;
    if (!bucket) throw shortcutUnavailable();

    const manifestObject = await bucket.get(MANIFEST_KEY);
    if (!manifestObject || !isBoundedSize(manifestObject.size, MAX_MANIFEST_BYTES))
      throw shortcutUnavailable();
    const manifestBytes = new Uint8Array(await manifestObject.arrayBuffer());
    if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw shortcutUnavailable();

    let manifestValue: unknown;
    try {
      const manifestText = new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes);
      manifestValue = JSON.parse(manifestText) as unknown;
    } catch {
      throw shortcutUnavailable();
    }
    if (!isShortcutManifest(manifestValue)) throw shortcutUnavailable();

    const shortcutObject = await bucket.get(manifestValue.key);
    if (!shortcutObject || !isBoundedSize(shortcutObject.size, MAX_SHORTCUT_BYTES))
      throw shortcutUnavailable();
    const shortcutBytes = new Uint8Array(await shortcutObject.arrayBuffer());
    if (shortcutBytes.byteLength > MAX_SHORTCUT_BYTES) throw shortcutUnavailable();
    if ((await sha256(shortcutBytes)) !== manifestValue.sha256) throw shortcutUnavailable();

    return new Response(shortcutBytes, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'attachment; filename="Upload to WHT.shortcut"',
        "Content-Type": "application/vnd.apple.shortcut",
        "X-Request-ID": data.requestId,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw shortcutUnavailable();
  }
};

function isShortcutManifest(value: unknown): value is ShortcutManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const manifest = value as Record<string, unknown>;
  const keys = Object.keys(manifest);
  if (
    keys.length !== 3 ||
    !keys.includes("commit") ||
    !keys.includes("sha256") ||
    !keys.includes("key")
  )
    return false;
  if (
    typeof manifest.commit !== "string" ||
    !/^[a-f0-9]{40}$/.test(manifest.commit) ||
    typeof manifest.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    typeof manifest.key !== "string"
  )
    return false;
  return manifest.key === `shortcuts/${manifest.commit}/${manifest.sha256}.shortcut`;
}

function isBoundedSize(size: number, maximum: number): boolean {
  return Number.isSafeInteger(size) && size >= 0 && size <= maximum;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(input).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function shortcutUnavailable(): ApiError {
  return new ApiError(503, "SHORTCUT_UNAVAILABLE", GENERIC_UNAVAILABLE_MESSAGE);
}
