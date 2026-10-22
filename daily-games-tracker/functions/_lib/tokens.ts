import { ApiError } from "./http";

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

export function isToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}

export function requireSameOrigin(request: Request): void {
  const origin = request.headers.get("Origin");
  if (
    origin !== new URL(request.url).origin ||
    request.headers.get("Sec-Fetch-Site") === "cross-site"
  ) {
    throw new ApiError(403, "ORIGIN_REJECTED", "Open this page in WHT and try again.");
  }
}

export function objectBody(value: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid();
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !allowed.includes(key))) throw invalid();
  return body;
}

export function textField(value: unknown, max: number, optional = false): string | null {
  if (optional && (value === undefined || value === null || value === "")) return null;
  if (typeof value !== "string") throw invalid();
  const text = value.trim().normalize("NFC");
  if (!text || text.length > max || /[\u0000-\u001f\u007f]/.test(text)) throw invalid();
  return text;
}

export function invalid() {
  return new ApiError(400, "INVALID_INPUT", "Check the supplied fields and try again.");
}
