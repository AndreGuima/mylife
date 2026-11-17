import logging
from datetime import datetime, time
from pathlib import Path

from core.email import send_html_email
from database import SessionLocal
from jinja2 import Environment, FileSystemLoader, select_autoescape
from models.user import User
from services.credit_card_cycle_summary import build_credit_card_email_context
from services.daily_quote_lock import try_acquire_daily_email_lock
from services.patrimony_snapshot_service import build_patrimony_email_context
from services.quote_of_the_day import get_quote_of_the_day_for_user
from services.user_preferences_service import get_user_preferences
from sqlalchemy.orm import Session

# ============================================================
# 🧠 Logger do cron
# ============================================================

logger = logging.getLogger("app.cron.daily_quote")

# ============================================================
# 📁 Templates
# ============================================================

BASE_DIR = Path(__file__).resolve().parent.parent

TEMPLATE_ENV = Environment(
    loader=FileSystemLoader(BASE_DIR / "templates"),
    autoescape=select_autoescape(["html", "xml"]),
)

# ============================================================
# ⚙️ Defaults
# ============================================================

PREFERENCE_CATEGORY = "quotes"
DEFAULT_QUOTE_TIME = time(8, 0)

# ============================================================
# 📧 Job principal
# ============================================================


def send_daily_quote_emails():
    db: Session = SessionLocal()
    now = datetime.now()
    processed_users = 0
    sent_emails = 0
    skipped_users = 0
    failed_users = 0

    logger.info(
        "daily_quote_job_started",
        extra={"timestamp": now.isoformat()},
    )

    try:
        users = (
            db.query(User)
            .filter(
                User.is_active.is_(True),
                User.is_verified.is_(True),
            )
            .all()
        )

        logger.info(
            "daily_quote_users_loaded",
            extra={"eligible_users": len(users)},
        )

        template = TEMPLATE_ENV.get_template("emails/daily_quote.html")

        for user in users:
            processed_users += 1
            try:
                sent = _process_user(
                    db=db,
                    user=user,
                    now=now,
                    template=template,
                )
                if sent:
                    sent_emails += 1
                else:
                    skipped_users += 1
            except Exception:
                db.rollback()
                failed_users += 1
                logger.exception(
                    "daily_quote_user_failed",
                    extra={"user_id": user.id, "email": user.email},
                )

        logger.info(
            "daily_quote_job_finished",
            extra={
                "processed_users": processed_users,
                "sent_emails": sent_emails,
                "skipped_users": skipped_users,
                "failed_users": failed_users,
            },
        )
        return {
            "processed_users": processed_users,
            "sent_emails": sent_emails,
            "skipped_users": skipped_users,
            "failed_users": failed_users,
        }

    finally:
        db.close()


# ============================================================
# 🔁 Processamento por usuário
# ============================================================


def _process_user(
    db: Session,
    user: User,
    now: datetime,
    template,
):
    # 🔔 Preferências
    prefs = get_user_preferences(db, user.id, PREFERENCE_CATEGORY)

    if not prefs.get("receive_daily_quote", True):
        logger.debug(
            "daily_quote_user_opted_out",
            extra={"user_id": user.id, "email": user.email},
        )
        return False

    # ⏰ Horário configurado
    time_str = prefs.get("daily_quote_time")
    if time_str:
        hour, minute = map(int, time_str.split(":"))
        user_time = time(hour, minute)
    else:
        user_time = DEFAULT_QUOTE_TIME

    scheduled = datetime.combine(now.date(), user_time)

    if now < scheduled:
        logger.debug(
            "daily_quote_not_due_yet",
            extra={
                "user_id": user.id,
                "email": user.email,
                "now": now.time().isoformat(),
                "scheduled": user_time.isoformat(),
            },
        )
        return False

    # 🔒 Lock diário
    lock = try_acquire_daily_email_lock(db, user.id)
    if not lock:
        logger.info(
            "daily_quote_already_sent_today",
            extra={"user_id": user.id, "email": user.email},
        )
        return False

    # 📜 Quote do dia
    quote = get_quote_of_the_day_for_user(db, user.id)
    if not quote:
        logger.warning(
            "daily_quote_missing_quote",
            extra={"user_id": user.id, "email": user.email},
        )
        db.rollback()
        return False

    html = template.render(
        text=quote.text,
        author=quote.author,
        username=user.username,
        **build_patrimony_email_context(db, user.id, now),
        **build_credit_card_email_context(db, user.id, now.date()),
    )

    # 📨 Envio
    send_html_email(
        to=user.email,
        subject="📜 Daily Digest",
        html=html,
    )

    db.commit()

    logger.info(
        "daily_quote_email_sent",
        extra={"user_id": user.id, "email": user.email},
    )
    return True
