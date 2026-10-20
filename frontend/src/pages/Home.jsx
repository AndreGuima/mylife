import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import quotesService from "../services/quotesService";
import habitsService from "../services/habitsService";
import HabitHistorySummary from "../components/HabitHistorySummary";
import HabitHeatmap from "../components/HabitHeatmap";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import { useAuth } from "../contexts/useAuth";
import { isHabitScheduledForDate } from "../utils/habitSchedule";

function compareHabitsByPriority(a, b) {
  const aDone = a.stats?.today_completed ?? false;
  const bDone = b.stats?.today_completed ?? false;

  if (aDone !== bDone) {
    return aDone ? 1 : -1;
  }

  const aStreak = a.stats?.current_streak ?? 0;
  const bStreak = b.stats?.current_streak ?? 0;

  return bStreak - aStreak;
}

function sortHabitsBySchedule(habits) {
  return [...habits].sort((a, b) => {
    const aStartTime = a.start_time?.slice(0, 5) ?? "";
    const bStartTime = b.start_time?.slice(0, 5) ?? "";

    if (aStartTime !== bStartTime) {
      if (!aStartTime) return 1;
      if (!bStartTime) return -1;
      return aStartTime.localeCompare(bStartTime);
    }

    return compareHabitsByPriority(a, b);
  });
}

function formatTimeRange(startTime, endTime) {
  if (!startTime) return "Sem horário";
  const start = startTime.slice(0, 5);
  const end = endTime ? endTime.slice(0, 5) : null;
  return end ? `${start}–${end}` : start;
}

function formatQuoteCreatedAt(value) {
  if (!value) return "Data não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data não informada";
  return date.toLocaleDateString("pt-BR");
}

function isHabitForToday(habit) {
  return isHabitScheduledForDate(habit, new Date());
}

