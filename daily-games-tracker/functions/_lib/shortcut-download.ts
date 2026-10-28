import type { AppEnv } from "./runtime";

export const SHORTCUT_DOWNLOAD_PATH = "/api/shortcut/download";

export function shortcutDownloadUrl(env: AppEnv): string | null {
  return env.SHORTCUT_BUCKET ? SHORTCUT_DOWNLOAD_PATH : null;
}
