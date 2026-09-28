import assert from "node:assert/strict";
import test from "node:test";

import { isPasswordValid, validatePassword } from "./passwordPolicy.js";

const validPassword = ["A", "bcdefg", "123", "!"].join("");

test("validatePassword reports each required password characteristic", () => {
  assert.deepEqual(validatePassword(validPassword), {
    minLength: true,
    upper: true,
    lower: true,
    digit: true,
    special: true,
  });
  assert.deepEqual(validatePassword("short"), {
    minLength: false,
    upper: false,
    lower: true,
    digit: false,
    special: false,
  });
});

test("isPasswordValid requires every characteristic", () => {
  assert.equal(isPasswordValid(validatePassword(validPassword)), true);
  assert.equal(isPasswordValid(validatePassword("Abc1234x")), false);
});
