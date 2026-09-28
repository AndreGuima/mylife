import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPatrimonyComparisonSummary,
  buildPreviousAccountValuesByLastChange,
  getPatrimonyComparisonDelta,
} from "./patrimonyComparison.js";

test("buildPatrimonyComparisonSummary returns current, yesterday, week and month values", () => {
  const points = [
    { dateKey: "2024-01-01", total: 100 },
    { dateKey: "2024-01-08", total: 130 },
    { dateKey: "2024-01-31", total: 140 },
    { dateKey: "2024-02-01", total: 150 },
  ];

  const summary = buildPatrimonyComparisonSummary(points, "2024-02-01");

  assert.deepEqual(
    summary.map((item) => item.label),
    ["Patrimônio atual", "Ontem", "Semana passada", "Mês passado"],
  );
  assert.equal(summary[0].value, 150);
  assert.equal(summary[1].value, 140);
  assert.equal(summary[2].value, 130);
  assert.equal(summary[3].value, 100);
});

test("buildPreviousAccountValuesByLastChange keeps each account last changed value", () => {
  const previousValues = buildPreviousAccountValuesByLastChange([
    {
      id: 1,
      snapshot_at: "2024-01-01T10:00:00",
      accounts: [
        { bank_account_id: 10, total_value: "100.00" },
        { bank_account_id: 20, total_value: "200.00" },
      ],
    },
    {
      id: 2,
      snapshot_at: "2024-01-01T10:01:00",
      accounts: [
        { bank_account_id: 10, total_value: "112.93" },
        { bank_account_id: 20, total_value: "200.00" },
      ],
    },
    {
      id: 3,
      snapshot_at: "2024-01-01T10:02:00",
      accounts: [
        { bank_account_id: 10, total_value: "112.93" },
        { bank_account_id: 20, total_value: "210.00" },
      ],
    },
  ]);

  assert.equal(previousValues.get(10), 100);
  assert.equal(previousValues.get(20), 200);
});

test("getPatrimonyComparisonDelta compares each row against current patrimony", () => {
  const summary = [
    { label: "Patrimônio atual", value: 578815.12 },
    { label: "Ontem", value: 573493.59 },
    { label: "Semana passada", value: 565613.08 },
    { label: "Mês passado", value: 574604.48 },
  ];

  assert.deepEqual(getPatrimonyComparisonDelta(summary[0], summary), {
    value: 5321.53,
    referenceLabel: "de ontem",
  });
  assert.deepEqual(getPatrimonyComparisonDelta(summary[1], summary), {
    value: -5321.53,
    referenceLabel: "do patrimônio atual",
  });
  assert.deepEqual(getPatrimonyComparisonDelta(summary[3], summary), {
    value: -4210.64,
    referenceLabel: "do patrimônio atual",
  });
});
