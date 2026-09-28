import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { confirm, notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import habitsService from "../services/habitsService";
import dreamsService from "../services/dreamsService";

function formatCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  const numberValue = Number(digits) / 100;
  return numberValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDecimalCurrencyInput(value) {
  if (value == null || value === "") return "";

  return formatCurrencyInput(Math.round(Number(value) * 100));
}

function parseCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

function newDraft() {
  return {
    title: "",
    description: "",
    smart: {
      targetDate: "",
      financialTargetValue: "",
    },
    linkedHabitIds: [],
    milestones: [],
  };
}

function emptyMilestoneInlineDraft() {
  return {
    title: "",
    targetDate: "",
    financialTargetValue: "",
  };
}

function milestoneInlineDraftFromMilestone(milestone) {
  return {
    title: milestone.title || "",
    targetDate: milestone.targetDate || "",
    financialTargetValue:
      milestone.financialTargetValue != null
        ? formatDecimalCurrencyInput(milestone.financialTargetValue)
        : "",
  };
}

function draftFromDream(dream) {
  return {
    title: dream.title || "",
    description: dream.description || "",
    smart: {
      targetDate: dream.smart?.targetDate || "",
      financialTargetValue: dream.smart?.financialTargetValue
        ? formatDecimalCurrencyInput(dream.smart.financialTargetValue)
        : "",
    },
    linkedHabitIds: [...(dream.linkedHabitIds || [])],
    milestones: (dream.milestones || []).map((milestone, index) => ({
      id: milestone.id,
      title: milestone.title,
      targetDate: milestone.targetDate || "",
      completedAt: milestone.completedAt || null,
      financialTargetValue:
        milestone.financialTargetValue != null
          ? formatDecimalCurrencyInput(milestone.financialTargetValue)
          : "",
      financialCurrentValue:
        milestone.financialCurrentValue != null
          ? formatDecimalCurrencyInput(milestone.financialCurrentValue)
          : "",
      progressPercent: milestone.progressPercent ?? 0,
      position: milestone.position ?? index,
    })),
  };
}

function dreamPayloadFromDraft(draft) {
  return {
    title: draft.title.trim(),
    description: draft.description.trim() || null,
    smart: {
      targetDate: draft.smart.targetDate || null,
      financialTargetValue: draft.smart.financialTargetValue
        ? parseCurrencyInput(draft.smart.financialTargetValue)
        : null,
    },
    linkedHabitIds: draft.linkedHabitIds,
    milestones: draft.milestones.map((milestone) => ({
      id: typeof milestone.id === "number" ? milestone.id : undefined,
      title: milestone.title,
      targetDate: milestone.targetDate || null,
      completedAt: milestone.completedAt || null,
      financialTargetValue: milestone.financialTargetValue
        ? parseCurrencyInput(milestone.financialTargetValue)
        : null,
      financialCurrentValue: milestone.financialCurrentValue
        ? parseCurrencyInput(milestone.financialCurrentValue)
        : null,
      progressPercent:
        milestone.progressPercent != null
          ? Number(milestone.progressPercent)
          : 0,
    })),
  };
}

function toDateLabel(date) {
  if (!date) return "Sem data";
  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR");
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

function computeMilestoneProgress(dream) {
  const total = dream.milestones?.length ?? 0;
  if (!total) return 0;
  const hasFinancialProgress = dream.milestones.some(
    (milestone) => milestone.progressPercent != null,
  );

  if (hasFinancialProgress) {
    const totalPercent = dream.milestones.reduce(
      (acc, milestone) => acc + Number(milestone.progressPercent ?? 0),
      0,
    );
    return Math.round(totalPercent / total);
  }

  const completed = dream.milestones.filter(isMilestoneCompleted).length;
  return Math.round((completed / total) * 100);
}

function updateDraftState(setDraftState, path, value) {
  if (path.startsWith("smart.")) {
    const key = path.replace("smart.", "");
    setDraftState((prev) => ({
      ...prev,
      smart: {
        ...prev.smart,
        [key]: value,
      },
    }));
    return;
  }

  setDraftState((prev) => ({ ...prev, [path]: value }));
}

function toggleLinkedHabit(setDraftState, habitId) {
  setDraftState((prev) => {
    const alreadyLinked = prev.linkedHabitIds.includes(habitId);
    return {
      ...prev,
      linkedHabitIds: alreadyLinked
        ? prev.linkedHabitIds.filter((id) => id !== habitId)
        : [...prev.linkedHabitIds, habitId],
    };
  });
}

function addMilestone(
  setDraftState,
  title,
  targetDate,
  targetValue,
  setTitle,
  setDate,
  setTargetValue,
) {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    notify.error("Informe o nome do marco");
    return;
  }

  setDraftState((prev) => ({
    ...prev,
    milestones: [
      ...prev.milestones,
      {
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: cleanTitle,
        targetDate: targetDate || "",
        completedAt: null,
        financialTargetValue: targetValue || "",
        progressPercent: 0,
        position: prev.milestones.length,
      },
    ],
  }));
  setTitle("");
  setDate("");
  setTargetValue("");
}

function updateMilestone(
  setDraftState,
  milestoneId,
  inlineDraft,
  setInlineDraft,
  setEditingId,
) {
  const cleanTitle = inlineDraft.title.trim();
  if (!cleanTitle) {
    notify.error("Informe o nome do marco");
    return;
  }

  setDraftState((prev) => ({
    ...prev,
    milestones: prev.milestones.map((milestone) =>
      milestone.id === milestoneId
        ? {
            ...milestone,
            title: cleanTitle,
            targetDate: inlineDraft.targetDate || "",
            financialTargetValue: inlineDraft.financialTargetValue || "",
          }
        : milestone,
    ),
  }));
  setInlineDraft(emptyMilestoneInlineDraft());
  setEditingId(null);
}

function removeMilestone(setDraftState, milestoneId) {
  setDraftState((prev) => ({
    ...prev,
    milestones: prev.milestones.filter((m) => m.id !== milestoneId),
  }));
}

export default function Dreams() {
  const [dreams, setDreams] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingDream, setSavingDream] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const [draft, setDraft] = useState(newDraft);
  const [milestoneTitle, setMilestoneTitle] = useState("");
  const [milestoneDate, setMilestoneDate] = useState("");
  const [milestoneTargetValue, setMilestoneTargetValue] = useState("");
  const [editingMilestoneId, setEditingMilestoneId] = useState(null);
  const [milestoneInlineDraft, setMilestoneInlineDraft] = useState(
    emptyMilestoneInlineDraft,
  );

  const [editingDreamId, setEditingDreamId] = useState(null);
  const [editDraft, setEditDraft] = useState(newDraft);
  const [editMilestoneTitle, setEditMilestoneTitle] = useState("");
  const [editMilestoneDate, setEditMilestoneDate] = useState("");
  const [editMilestoneTargetValue, setEditMilestoneTargetValue] = useState("");
  const [editingEditMilestoneId, setEditingEditMilestoneId] = useState(null);
  const [editMilestoneInlineDraft, setEditMilestoneInlineDraft] = useState(
    emptyMilestoneInlineDraft,
  );

  useEffect(() => {
    async function loadData() {
      try {
        const [dreamsData, habitsData] = await Promise.all([
          dreamsService.list(),
          habitsService.list({ include_stats: true }),
        ]);
        setDreams(dreamsData);
        setHabits(habitsData);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar sonhos"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const habitsById = useMemo(
    () => new Map(habits.map((habit) => [habit.id, habit])),
    [habits],
  );

  async function handleCreateDream(e) {
    e.preventDefault();

    if (!draft.title.trim()) {
      notify.error("Informe o nome do sonho");
      return;
    }

    setSavingDream(true);

    try {
      const createdDream = await dreamsService.create(
        dreamPayloadFromDraft(draft),
      );
      setDreams((prev) => [createdDream, ...prev]);
      setDraft(newDraft());
      setMilestoneTitle("");
      setMilestoneDate("");
      setMilestoneTargetValue("");
      setEditingMilestoneId(null);
      setMilestoneInlineDraft(emptyMilestoneInlineDraft());
      notify.success("Sonho criado com sucesso");
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao criar sonho"));
    } finally {
      setSavingDream(false);
    }
  }

  function startEdit(dream) {
    setEditingDreamId(dream.id);
    setEditDraft(draftFromDream(dream));
    setEditMilestoneTitle("");
    setEditMilestoneDate("");
    setEditMilestoneTargetValue("");
    setEditingEditMilestoneId(null);
    setEditMilestoneInlineDraft(emptyMilestoneInlineDraft());
  }

  function cancelEdit() {
    setEditingDreamId(null);
    setEditDraft(newDraft());
    setEditMilestoneTitle("");
    setEditMilestoneDate("");
    setEditMilestoneTargetValue("");
    setEditingEditMilestoneId(null);
    setEditMilestoneInlineDraft(emptyMilestoneInlineDraft());
  }

  function startMilestoneEdit(milestone, setInlineDraft, setEditingId) {
    setInlineDraft(milestoneInlineDraftFromMilestone(milestone));
    setEditingId(milestone.id);
  }

  function cancelMilestoneEdit(setInlineDraft, setEditingId) {
    setInlineDraft(emptyMilestoneInlineDraft());
    setEditingId(null);
  }

  async function saveEdit(dreamId) {
    if (!editDraft.title.trim()) {
      notify.error("Informe o nome do sonho");
      return;
    }

    setSavingEdit(true);
    try {
      const updatedDream = await dreamsService.update(
        dreamId,
        dreamPayloadFromDraft(editDraft),
      );

      setDreams((prev) =>
        prev.map((dream) => (dream.id === dreamId ? updatedDream : dream)),
      );
      notify.success("Sonho atualizado");
      cancelEdit();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao atualizar sonho"));
    } finally {
      setSavingEdit(false);
    }
  }

  function handleDeleteDream(dreamId) {
    confirm({
      message: "Deseja remover este sonho?",
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
      onConfirm: async () => {
        try {
          await dreamsService.remove(dreamId);
          setDreams((prev) => prev.filter((dream) => dream.id !== dreamId));
          if (editingDreamId === dreamId) {
            cancelEdit();
          }
          notify.success("Sonho removido");
        } catch (err) {
          notify.error(getApiErrorMessage(err, "Erro ao remover sonho"));
        }
      },
    });
  }

  if (loading) {
    return <p className="p-4 themed-muted">Carregando objetivos...</p>;
  }

  return (
    <div className="dreams-page p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Objetivos Financeiros</h1>
        <p className="themed-muted mt-2">
          Estruture seus objetivos financeiros, conecte hábitos e acompanhe
          marcos em timeline.
        </p>
      </div>

      <div>
        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
          <form
            onSubmit={handleCreateDream}
            className="xl:col-span-2 themed-card border themed-border rounded-xl p-5 shadow-sm space-y-4 h-fit"
          >
            <h2 className="text-xl font-semibold">Novo objetivo</h2>

            <div>
              <label className="block text-sm font-medium mb-1">Nome</label>
              <input
                value={draft.title}
                onChange={(e) =>
                  updateDraftState(setDraft, "title", e.target.value)
                }
                placeholder="Ex: Receber mais dividendos do que meu cartão de crédito"
                className="w-full border themed-border rounded px-3 py-2"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Descrição
              </label>
              <textarea
                value={draft.description}
                onChange={(e) =>
                  updateDraftState(setDraft, "description", e.target.value)
                }
                rows={3}
                className="w-full border themed-border rounded px-3 py-2"
              />
            </div>

            <div className="border themed-border rounded-lg p-3 themed-subtle">
              <h3 className="font-medium mb-2">Alvo financeiro</h3>
              <div className="space-y-2">
                <div>
                  <label className="block text-sm mb-1">Data alvo final</label>
                  <input
                    type="date"
                    value={draft.smart.targetDate}
                    onChange={(e) =>
                      updateDraftState(
                        setDraft,
                        "smart.targetDate",
                        e.target.value,
                      )
                    }
                    className="w-full border themed-border rounded px-3 py-2"
                  />
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.smart.financialTargetValue}
                  onChange={(e) =>
                    updateDraftState(
                      setDraft,
                      "smart.financialTargetValue",
                      formatCurrencyInput(e.target.value),
                    )
                  }
                  className="w-full border themed-border rounded px-3 py-2"
                  placeholder="Meta financeira (R$)"
                />
              </div>
            </div>

            <div className="border themed-border rounded-lg p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="font-medium">Hábitos vinculados</h3>
                <Link
                  to="/habits/new"
                  className="text-sm font-medium text-blue-500 hover:underline"
                >
                  + adicionar hábito
                </Link>
              </div>
              {habits.length === 0 ? (
                <p className="text-sm themed-muted">
                  Cadastre hábitos antes de vincular.
                </p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-auto pr-1">
                  {habits.map((habit) => (
                    <label
                      key={habit.id}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span>{habit.title}</span>
                      <input
                        type="checkbox"
                        checked={draft.linkedHabitIds.includes(habit.id)}
                        onChange={() => toggleLinkedHabit(setDraft, habit.id)}
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="border themed-border rounded-lg p-3">
              <h3 className="font-medium mb-2">Marcos</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  placeholder="Nome do marco"
                  className="sm:col-span-2 border themed-border rounded px-3 py-2"
                />
                <input
                  type="date"
                  value={milestoneDate}
                  onChange={(e) => setMilestoneDate(e.target.value)}
                  className="border themed-border rounded px-3 py-2"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={milestoneTargetValue}
                  onChange={(e) =>
                    setMilestoneTargetValue(formatCurrencyInput(e.target.value))
                  }
                  placeholder="Meta R$"
                  className="border themed-border rounded px-3 py-2"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  addMilestone(
                    setDraft,
                    milestoneTitle,
                    milestoneDate,
                    milestoneTargetValue,
                    setMilestoneTitle,
                    setMilestoneDate,
                    setMilestoneTargetValue,
                  )
                }
                className="mt-2 text-sm themed-link hover:underline"
              >
                + adicionar marco
              </button>

              {draft.milestones.length > 0 && (
                <div className="mt-3 space-y-2">
                  {sortByDate(draft.milestones).map((milestone) => {
                    const isEditingMilestone =
                      editingMilestoneId === milestone.id;

                    return (
                      <div
                        key={milestone.id}
                        className="text-sm border themed-border rounded px-3 py-2 flex justify-between gap-2"
                      >
                        {isEditingMilestone ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                            <input
                              value={milestoneInlineDraft.title}
                              onChange={(e) =>
                                setMilestoneInlineDraft((prev) => ({
                                  ...prev,
                                  title: e.target.value,
                                }))
                              }
                              placeholder="Nome do marco"
                              className="sm:col-span-2 border themed-border rounded px-3 py-2"
                            />
                            <input
                              type="date"
                              value={milestoneInlineDraft.targetDate}
                              onChange={(e) =>
                                setMilestoneInlineDraft((prev) => ({
                                  ...prev,
                                  targetDate: e.target.value,
                                }))
                              }
                              className="border themed-border rounded px-3 py-2"
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={milestoneInlineDraft.financialTargetValue}
                              onChange={(e) =>
                                setMilestoneInlineDraft((prev) => ({
                                  ...prev,
                                  financialTargetValue: formatCurrencyInput(
                                    e.target.value,
                                  ),
                                }))
                              }
                              placeholder="Meta R$"
                              className="border themed-border rounded px-3 py-2"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="font-medium">{milestone.title}</div>
                            <div className="themed-muted">
                              {toDateLabel(milestone.targetDate)}
                            </div>
                            {milestone.financialTargetValue && (
                              <div className="themed-muted">
                                Meta: R${" "}
                                {parseCurrencyInput(
                                  milestone.financialTargetValue,
                                ).toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex flex-col items-end gap-1">
                          {isEditingMilestone ? (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  updateMilestone(
                                    setDraft,
                                    milestone.id,
                                    milestoneInlineDraft,
                                    setMilestoneInlineDraft,
                                    setEditingMilestoneId,
                                  )
                                }
                                className="themed-link hover:underline"
                              >
                                salvar
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  cancelMilestoneEdit(
                                    setMilestoneInlineDraft,
                                    setEditingMilestoneId,
                                  )
                                }
                                className="themed-muted hover:underline"
                              >
                                cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                startMilestoneEdit(
                                  milestone,
                                  setMilestoneInlineDraft,
                                  setEditingMilestoneId,
                                )
                              }
                              className="themed-link hover:underline"
                            >
                              alterar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              removeMilestone(setDraft, milestone.id);
                              if (editingMilestoneId === milestone.id) {
                                cancelMilestoneEdit(
                                  setMilestoneInlineDraft,
                                  setEditingMilestoneId,
                                );
                              }
                            }}
                            className="text-red-600 hover:underline"
                          >
                            remover
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={savingDream}
              className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 disabled:opacity-60"
            >
              {savingDream ? "Salvando..." : "Salvar sonho"}
            </button>
          </form>

          <div className="xl:col-span-3 space-y-4">
            {dreams.length === 0 ? (
              <div className="themed-card border themed-border rounded-xl p-6 themed-muted">
                Nenhum sonho cadastrado ainda.
              </div>
            ) : (
              dreams.map((dream) => {
                const progress = computeMilestoneProgress(dream);
                const linkedHabits = dream.linkedHabitIds
                  .map((id) => habitsById.get(id))
                  .filter(Boolean);
                const completedMilestones = (dream.milestones || []).filter(
                  isMilestoneCompleted,
                ).length;

                const isEditing = editingDreamId === dream.id;

                return (
                  <section
                    key={dream.id}
                    className="themed-card border themed-border rounded-xl p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start sm:gap-4">
                      <div className="min-w-0">
                        <h2 className="text-xl font-semibold break-words">
                          {dream.title}
                        </h2>
                        {dream.description && (
                          <p className="themed-muted mt-1">
                            {dream.description}
                          </p>
                        )}
                      </div>
                      <div className="hidden sm:flex flex-wrap gap-x-3 gap-y-1 h-fit shrink-0">
                        {isEditing ? (
                          <button
                            onClick={cancelEdit}
                            className="text-sm themed-muted hover:underline"
                          >
                            cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(dream)}
                            className="text-sm themed-link hover:underline"
                          >
                            editar
                          </button>
                        )}
                        <Link
                          to={`/dreams/${dream.id}`}
                          className="text-sm themed-link hover:underline"
                        >
                          visualizar
                        </Link>
                        <button
                          onClick={() => handleDeleteDream(dream.id)}
                          className="text-sm text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-4 border themed-border rounded-lg p-4 themed-subtle space-y-3">
                        <h3 className="font-medium">Editar sonho</h3>

                        <input
                          value={editDraft.title}
                          onChange={(e) =>
                            updateDraftState(
                              setEditDraft,
                              "title",
                              e.target.value,
                            )
                          }
                          className="w-full border themed-border rounded px-3 py-2"
                          placeholder="Nome"
                        />

                        <textarea
                          value={editDraft.description}
                          onChange={(e) =>
                            updateDraftState(
                              setEditDraft,
                              "description",
                              e.target.value,
                            )
                          }
                          rows={3}
                          className="w-full border themed-border rounded px-3 py-2"
                          placeholder="Descrição"
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={editDraft.smart.targetDate}
                            onChange={(e) =>
                              updateDraftState(
                                setEditDraft,
                                "smart.targetDate",
                                e.target.value,
                              )
                            }
                            className="border themed-border rounded px-3 py-2"
                          />
                          <input
                            type="text"
                            inputMode="decimal"
                            value={editDraft.smart.financialTargetValue}
                            onChange={(e) =>
                              updateDraftState(
                                setEditDraft,
                                "smart.financialTargetValue",
                                formatCurrencyInput(e.target.value),
                              )
                            }
                            className="border themed-border rounded px-3 py-2"
                            placeholder="Meta financeira (R$)"
                          />
                        </div>

                        <div className="border themed-border rounded themed-card p-3">
                          <div className="font-medium text-sm mb-2">
                            Hábitos vinculados
                          </div>
                          <div className="space-y-2 max-h-40 overflow-auto pr-1">
                            {habits.map((habit) => (
                              <label
                                key={habit.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span>{habit.title}</span>
                                <input
                                  type="checkbox"
                                  checked={editDraft.linkedHabitIds.includes(
                                    habit.id,
                                  )}
                                  onChange={() =>
                                    toggleLinkedHabit(setEditDraft, habit.id)
                                  }
                                />
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="border themed-border rounded themed-card p-3">
                          <div className="font-medium text-sm mb-2">Marcos</div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <input
                              value={editMilestoneTitle}
                              onChange={(e) =>
                                setEditMilestoneTitle(e.target.value)
                              }
                              placeholder="Nome do marco"
                              className="sm:col-span-2 border themed-border rounded px-3 py-2"
                            />
                            <input
                              type="date"
                              value={editMilestoneDate}
                              onChange={(e) =>
                                setEditMilestoneDate(e.target.value)
                              }
                              className="border themed-border rounded px-3 py-2"
                            />
                            <input
                              type="text"
                              inputMode="decimal"
                              value={editMilestoneTargetValue}
                              onChange={(e) =>
                                setEditMilestoneTargetValue(
                                  formatCurrencyInput(e.target.value),
                                )
                              }
                              placeholder="Meta R$"
                              className="border themed-border rounded px-3 py-2"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              addMilestone(
                                setEditDraft,
                                editMilestoneTitle,
                                editMilestoneDate,
                                editMilestoneTargetValue,
                                setEditMilestoneTitle,
                                setEditMilestoneDate,
                                setEditMilestoneTargetValue,
                              )
                            }
                            className="mt-2 text-sm themed-link hover:underline"
                          >
                            + adicionar marco
                          </button>

                          {editDraft.milestones.length > 0 && (
                            <div className="mt-3 space-y-2">
                              {sortByDate(editDraft.milestones).map(
                                (milestone) => {
                                  const isEditingMilestone =
                                    editingEditMilestoneId === milestone.id;

                                  return (
                                    <div
                                      key={milestone.id}
                                      className="text-sm border themed-border rounded px-3 py-2 flex justify-between gap-2"
                                    >
                                      {isEditingMilestone ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 flex-1">
                                          <input
                                            value={
                                              editMilestoneInlineDraft.title
                                            }
                                            onChange={(e) =>
                                              setEditMilestoneInlineDraft(
                                                (prev) => ({
                                                  ...prev,
                                                  title: e.target.value,
                                                }),
                                              )
                                            }
                                            placeholder="Nome do marco"
                                            className="sm:col-span-2 border themed-border rounded px-3 py-2"
                                          />
                                          <input
                                            type="date"
                                            value={
                                              editMilestoneInlineDraft.targetDate
                                            }
                                            onChange={(e) =>
                                              setEditMilestoneInlineDraft(
                                                (prev) => ({
                                                  ...prev,
                                                  targetDate: e.target.value,
                                                }),
                                              )
                                            }
                                            className="border themed-border rounded px-3 py-2"
                                          />
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            value={
                                              editMilestoneInlineDraft.financialTargetValue
                                            }
                                            onChange={(e) =>
                                              setEditMilestoneInlineDraft(
                                                (prev) => ({
                                                  ...prev,
                                                  financialTargetValue:
                                                    formatCurrencyInput(
                                                      e.target.value,
                                                    ),
                                                }),
                                              )
                                            }
                                            placeholder="Meta R$"
                                            className="border themed-border rounded px-3 py-2"
                                          />
                                        </div>
                                      ) : (
                                        <div>
                                          <div className="font-medium">
                                            {milestone.title}
                                          </div>
                                          <div className="themed-muted">
                                            {toDateLabel(milestone.targetDate)}
                                          </div>
                                          {milestone.financialTargetValue && (
                                            <div className="themed-muted">
                                              Meta: R${" "}
                                              {parseCurrencyInput(
                                                milestone.financialTargetValue,
                                              ).toLocaleString("pt-BR", {
                                                minimumFractionDigits: 2,
                                                maximumFractionDigits: 2,
                                              })}
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      <div className="flex flex-col items-end gap-1">
                                        {isEditingMilestone ? (
                                          <>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateMilestone(
                                                  setEditDraft,
                                                  milestone.id,
                                                  editMilestoneInlineDraft,
                                                  setEditMilestoneInlineDraft,
                                                  setEditingEditMilestoneId,
                                                )
                                              }
                                              className="themed-link hover:underline"
                                            >
                                              salvar
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                cancelMilestoneEdit(
                                                  setEditMilestoneInlineDraft,
                                                  setEditingEditMilestoneId,
                                                )
                                              }
                                              className="themed-muted hover:underline"
                                            >
                                              cancelar
                                            </button>
                                          </>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              startMilestoneEdit(
                                                milestone,
                                                setEditMilestoneInlineDraft,
                                                setEditingEditMilestoneId,
                                              )
                                            }
                                            className="themed-link hover:underline"
                                          >
                                            alterar
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => {
                                            removeMilestone(
                                              setEditDraft,
                                              milestone.id,
                                            );
                                            if (
                                              editingEditMilestoneId ===
                                              milestone.id
                                            ) {
                                              cancelMilestoneEdit(
                                                setEditMilestoneInlineDraft,
                                                setEditingEditMilestoneId,
                                              );
                                            }
                                          }}
                                          className="text-red-600 hover:underline"
                                        >
                                          remover
                                        </button>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-2 text-sm border themed-border rounded hover:opacity-90 themed-subtle"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={() => saveEdit(dream.id)}
                            disabled={savingEdit}
                            className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-60"
                          >
                            {savingEdit ? "Salvando..." : "Salvar alterações"}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 relative h-12 bg-[var(--line-color)] rounded-lg overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-green-500"
                        style={{ width: `${progress}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-lg font-bold text-green-950">
                        {progress}%
                      </div>
                    </div>
                    <div className="sr-only" aria-live="polite">
                      Progresso: {progress}%
                    </div>

                    <div className="mt-4">
                      <h3 className="font-medium mb-2">
                        Hábitos ligados ao sonho
                      </h3>
                      {linkedHabits.length === 0 ? (
                        <p className="text-sm themed-muted">
                          Nenhum hábito vinculado.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {linkedHabits.map((habit) => (
                            <Link
                              key={habit.id}
                              to={`/habits/${habit.id}/edit`}
                              className={`text-xs px-2 py-1 rounded-full border hover:opacity-90 hover:underline transition ${
                                habit.stats?.today_completed
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : "themed-subtle themed-muted themed-border"
                              }`}
                            >
                              {habit.title}
                              {habit.stats?.today_completed
                                ? " · feito hoje"
                                : ""}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="mt-4 text-sm themed-muted">
                      {dream.milestones.length} marcos cadastrados •{" "}
                      {completedMilestones} concluídos
                    </div>

                    <div className="mt-4 sm:hidden sticky bottom-2 z-10 border themed-border rounded-lg p-2 themed-subtle shadow-lg">
                      <div className="grid grid-cols-3 gap-2">
                        {isEditing ? (
                          <button
                            onClick={cancelEdit}
                            className="text-xs py-2 rounded border themed-border themed-muted hover:underline"
                          >
                            cancelar
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(dream)}
                            className="text-xs py-2 rounded border themed-border themed-link hover:underline"
                          >
                            editar
                          </button>
                        )}
                        <Link
                          to={`/dreams/${dream.id}`}
                          className="text-xs py-2 rounded border themed-border themed-link hover:underline text-center"
                        >
                          visualizar
                        </Link>
                        <button
                          onClick={() => handleDeleteDream(dream.id)}
                          className="text-xs py-2 rounded border border-red-300 text-red-600 hover:underline"
                        >
                          remover
                        </button>
                      </div>
                    </div>
                  </section>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
