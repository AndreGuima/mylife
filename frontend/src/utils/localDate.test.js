import assert from "node:assert/strict";
import test from "node:test";

import { localDateTimestamp, localMonthKey } from "./localDate.js";

test("localMonthKey keeps date-only strings in their calendar month", () => {
  assert.equal(localMonthKey("2026-07-01"), "2026-07");
  assert.equal(localMonthKey("2026-08-01"), "2026-08");
});

test("localMonthKey returns null for invalid values", () => {
  assert.equal(localMonthKey(""), null);
  assert.equal(localMonthKey("not-a-date"), null);
});

test("localDateTimestamp returns a timestamp and zero for invalid dates", () => {
  assert.equal(
    localDateTimestamp("2026-07-01"),
    new Date(2026, 6, 1).getTime(),
  );
  assert.equal(localDateTimestamp("not-a-date"), 0);
});
