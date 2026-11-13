import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import creditCardsService from "../services/creditCardsService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import PlannedVsActualChart from "../components/charts/PlannedVsActualChart";

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatDate(isoDate) {
  if (!isoDate) return "";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}

let rowKeySeq = 0;
function newRow(day = "", amount = "") {
  rowKeySeq += 1;
  return { key: rowKeySeq, day: String(day), amount: String(amount) };
}

export default function CreditCardSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedCardId = searchParams.get("cardId") || "";

  const [cards, setCards] = useState([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dueDay, setDueDay] = useState("");
  const [rows, setRows] = useState([]);
  const [savedDueDay, setSavedDueDay] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  useEffect(() => {
    let active = true;
    creditCardsService
      .list()
      .then((data) => {
        if (active) setCards(data);
      })
      .catch((err) =>
        notify.error(getApiErrorMessage(err, "Erro ao carregar cartões")),
      )
      .finally(() => {
        if (active) setLoadingCards(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadDashboard = useCallback(async (cardId) => {
    setLoadingDashboard(true);
    try {
      setDashboard(await creditCardsService.getCycleDashboard(cardId));
    } catch (err) {
      setDashboard(null);
      notify.error(getApiErrorMessage(err, "Erro ao carregar o ciclo"));
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    setDashboard(null);
    if (!selectedCardId) {
      setDueDay("");
      setRows([]);
      setSavedDueDay(null);
      return undefined;
    }

    let active = true;
    setLoadingSettings(true);
    creditCardsService
      .getSettings(selectedCardId)
      .then((settings) => {
        if (!active) return;
        setDueDay(settings.due_day ? String(settings.due_day) : "");
        setSavedDueDay(settings.due_day);
        setRows(
          settings.limits.map((item) =>
            newRow(item.day_of_month, Number(item.limit_amount)),
          ),
        );
        if (settings.due_day) loadDashboard(selectedCardId);
      })
      .catch((err) =>
        notify.error(getApiErrorMessage(err, "Erro ao carregar configuração")),
      )
      .finally(() => {
        if (active) setLoadingSettings(false);
      });
    return () => {
      active = false;
    };
  }, [selectedCardId, loadDashboard]);

  const handleSelectCard = (value) => {
    setSearchParams(value ? { cardId: value } : {}, { replace: true });
  };

  const updateRow = (key, field, value) => {
    setRows((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row)),
    );
  };

  const removeRow = (key) => {
    setRows((prev) => prev.filter((row) => row.key !== key));
  };

  const usedDays = useMemo(
    () => new Set(rows.map((row) => row.day).filter(Boolean)),
    [rows],
  );

  const validationError = useMemo(() => {
    const days = rows.map((row) => row.day);
    if (days.some((day) => !day)) return "Selecione o dia de cada limite.";
    if (new Set(days).size !== days.length)
      return "Cada dia do mês pode ter apenas um limite.";
    if (
      rows.some(
        (row) =>
          row.amount === "" ||
          Number.isNaN(Number(row.amount)) ||
          Number(row.amount) < 0,
      )
    )
      return "Informe valores de limite válidos (maiores ou iguais a zero).";
    if (rows.length > 0 && !dueDay)
      return "Defina o dia de vencimento para usar os limites.";
    return null;
  }, [rows, dueDay]);

  const handleSave = async () => {
    if (!selectedCardId || validationError) return;
    setSaving(true);
    try {
      const saved = await creditCardsService.updateSettings(selectedCardId, {
        due_day: dueDay ? Number(dueDay) : null,
        limits: rows.map((row) => ({
          day_of_month: Number(row.day),
          limit_amount: Number(row.amount).toFixed(2),
        })),
      });
      setSavedDueDay(saved.due_day);
      setRows(
        saved.limits.map((item) =>
          newRow(item.day_of_month, Number(item.limit_amount)),
        ),
      );
      setCards((prev) =>
        prev.map((card) =>
          String(card.id) === selectedCardId
            ? { ...card, due_day: saved.due_day }
            : card,
        ),
      );
      notify.success("Configuração salva");
      if (saved.due_day) {
        await loadDashboard(selectedCardId);
      } else {
        setDashboard(null);
      }
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao salvar configuração"));
    } finally {
      setSaving(false);
    }
  };

  const chartPoints = useMemo(
    () =>
      (dashboard?.points ?? []).map((p) => ({
        date: p.date,
        daily: Number(p.daily_spent),
        actual: Number(p.actual_cumulative),
        planned:
          p.planned_cumulative == null ? null : Number(p.planned_cumulative),
        isThreshold: p.is_threshold,
      })),
    [dashboard],
  );

  const hasPlanned = dashboard?.total_planned != null;
  const actualToDate = useMemo(() => {
    if (!dashboard) return 0;
    const ref = dashboard.reference_date;
    const upToToday = chartPoints.filter((p) => p.date <= ref);
    return upToToday.length ? upToToday[upToToday.length - 1].actual : 0;
  }, [dashboard, chartPoints]);
  const deltaToDate = hasPlanned
    ? Number(dashboard.planned_to_date) - actualToDate
    : null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-bold">Configurar uso do cartão</h1>
        <Link
          to="/finances/expenses"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para lançamentos
        </Link>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mb-6">
        <h2 className="text-xl font-semibold mb-4">Cartão</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm themed-muted">Cartão de crédito</span>
            <select
              className="themed-input rounded px-3 py-2"
              value={selectedCardId}
              disabled={loadingCards}
              onChange={(event) => handleSelectCard(event.target.value)}
            >
              <option value="">
                {loadingCards ? "Carregando..." : "Selecione o cartão"}
              </option>
              {cards.map((card) => (
                <option key={card.id} value={card.id}>
                  {card.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm themed-muted">
              Dia de vencimento da fatura
            </span>
            <select
              className="themed-input rounded px-3 py-2"
              value={dueDay}
              disabled={!selectedCardId || loadingSettings}
              onChange={(event) => setDueDay(event.target.value)}
            >
              <option value="">Não definido</option>
              {DAYS.map((day) => (
                <option key={day} value={day}>
                  Dia {day}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!loadingCards && cards.length === 0 && (
          <p className="themed-muted mt-3">
            Nenhum cartão cadastrado. Crie um na tela de lançamentos.
          </p>
        )}
      </div>

      {selectedCardId && (
        <div className="themed-card themed-border border rounded-xl p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
            <h2 className="text-xl font-semibold">Limites por dia do mês</h2>
            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, newRow()])}
              disabled={loadingSettings || rows.length >= DAYS.length}
              className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
            >
              + Adicionar limite
            </button>
          </div>
          <p className="themed-muted text-sm mb-4">
            Cada limite é acumulado: quanto você planeja ter gasto no cartão,
            dentro do ciclo atual, até aquele dia. Ex.: até o dia 15, R$ 800;
            até o dia 25, R$ 1.500.
          </p>

          {loadingSettings ? (
            <p className="themed-muted">Carregando...</p>
          ) : rows.length === 0 ? (
            <p className="themed-muted">Nenhum limite definido.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {rows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center"
                >
                  <select
                    className="themed-input rounded px-3 py-2"
                    value={row.day}
                    aria-label="Dia do mês"
                    onChange={(event) =>
                      updateRow(row.key, "day", event.target.value)
                    }
                  >
                    <option value="">Dia...</option>
                    {DAYS.map((day) => (
                      <option
                        key={day}
                        value={day}
                        disabled={
                          usedDays.has(String(day)) && row.day !== String(day)
                        }
                      >
                        Até o dia {day}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label="Limite acumulado"
                    placeholder="Limite (R$)"
                    className="themed-input rounded px-3 py-2"
                    value={row.amount}
                    onChange={(event) =>
                      updateRow(row.key, "amount", event.target.value)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => removeRow(row.key)}
                    className="text-red-600 px-3 py-2 rounded hover:opacity-80"
                    aria-label="Remover limite"
                  >
                    Remover
                  </button>
                </div>
              ))}
            </div>
          )}

          {validationError && (
            <p className="text-red-600 text-sm mt-3">{validationError}</p>
          )}

          <div className="mt-4">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingSettings || Boolean(validationError)}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar configuração"}
            </button>
          </div>
        </div>
      )}

      {selectedCardId && !loadingSettings && (
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="text-xl font-semibold mb-1">
            Planejado x Realizado — ciclo atual
          </h2>

          {!savedDueDay ? (
            <p className="themed-muted">
              Defina e salve o dia de vencimento para acompanhar o ciclo da
              fatura.
            </p>
          ) : loadingDashboard && !dashboard ? (
            <p className="themed-muted">Carregando...</p>
          ) : dashboard ? (
            <>
              <p className="themed-muted text-sm mb-4">
                Ciclo de {formatDate(dashboard.cycle_start)} a{" "}
                {formatDate(dashboard.cycle_end)} (vencimento em{" "}
                {formatDate(dashboard.cycle_end)})
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                <div className="themed-border border rounded-lg p-4">
                  <p className="text-sm themed-muted">Gasto no ciclo</p>
                  <p className="text-2xl font-bold">
                    {formatCurrency(dashboard.total_actual)}
                  </p>
                </div>
                <div className="themed-border border rounded-lg p-4">
                  <p className="text-sm themed-muted">Planejado até hoje</p>
                  <p className="text-2xl font-bold">
                    {hasPlanned
                      ? formatCurrency(dashboard.planned_to_date)
                      : "—"}
                  </p>
                  {hasPlanned && (
                    <p className="text-sm themed-muted">
                      Total do ciclo: {formatCurrency(dashboard.total_planned)}
                    </p>
                  )}
                </div>
                <div className="themed-border border rounded-lg p-4">
                  <p className="text-sm themed-muted">Situação até hoje</p>
                  {deltaToDate == null ? (
                    <p className="text-2xl font-bold">—</p>
                  ) : (
                    <p
                      className={`text-2xl font-bold ${
                        deltaToDate >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {deltaToDate >= 0
                        ? `${formatCurrency(deltaToDate)} abaixo`
                        : `${formatCurrency(-deltaToDate)} acima`}
                    </p>
                  )}
                </div>
              </div>

              {!hasPlanned && (
                <p className="themed-muted text-sm mb-3">
                  Adicione limites para ver a linha planejada.
                </p>
              )}

              <PlannedVsActualChart
                points={chartPoints}
                referenceDate={dashboard.reference_date}
                formatValue={formatCurrency}
              />
            </>
          ) : (
            <p className="themed-muted">Não foi possível carregar o ciclo.</p>
          )}
        </div>
      )}
    </div>
  );
}
