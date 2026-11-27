import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCrossoverProjection,
  calculateCrossoverPoint,
  calculateMonthlyContribution,
} from "./crossoverPoint.js";

const baseInputs = {
  currentAge: 34,
  retirementAge: 60,
  monthlySpending: 4000,
  otherMonthlyIncome: 0,
  withdrawalRate: 5,
  realReturn: 7.5,
  currentInvested: 60000,
};

test("calculateCrossoverPoint matches the reference spreadsheet", () => {
  const r = calculateCrossoverPoint(baseInputs);

  assert.equal(r.valid, true);
  assert.equal(r.requiredMonthlyIncome, 4000);
  assert.equal(r.annualSpending, 48000);
  assert.equal(r.requiredPatrimony, 960000);
  assert.equal(r.yearsToRetirement, 26);
  assert.equal(Math.round(r.crossoverPoint), 146437);
  assert.equal(Math.round(r.progress * 1000) / 10, 41);
  assert.equal(Math.round(r.remainingToCrossover), 86437);
  assert.equal(Math.round(r.monthlyContribution), 617);
  assert.equal(r.reached, false);
});

test("other income reduces the required income and never goes negative", () => {
  const partial = calculateCrossoverPoint({
    ...baseInputs,
    otherMonthlyIncome: 1500,
  });
  assert.equal(partial.requiredMonthlyIncome, 2500);
  assert.equal(partial.requiredPatrimony, 600000);

  const covered = calculateCrossoverPoint({
    ...baseInputs,
    otherMonthlyIncome: 9000,
  });
  assert.equal(covered.requiredMonthlyIncome, 0);
  assert.equal(covered.crossoverPoint, 0);
  assert.equal(covered.reached, true);
  assert.equal(covered.monthlyContribution, 0);
});

test("when already past the crossover point no contribution is needed", () => {
  const r = calculateCrossoverPoint({ ...baseInputs, currentInvested: 200000 });
  assert.equal(r.reached, true);
  assert.equal(r.remainingToCrossover, 0);
  assert.equal(r.monthlyContribution, 0);
});

test("retiring today requires the full patrimony", () => {
  const r = calculateCrossoverPoint({ ...baseInputs, retirementAge: 34 });
  assert.equal(r.yearsToRetirement, 0);
  assert.equal(r.crossoverPoint, 960000);
  assert.equal(r.monthlyContribution, 900000);
});

test("invalid inputs return errors", () => {
  assert.equal(
    calculateCrossoverPoint({ ...baseInputs, withdrawalRate: 0 }).valid,
    false,
  );
  assert.equal(
    calculateCrossoverPoint({ ...baseInputs, retirementAge: 30 }).valid,
    false,
  );
});

test("calculateMonthlyContribution handles zero rate", () => {
  assert.equal(calculateMonthlyContribution(0, 1200, 0, 12), 100);
});

test("buildCrossoverProjection converges at retirement age", () => {
  const rows = buildCrossoverProjection(baseInputs);
  assert.equal(rows.length, 27);
  assert.equal(rows[0].age, 34);
  assert.equal(Math.round(rows[0].crossoverAtAge), 146437);
  assert.equal(rows.at(-1).age, 60);
  assert.equal(Math.round(rows.at(-1).crossoverAtAge), 960000);
});
