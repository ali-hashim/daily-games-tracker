export interface AppEnv {
  DB: D1Database;
  APP_ENV?: "local" | "preview" | "production" | "test";
  APP_ORIGIN?: string;
  CLOUDFLARE_ACCESS_DOMAIN?: string;
  CLOUDFLARE_ACCESS_AUD?: string;
  ADMIN_EMAIL?: string;
  SHORTCUT_INSTALL_URL?: string;
}

export interface AppData extends Record<string, unknown> {
  requestId: string;
  admin?: { email: string; subject: string };
}

export function createRequestId(): string {
  return `req_${crypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;
}
