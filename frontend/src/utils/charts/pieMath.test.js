import assert from "node:assert/strict";
import test from "node:test";

import { describeArc, polarToCartesian } from "./pieMath.js";

test("polarToCartesian converts the top and right angles", () => {
  const top = polarToCartesian(5, 7, 10, 0);
  const right = polarToCartesian(5, 7, 10, 90);

  assert.ok(Math.abs(top.x - 5) < 1e-10);
  assert.equal(top.y, -3);
  assert.equal(right.x, 15);
  assert.ok(Math.abs(right.y - 7) < 1e-10);
});

test("describeArc selects the large-arc flag for arcs over 180 degrees", () => {
  assert.match(describeArc(0, 0, 10, 0, 180), / A 10 10 0 0 0 /);
  assert.match(describeArc(0, 0, 10, 0, 181), / A 10 10 0 1 0 /);
});
