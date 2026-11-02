import test from "node:test";
import assert from "node:assert/strict";
import { getAiRetryDelayMs, getProviderFallbackOrder } from "../provider-policy.js";

test("provider fallback preserves priority and skips unavailable or already-tried providers", () => {
  assert.deepEqual(
    getProviderFallbackOrder(["NaraRouter", "OpenRouter"], ["NaraRouter"], []),
    ["OpenRouter"],
  );
  assert.deepEqual(
    getProviderFallbackOrder(["NaraRouter", "OpenRouter"], [], ["NaraRouter"]),
    ["OpenRouter"],
  );
  assert.deepEqual(
    getProviderFallbackOrder(["NaraRouter", "OpenRouter"], [], []),
    ["NaraRouter", "OpenRouter"],
  );
});

test("AI retry backoff grows exponentially and is capped", () => {
  assert.equal(getAiRetryDelayMs(1), 5 * 60_000);
  assert.equal(getAiRetryDelayMs(2), 10 * 60_000);
  assert.equal(getAiRetryDelayMs(3), 20 * 60_000);
  assert.equal(getAiRetryDelayMs(4), 30 * 60_000);
  assert.equal(getAiRetryDelayMs(20), 30 * 60_000);
  assert.equal(getAiRetryDelayMs(0), 5 * 60_000);
});
