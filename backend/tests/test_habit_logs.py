from datetime import date, datetime, time

import pytest
from models.habit import Habit
from models.habit_log import HabitLog
from services.habit_log_service import HabitLogService


def create_habit(
    db_session,
    *,
    user_id: int,
    title="Hábito Teste",
    start_time: time | None = None,
    end_time: time | None = None,
):
    habit = Habit(
        user_id=user_id,
        title=title,
        start_time=start_time,
        end_time=end_time,
    )
    db_session.add(habit)
    db_session.commit()
    db_session.refresh(habit)
    return habit


def test_toggle_creates_log_when_not_exists(db_session):
    user_id = 1
    habit = create_habit(db_session, user_id=user_id)

    log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )

    assert log.id is not None
    assert log.habit_id == habit.id
    assert log.user_id == user_id
    assert log.date == date.today()
    assert log.completed is True

    logs = db_session.query(HabitLog).all()
    assert len(logs) == 1


def test_toggle_flips_completed_when_log_exists(db_session):
    user_id = 1
    habit = create_habit(db_session, user_id=user_id)

    # Primeiro check → cria log (True)
    first_log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )
    assert first_log.completed is True

    # Segundo check → toggle (False)
    second_log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )
    assert second_log.id == first_log.id
    assert second_log.completed is False

    # Terceiro check → toggle de novo (True)
    third_log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )
    assert third_log.completed is True

    logs = db_session.query(HabitLog).all()
    assert len(logs) == 1  # nunca duplica


def test_cannot_toggle_habit_from_another_user(db_session):
    owner_id = 1
    other_user_id = 2

    habit = create_habit(db_session, user_id=owner_id)

    with pytest.raises(ValueError):
        HabitLogService.toggle_today(
            db_session,
            user_id=other_user_id,
            habit_id=habit.id,
        )

    logs = db_session.query(HabitLog).all()
    assert logs == []


def test_cannot_toggle_inactive_habit(db_session):
    user_id = 1
    habit = create_habit(db_session, user_id=user_id)
    habit.is_active = False
    db_session.commit()

    with pytest.raises(ValueError):
        HabitLogService.toggle_today(
            db_session,
            user_id=user_id,
            habit_id=habit.id,
        )

    logs = db_session.query(HabitLog).all()
    assert logs == []


def test_only_one_log_per_day(db_session):
    user_id = 1
    habit = create_habit(db_session, user_id=user_id)

    HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )
    HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )
    HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
    )

    logs = db_session.query(HabitLog).all()
    assert len(logs) == 1
    assert logs[0].date == date.today()


def test_toggle_rejects_before_start_time(db_session):
    user_id = 1
    habit = create_habit(
        db_session,
        user_id=user_id,
        start_time=time(19, 0),
        end_time=time(20, 0),
    )
    now_dt = datetime(2026, 2, 4, 3, 0)

    with pytest.raises(ValueError):
        HabitLogService.toggle_today(
            db_session,
            user_id=user_id,
            habit_id=habit.id,
            now_dt=now_dt,
        )

    logs = db_session.query(HabitLog).all()
    assert logs == []


def test_toggle_allows_inside_time_window(db_session):
    user_id = 1
    habit = create_habit(
        db_session,
        user_id=user_id,
        start_time=time(2, 0),
        end_time=time(4, 0),
    )

    log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
        now_dt=datetime(2026, 2, 4, 3, 0),
    )

    assert log.completed is True


def test_toggle_allows_after_end_time_same_day(db_session):
    user_id = 1
    habit = create_habit(
        db_session,
        user_id=user_id,
        start_time=time(19, 0),
        end_time=time(20, 0),
    )

    log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
        now_dt=datetime(2026, 2, 4, 21, 30),
    )

    assert log.completed is True


def test_toggle_allows_overnight_window_after_midnight(db_session):
    user_id = 1
    habit = create_habit(
        db_session,
        user_id=user_id,
        start_time=time(22, 30),
        end_time=time(6, 30),
    )

    log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
        now_dt=datetime(2026, 2, 5, 3, 0),
    )

    assert log.completed is True


def test_toggle_allows_overnight_window_during_day_gap(db_session):
    user_id = 1
    habit = create_habit(
        db_session,
        user_id=user_id,
        start_time=time(22, 30),
        end_time=time(6, 30),
    )

    log = HabitLogService.toggle_today(
        db_session,
        user_id=user_id,
        habit_id=habit.id,
        now_dt=datetime(2026, 2, 5, 12, 0),
    )

    assert log.completed is True
