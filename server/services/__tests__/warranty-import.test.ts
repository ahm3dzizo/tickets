import test from "node:test";
import assert from "node:assert/strict";
import {
  addOneWarrantyYear,
  normalizeWarrantyColumn,
  normalizeWarrantyUnitReference,
  parseWarrantyDate,
} from "../warranty-import.ts";

test("qualifies unprefixed unit numbers using the selected project abbreviation", () => {
  assert.equal(normalizeWarrantyUnitReference("0012", "PRJ"), "12");
  assert.equal(normalizeWarrantyUnitReference("١٢", "PRJ"), "12");
  assert.equal(normalizeWarrantyUnitReference("Unit 0012", "PRJ"), "12");
});

test("accepts the selected project prefix and rejects a different explicit prefix", () => {
  assert.equal(normalizeWarrantyUnitReference("PRJ-0012", "PRJ"), "12");
  assert.equal(normalizeWarrantyUnitReference("PRJ_12", "PRJ"), "12");
  assert.equal(normalizeWarrantyUnitReference("Unit PRJ-12", "PRJ"), "12");
  assert.equal(normalizeWarrantyUnitReference("OTHER-12", "PRJ"), null);
});

test("does not concatenate letters and digits or destroy alphanumeric unit numbers", () => {
  assert.equal(normalizeWarrantyUnitReference("ES2-1863", "ES2"), "1863");
  assert.equal(normalizeWarrantyUnitReference("12A", "PRJ"), "12A");
  assert.equal(normalizeWarrantyUnitReference("A12", "PRJ"), "A12");
});

test("normalizes Arabic column spelling", () => {
  assert.equal(normalizeWarrantyColumn("تاريخ الإنتهاء"), normalizeWarrantyColumn("تاريخ الانتهاء"));
});

test("parses DD/MM/YYYY deterministically and supports Arabic digits", () => {
  assert.equal(parseWarrantyDate("05/06/2026"), "2026-06-05");
  assert.equal(parseWarrantyDate("٠٥/٠٦/٢٠٢٦"), "2026-06-05");
  assert.equal(parseWarrantyDate("2026-06-05"), "2026-06-05");
  assert.equal(parseWarrantyDate("31/02/2026"), null);
});

test("adds one calendar year and clamps leap day", () => {
  assert.equal(addOneWarrantyYear("2025-06-05"), "2026-06-05");
  assert.equal(addOneWarrantyYear("2024-02-29"), "2025-02-28");
});
