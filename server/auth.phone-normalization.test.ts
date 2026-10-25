import test from "node:test";
import assert from "node:assert/strict";
import { normalizePhoneNumber } from "./auth.js";

test("normalizes common Saudi mobile formats to one canonical number", () => {
  const expected = "966566823033";
  const inputs = [
    "0566823033",
    "566823033",
    "966566823033",
    "+966566823033",
    "+966 56 682 3033",
    "00966566823033",
    "9660566823033",
    "+966 (0)56-682-3033",
    "٠٥٦٦٨٢٣٠٣٣",
    "۵۶۶۸۲۳۰۳۳",
  ];

  for (const input of inputs) {
    assert.equal(normalizePhoneNumber(input), expected, `failed for ${input}`);
  }
});

test("rejects malformed phone input", () => {
  assert.equal(normalizePhoneNumber(""), null);
  assert.equal(normalizePhoneNumber("05ABC823033"), null);
  assert.equal(normalizePhoneNumber("966-"), null);
});
