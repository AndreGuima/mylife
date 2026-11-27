import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import dreamsService from "../services/dreamsService";
import habitsService from "../services/habitsService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";

function toDateLabel(date) {
  if (!date) return "Sem data";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
}

function toMoneyLabel(value) {
  if (value == null || value === "") return "Não informado";
  return Number(value).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toMoneyValue(value) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  return (Number(digits) / 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? Number(digits) / 100 : 0;
}

function toTimestamp(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function sortByDate(items) {
  return [...items].sort((a, b) => {
    if (!a.targetDate && !b.targetDate) return 0;
    if (!a.targetDate) return 1;
    if (!b.targetDate) return -1;
    return toTimestamp(a.targetDate) - toTimestamp(b.targetDate);
  });
}

function isMilestoneCompleted(milestone) {
  return (
    Boolean(milestone?.completedAt) ||
    Number(milestone?.progressPercent ?? 0) >= 100
  );
}

export default function DreamDetails() {
  const { id } = useParams();
  const [dream, setDream] = useState(null);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [milestoneValueInput, setMilestoneValueInput] = useState("");
  const [savingMilestone, setSavingMilestone] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [dreamData, habitsData] = await Promise.all([
          dreamsService.getById(id),
          habitsService.list({ include_stats: true }),
        ]);
        setDream(dreamData);
        setHabits(Array.isArray(habitsData) ? habitsData : []);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar sonho"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [id]);

  function startMilestoneUpdate(milestone) {
    setEditingMilestoneId(milestone.id);
    setMilestoneValueInput(
      milestone.financialCurrentValue != null
        ? formatCurrencyInput(
            Math.round(Number(milestone.financialCurrentValue) * 100),
          )
        : "",
    );
  }

  async function saveMilestoneUpdate(milestoneId) {
    setSavingMilestone(true);
    try {
      const updatedMilestone = await dreamsService.updateMilestone(
        id,
        milestoneId,
        {
          financialCurrentValue: parseCurrencyInput(milestoneValueInput),
        },
      );
      setDream((previous) => ({
        ...previous,
        milestones: previous.milestones.map((milestone) =>
          milestone.id === milestoneId ? updatedMilestone : milestone,
        ),
      }));
      setEditingMilestoneId(null);
      notify.success("Marco atualizado");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao atualizar marco"));
    } finally {
      setSavingMilestone(false);
    }
  }

  const habitNames = useMemo(() => {
    const byId = new Map(habits.map((habit) => [habit.id, habit.title]));
    return (dream?.linkedHabitIds || []).map((habitId) => ({
      id: habitId,
      title: byId.get(habitId) || `Hábito #${habitId}`,
    }));
  }, [habits, dream]);

  const financialSummary = useMemo(() => {
    const target = toMoneyValue(dream?.smart?.financialTargetValue);
    if (target <= 0) return null;

    const current = toMoneyValue(dream?.smart?.financialCurrentValue);
    const remaining = Math.max(
      toMoneyValue(dream?.smart?.financialRemainingValue),
      0,
    );
    const progress = Math.min(
      100,
      Math.max(0, toMoneyValue(dream?.smart?.financialProgressPercent)),
    );

    return { current, target, remaining, progress };
  }, [dream]);

  if (loading) {
    return <p className="p-4 themed-muted">Carregando sonho...</p>;
  }

  if (!dream) {
    return <p className="p-4 themed-muted">Sonho não encontrado.</p>;
  }

  return (
    <div className="dreams-page p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Detalhes do Sonho</h1>
        <Link
          to="/dreams/goals"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Objetivos
        </Link>
      </div>

      <section className="themed-card themed-border border rounded-xl p-5 mb-5">
        <h2 className="text-2xl font-semibold">{dream.title}</h2>
        {financialSummary && (
          <div className="mt-4 rounded-lg border themed-border bg-green-50 p-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div className="text-lg font-semibold text-green-900">
                {toMoneyLabel(financialSummary.current)} de{" "}
                {toMoneyLabel(financialSummary.target)}
              </div>
              <div className="text-sm font-medium text-green-800">
                Restando {toMoneyLabel(financialSummary.remaining)}
              </div>
            </div>
            <div className="mt-3 h-2 bg-green-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-600"
                style={{ width: `${financialSummary.progress}%` }}
              />
            </div>
          </div>
        )}
        <p className="themed-muted mt-2">
          {dream.description || "Sem descrição"}
        </p>
      </section>

      <section className="themed-card themed-border border rounded-xl p-5 mb-5">
        <h3 className="text-xl font-semibold mb-3">Hábitos vinculados</h3>
        {habitNames.length === 0 ? (
          <p className="themed-muted">Nenhum hábito vinculado.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {habitNames.map((habit) => (
              <span
                key={habit.id}
                className="text-xs px-2 py-1 rounded-full themed-subtle themed-border border"
              >
                {habit.title}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="themed-card themed-border border rounded-xl p-5">
        <h3 className="text-xl font-semibold mb-3">Timeline de marcos</h3>
        {dream.milestones?.length ? (
          <div className="space-y-3">
            {sortByDate(dream.milestones).map((milestone) => (
              <div
                key={milestone.id}
                className="themed-border border rounded-lg p-4 relative overflow-hidden"
              >
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500/15 pointer-events-none"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(0, Number(milestone.progressPercent ?? 0)),
                    )}%`,
                  }}
                />

                <div className="relative z-10">
                  <div className="font-medium">{milestone.title}</div>
                  <div className="text-sm themed-muted mt-1">
                    Previsto: {toDateLabel(milestone.targetDate)}
                  </div>
                  <div className="text-sm themed-muted mt-1">
                    Meta do marco:{" "}
                    {toMoneyLabel(milestone.financialTargetValue)}
                  </div>
                  <div className="text-sm themed-muted mt-1">
                    Realizado: {toMoneyLabel(milestone.financialCurrentValue)} ({" "}
                    {Number(milestone.progressPercent ?? 0).toFixed(2)}%)
                  </div>
                  <div className="mt-2 h-1.5 bg-[var(--line-color)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{
                        width: `${Math.min(
                          100,
                          Math.max(0, Number(milestone.progressPercent ?? 0)),
                        )}%`,
                      }}
                    />
                  </div>
                  <div className="text-sm themed-muted mt-2">
                    Status:{" "}
                    {isMilestoneCompleted(milestone) ? "Concluído" : "Pendente"}
                  </div>
                  {editingMilestoneId === milestone.id ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={milestoneValueInput}
                        onChange={(event) =>
                          setMilestoneValueInput(
                            formatCurrencyInput(event.target.value),
                          )
                        }
                        placeholder="0,00"
                        aria-label={`Valor atingido de ${milestone.title}`}
                        className="themed-card themed-border border rounded px-3 py-2"
                      />
                      <button
                        type="button"
                        onClick={() => saveMilestoneUpdate(milestone.id)}
                        disabled={savingMilestone}
                        className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingMilestoneId(null)}
                        className="themed-border border px-3 py-2 rounded"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => startMilestoneUpdate(milestone)}
                      className="mt-3 text-sm text-blue-400 hover:underline"
                    >
                      Atualizar marco
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="themed-muted">Nenhum marco cadastrado.</p>
        )}
      </section>
    </div>
  );
}
