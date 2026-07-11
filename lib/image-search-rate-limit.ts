/**
 * In-memory rate limiting for `/api/image-search` (V1).
 */

const WINDOW_MINUTE_MS = 60 * 1000;
const WINDOW_HOUR_MS = 60 * 60 * 1000;

const LIMITS_PRODUCTION = {
  perMinute: 30,
  perHour: 300,
} as const;

const LIMITS_DEVELOPMENT = {
  perMinute: 60,
  perHour: 600,
} as const;

type RateLimitBucket = {
  minuteTimestamps: number[];
  hourTimestamps: number[];
};

const buckets = new Map<string, RateLimitBucket>();

function getLimits(): { perMinute: number; perHour: number } {
  if (process.env.NODE_ENV === "development") {
    return LIMITS_DEVELOPMENT;
  }
  return LIMITS_PRODUCTION;
}

/** Client id from proxy headers (server-side only). */
export function getImageSearchClientId(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }
  return "local";
}

function pruneTimestamps(timestamps: number[], windowMs: number, now: number): number[] {
  const cutoff = now - windowMs;
  return timestamps.filter((t) => t > cutoff);
}

export type ImageSearchRateLimitResult = {
  allowed: boolean;
  retryAfterSeconds?: number;
};

export function checkImageSearchRateLimit(
  request: Request,
  now = Date.now()
): ImageSearchRateLimitResult {
  const clientId = getImageSearchClientId(request);
  const limits = getLimits();
  let bucket = buckets.get(clientId);
  if (!bucket) {
    bucket = { minuteTimestamps: [], hourTimestamps: [] };
    buckets.set(clientId, bucket);
  }

  bucket.minuteTimestamps = pruneTimestamps(bucket.minuteTimestamps, WINDOW_MINUTE_MS, now);
  bucket.hourTimestamps = pruneTimestamps(bucket.hourTimestamps, WINDOW_HOUR_MS, now);

  if (bucket.minuteTimestamps.length >= limits.perMinute) {
    const oldest = bucket.minuteTimestamps[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + WINDOW_MINUTE_MS - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  if (bucket.hourTimestamps.length >= limits.perHour) {
    const oldest = bucket.hourTimestamps[0] ?? now;
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + WINDOW_HOUR_MS - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  bucket.minuteTimestamps.push(now);
  bucket.hourTimestamps.push(now);
  return { allowed: true };
}

/** Test-only: reset rate-limit buckets. */
export function __resetImageSearchRateLimitForTests(): void {
  buckets.clear();
}
