import assert from "node:assert/strict";
import test from "node:test";
import {
  isHabitScheduledForDate,
  isMonthlyHabitForDate,
} from "./habitSchedule.js";

test("monthly habit with day 31 applies on February 28 in non-leap year", () => {
  const habit = {
    frequency_type: "monthly",
    month_day: 31,
  };

  assert.equal(isHabitScheduledForDate(habit, new Date(2025, 1, 28, 12)), true);
  assert.equal(
    isHabitScheduledForDate(habit, new Date(2025, 1, 27, 12)),
    false,
  );
});

test("monthly habit with day 31 applies on February 29 in leap year", () => {
  const habit = {
    frequency_type: "monthly",
    month_day: 31,
  };

  assert.equal(isHabitScheduledForDate(habit, new Date(2024, 1, 29, 12)), true);
  assert.equal(
    isHabitScheduledForDate(habit, new Date(2024, 1, 28, 12)),
    false,
  );
});

test("daily habits are scheduled every day", () => {
  assert.equal(
    isHabitScheduledForDate({ frequency_type: "daily" }, new Date(2026, 1, 4)),
    true,
  );
});

test("weekly habits only match configured weekdays", () => {
  const targetDate = new Date(2026, 1, 4);

  assert.equal(
    isHabitScheduledForDate(
      { frequency_type: "weekly", weekdays: [targetDate.getDay()] },
      targetDate,
    ),
    true,
  );
  assert.equal(
    isHabitScheduledForDate(
      { frequency_type: "weekly", weekdays: [0, 6] },
      targetDate,
    ),
    false,
  );
  assert.equal(
    isHabitScheduledForDate({ frequency_type: "weekly" }, targetDate),
    false,
  );
});

test("unsupported frequencies and invalid monthly days are not scheduled", () => {
  const targetDate = new Date(2026, 1, 4);

  assert.equal(
    isHabitScheduledForDate({ frequency_type: "custom" }, targetDate),
    false,
  );
  assert.equal(
    isHabitScheduledForDate(
      { frequency_type: "monthly", month_day: "invalid" },
      targetDate,
    ),
    false,
  );
  assert.equal(isMonthlyHabitForDate(1.5, targetDate), false);
});
