export const MAX_API_BODY_BYTES = 384 * 1024;

// This is intentionally an in-memory per-isolate guard, not a durable quota.
export const PER_ISOLATE_RATE_LIMIT = {
  maxRequests: 120,
  windowMs: 60_000,
  maxKeys: 1_024,
} as const;
