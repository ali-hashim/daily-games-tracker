import { PER_ISOLATE_RATE_LIMIT } from "./limits";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  readonly size: number;
  check(key: string): RateLimitDecision;
  reset(): void;
}

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  maxKeys: number;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const maxRequests = requirePositiveInteger(options.maxRequests, "maxRequests");
  const windowMs = requirePositiveInteger(options.windowMs, "windowMs");
  const maxKeys = requirePositiveInteger(options.maxKeys, "maxKeys");
  const now = options.now ?? Date.now;
  const buckets = new Map<string, Bucket>();

  function check(key: string): RateLimitDecision {
    const currentTime = now();
    pruneExpiredBuckets(currentTime);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= maxKeys) {
        return decision(false, 0, nextResetAt(currentTime), currentTime);
      }
      bucket = { count: 0, resetAt: currentTime + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= maxRequests) {
      return decision(false, 0, bucket.resetAt, currentTime);
    }

    bucket.count += 1;
    return decision(true, maxRequests - bucket.count, bucket.resetAt, currentTime);
  }

  function pruneExpiredBuckets(currentTime: number): void {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= currentTime) buckets.delete(key);
    }
  }

  function nextResetAt(currentTime: number): number {
    let resetAt = currentTime + windowMs;
    for (const bucket of buckets.values()) {
      resetAt = Math.min(resetAt, bucket.resetAt);
    }
    return resetAt;
  }

  return {
    get size() {
      return buckets.size;
    },
    check,
    reset: () => buckets.clear(),
  };
}

export const requestRateLimiter = createRateLimiter(PER_ISOLATE_RATE_LIMIT);

export function requestRateLimitKey(request: Request): string {
  const rawClient = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const client = rawClient.length <= 128 ? rawClient : "unknown";
  const pathname = new URL(request.url).pathname;
  const normalizedRoute = pathname
    .replace(/^(\/api)?\/register\/[^/]+/, "$1/register/[token]")
    .replace(/^\/register\/[^/]+/, "/register/[token]");
  const route = normalizedRoute.length <= 256 ? normalizedRoute : normalizedRoute.slice(0, 256);
  return `${client}|${request.method}|${route}`;
}

export function checkRequestRateLimit(request: Request): RateLimitDecision {
  return requestRateLimiter.check(requestRateLimitKey(request));
}

function decision(
  allowed: boolean,
  remaining: number,
  resetAt: number,
  currentTime: number,
): RateLimitDecision {
  return {
    allowed,
    remaining,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - currentTime) / 1_000)),
  };
}

function requirePositiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}