export default function Home() {
  const [quote, setQuote] = useState(null);
  const [loadingQuote, setLoadingQuote] = useState(true);

  const [habits, setHabits] = useState([]);
  const [loadingHabits, setLoadingHabits] = useState(true);
  const [togglingHabitId, setTogglingHabitId] = useState(null);

  const { user } = useAuth();

  // ============================
  // ✨ Quote do Dia
  // ============================
  useEffect(() => {
    if (!user) {
      return;
    }

    async function loadQuote() {
      try {
        const q = await quotesService.getQuoteOfTheDay();
        setQuote(q);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar quote do dia"));
      } finally {
        setLoadingQuote(false);
      }
    }

    loadQuote();
  }, [user]);

  // ============================
  // 📅 Hábitos + stats
  // ============================
  useEffect(() => {
    async function loadHabits() {
      try {
        const data = await habitsService.list({ include_stats: true });
        setHabits(data);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar hábitos"));
      } finally {
        setLoadingHabits(false);
      }
    }

    loadHabits();
  }, []);

  async function handleToggleHabit(habitId) {
    setTogglingHabitId(habitId);

    try {
      const result = await habitsService.toggle(habitId);

      setHabits((prev) =>
        prev.map((habit) =>
          habit.id === habitId ? { ...habit, stats: result.stats } : habit,
        ),
      );
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "Habit is before scheduled time") {
        const habit = habits.find((item) => item.id === habitId);
        const startLabel = habit?.start_time
          ? habit.start_time.slice(0, 5)
          : "o horário definido";
        notify.error(
          `Esse hábito só pode ser marcado a partir de ${startLabel}.`,
        );
      } else {
        notify.error(getApiErrorMessage(err, "Erro ao atualizar hábito"));
      }
    } finally {
      setTogglingHabitId(null);
    }
  }

  const todayHabits = sortHabitsBySchedule(habits.filter(isHabitForToday));
  const homeModuleCardClass =
    "mb-6 flex flex-col gap-3 rounded-xl border themed-border themed-card p-4 sm:mb-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4";
  const homeModuleButtonClass =
    "inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 sm:w-auto sm:px-4 whitespace-nowrap";

  // ============================
  // ⏳ Loading inicial
  // ============================
  if (user && loadingQuote) {
    return (
      <div className="animate-pulse p-6 max-w-5xl mx-auto">
        <div className="h-6 bg-[var(--line-color)] rounded w-48 mb-6"></div>
        <div className="h-24 bg-[var(--line-color)] rounded"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Home</h1>

      {/* ============================
          ✨ Quote do Dia
      ============================ */}
      {quote ? (
        <div className="p-6 bg-gradient-to-r from-blue-500 to-blue-700 text-white shadow-xl rounded-xl mb-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold mb-3">✨ Quote do Dia</h2>
              <p className="text-2xl italic mb-3">"{quote.text}"</p>
              <div className="font-light">— {quote.author}</div>
              <p className="text-sm text-blue-100 mt-2">
                Cadastrada em: {formatQuoteCreatedAt(quote.created_at)}
              </p>
            </div>

            <Link
              to="/quotes"
              className="inline-flex items-center justify-center bg-white text-blue-700 px-4 py-2 rounded hover:bg-blue-50 font-medium whitespace-nowrap h-fit"
            >
              Ir para Frases
            </Link>
          </div>
        </div>
      ) : (
        <p className="themed-muted mb-10">
          Você ainda não possui quotes cadastradas.
          <Link to="/quotes/new" className="themed-link underline ml-1">
            Criar agora →
          </Link>
        </p>
      )}

      <div className={homeModuleCardClass}>
        <div>
          <h2 className="text-xl font-semibold">
            Módulo de Metas e Conquistas
          </h2>
          <p className="themed-muted text-sm mt-1">
            Planeje metas com método SMART, marcos em timeline e vínculo com
            hábitos para acompanhar suas conquistas.
          </p>
        </div>
        <Link to="/dreams" className={homeModuleButtonClass}>
          Abrir Metas e Conquistas
        </Link>
      </div>

      <div className={homeModuleCardClass}>
        <div>
          <h2 className="text-xl font-semibold">Módulo de Finanças</h2>
          <p className="themed-muted text-sm mt-1">
            Gerencie patrimônio, despesas e investimentos em um só lugar.
          </p>
        </div>
        <Link to="/finances" className={homeModuleButtonClass}>
          Abrir Finanças
        </Link>
      </div>

      <div className={homeModuleCardClass}>
        <div>
          <h2 className="text-xl font-semibold">Gerenciamento do Dia</h2>
          <p className="themed-muted text-sm mt-1">
            Organize sua rotina diária e acompanhe atividades do dia em um só
            lugar.
          </p>
        </div>
        <Link to="/day-management" className={homeModuleButtonClass}>
          Abrir Gerenciamento do Dia
        </Link>
      </div>

      {/* ============================
          📅 Seus hábitos
      ============================ */}
      <div>
        <h2 className="text-2xl font-bold mb-4">📅 Seus hábitos</h2>

        {loadingHabits ? (
          <p className="themed-muted">Carregando hábitos…</p>
        ) : todayHabits.length === 0 ? (
          <p className="themed-muted">
            Você não possui hábitos programados para hoje.
          </p>
        ) : (
          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              lg:grid-cols-3
              gap-4
            "
          >
            {todayHabits.map((habit) => {
              const completed = habit.stats?.today_completed;
              const isToggling = togglingHabitId === habit.id;

              return (
                <div
                  key={habit.id}
                  className="
                  border
                  themed-border
                  rounded-lg
                  p-4
                  themed-card
                  hover:shadow-md
                  transition
                "
                >
                  {/* Título */}
                  <Link
                    to={`/habits/${habit.id}/edit`}
                    className="text-lg font-semibold themed-link hover:underline"
                  >
                    {habit.title}
                  </Link>

                  <div className="text-xs themed-muted mt-1">
                    ⏰ {formatTimeRange(habit.start_time, habit.end_time)}
                  </div>

                  {/* Badge pendente */}
                  {!completed && (
                    <div className="text-xs text-red-500 font-medium mt-1">
                      • pendente hoje
                    </div>
                  )}

                  {/* Resumo */}
                  <div className="mt-2">
                    <HabitHistorySummary habit={habit} />
                  </div>

                  {/* Heatmap binário */}
                  <div className="mt-3">
                    <div className="text-xs themed-muted mb-1">
                      Últimos 30 dias
                    </div>
                    <HabitHeatmap
                      key={`${habit.id}-${completed ? "done" : "pending"}`}
                      habitId={habit.id}
                      days={30}
                    />
                  </div>

                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <button
                      type="button"
                      onClick={() => handleToggleHabit(habit.id)}
                      disabled={isToggling}
                      className={`
                        inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition
                        ${
                          completed
                            ? "bg-green-600 text-white hover:bg-green-700"
                            : "bg-blue-600 text-white hover:bg-blue-700"
                        }
                        ${isToggling ? "cursor-not-allowed opacity-60" : ""}
                      `}
                    >
                      {isToggling
                        ? "Salvando..."
                        : completed
                          ? "Feito hoje"
                          : "Marcar como feito"}
                    </button>

                    <Link
                      to={`/habits/${habit.id}/edit`}
                      className="themed-muted text-sm hover:text-blue-600 hover:underline"
                    >
                      Ver histórico →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
