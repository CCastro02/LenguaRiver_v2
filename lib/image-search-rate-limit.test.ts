/**
 * Run: `npx tsx lib/image-search-rate-limit.test.ts`
 */
import assert from "node:assert/strict";

import {
  __resetImageSearchRateLimitForTests,
  checkImageSearchRateLimit,
  getImageSearchClientId,
} from "./image-search-rate-limit";

__resetImageSearchRateLimitForTests();

function requestWithIp(ip: string): Request {
  return new Request("http://localhost/api/image-search", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });
}

assert.equal(getImageSearchClientId(requestWithIp("203.0.113.1")), "203.0.113.1");
assert.equal(
  getImageSearchClientId(
    new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.2" } })
  ),
  "198.51.100.2"
);

const prevEnv = process.env.NODE_ENV;
process.env.NODE_ENV = "production";

const clientA = "10.0.0.1";
const clientB = "10.0.0.2";
let now = 0;

for (let i = 0; i < 30; i += 1) {
  const r = checkImageSearchRateLimit(requestWithIp(clientA), now);
  assert.equal(r.allowed, true, `request ${i} should be allowed`);
  now += 100;
}

const blocked = checkImageSearchRateLimit(requestWithIp(clientA), now);
assert.equal(blocked.allowed, false);
assert.ok(blocked.retryAfterSeconds && blocked.retryAfterSeconds > 0);

const otherClient = checkImageSearchRateLimit(requestWithIp(clientB), now);
assert.equal(otherClient.allowed, true);

__resetImageSearchRateLimitForTests();
process.env.NODE_ENV = prevEnv;

console.log("image-search-rate-limit.test.ts: OK");
