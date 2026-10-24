import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import expensesService from "../services/expensesService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import PieDonutChart from "../components/charts/PieDonutChart";
import { describeArc } from "../utils/charts/pieMath";

const PIE_COLORS = [
  "#0ea5e9",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#14b8a6",
  "#3b82f6",
  "#f97316",
  "#84cc16",
];
const EXCLUDED_PIE_CATEGORY = "Pagamento de Fatura";
const PERIOD_BUTTON_BASE =
  "themed-border border rounded px-3 py-2 text-sm hover:opacity-90 transition";
const PERIOD_BUTTON_ACTIVE = "bg-blue-600 text-white border-blue-600";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getShortcutPeriod(shortcut) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  if (shortcut === "thisMonth") {
    return {
      fromDate: formatInputDate(new Date(year, month, 1)),
      toDate: formatInputDate(new Date(year, month + 1, 0)),
    };
  }

  return {
    fromDate: formatInputDate(new Date(year, month - 1, 1)),
    toDate: formatInputDate(new Date(year, month, 0)),
  };
}

export default function ExpensesDashboards() {
  const [summary, setSummary] = useState({
    total: 0,
    average: 0,
    count: 0,
    credit_total: 0,
    debit_total: 0,
    by_category: [],
  });
  const [periodFilters, setPeriodFilters] = useState({
    fromDate: "",
    toDate: "",
  });
  const [hoveredCategory, setHoveredCategory] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categoryExpenses, setCategoryExpenses] = useState([]);

  const invalidPeriod =
    periodFilters.fromDate &&
    periodFilters.toDate &&
    periodFilters.fromDate > periodFilters.toDate;

  const isShortcutActive = (shortcut) => {
    const period = getShortcutPeriod(shortcut);
    return (
      periodFilters.fromDate === period.fromDate &&
      periodFilters.toDate === period.toDate
    );
  };
  const getPeriodButtonClass = (shortcut) =>
    `${PERIOD_BUTTON_BASE} ${
      isShortcutActive(shortcut) ? PERIOD_BUTTON_ACTIVE : ""
    }`;

  useEffect(() => {
    if (invalidPeriod) return;

    async function loadSummary() {
      try {
        const data = await expensesService.summary({
          fromDate: periodFilters.fromDate,
          toDate: periodFilters.toDate,
        });
        setSummary({
          total: Number(data?.total || 0),
          average: Number(data?.average || 0),
          count: Number(data?.count || 0),
          credit_total: Number(data?.credit_total || 0),
          debit_total: Number(data?.debit_total || 0),
          by_category: Array.isArray(data?.by_category) ? data.by_category : [],
        });
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar dashboards"));
      }
    }

    loadSummary();
  }, [invalidPeriod, periodFilters.fromDate, periodFilters.toDate]);

  useEffect(() => {
    if (!selectedCategory || invalidPeriod) return;

    let isCurrentRequest = true;
    expensesService
      .list({
        fromDate: periodFilters.fromDate,
        toDate: periodFilters.toDate,
        categoryId: selectedCategory.id,
        limit: 500,
      })
      .then((data) => {
        if (isCurrentRequest) {
          setCategoryExpenses({
            key: `${selectedCategory.id}:${periodFilters.fromDate}:${periodFilters.toDate}`,
            items: Array.isArray(data) ? data : [],
          });
        }
      })
      .catch((err) => {
        if (isCurrentRequest) {
          setCategoryExpenses({
            key: `${selectedCategory.id}:${periodFilters.fromDate}:${periodFilters.toDate}`,
            items: [],
          });
          notify.error(getApiErrorMessage(err, "Erro ao carregar lançamentos"));
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [
    invalidPeriod,
    periodFilters.fromDate,
    periodFilters.toDate,
    selectedCategory,
  ]);

  const categoryRequestKey = selectedCategory
    ? `${selectedCategory.id}:${periodFilters.fromDate}:${periodFilters.toDate}`
    : "";
  const displayedCategoryExpenses =
    categoryExpenses.key === categoryRequestKey ? categoryExpenses.items : [];

  const categoriesSummary = useMemo(() => {
    const items = invalidPeriod ? [] : summary.by_category;
    return items
      .map((item) => ({
        id: item.category_id,
        name: item.category_name || "Sem categoria",
        total: Number(item.total || 0),
        count: Number(item.count || 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [invalidPeriod, summary.by_category]);

  const pieCategoriesSummary = useMemo(
    () =>
      categoriesSummary.filter(
        (item) =>
          item.name?.trim().toLowerCase() !==
          EXCLUDED_PIE_CATEGORY.toLowerCase(),
      ),
    [categoriesSummary],
  );

  const totalExpenses = invalidPeriod ? 0 : Number(summary.total || 0);
  const averageExpense = invalidPeriod ? 0 : Number(summary.average || 0);
  const launchCount = invalidPeriod ? 0 : Number(summary.count || 0);
  const pieTotalExpenses = useMemo(
    () => pieCategoriesSummary.reduce((acc, item) => acc + item.total, 0),
    [pieCategoriesSummary],
  );
  const paymentSplit = {
    debit: invalidPeriod ? 0 : Number(summary.debit_total || 0),
    credit: invalidPeriod ? 0 : Number(summary.credit_total || 0),
  };

  const pieSlices = useMemo(() => {
    if (pieTotalExpenses <= 0 || pieCategoriesSummary.length === 0) return [];

    let startAngle = 0;
    return pieCategoriesSummary.map((item, index) => {
      const percentage = (item.total / pieTotalExpenses) * 100;
      const angle = (item.total / pieTotalExpenses) * 360;
      const endAngle = startAngle + angle;
      const slice = {
        id: item.id,
        label: item.name,
        ...item,
        percentage,
        color: PIE_COLORS[index % PIE_COLORS.length],
        path: describeArc(110, 110, 95, startAngle, endAngle),
      };
      startAngle = endAngle;
      return slice;
    });
  }, [pieCategoriesSummary, pieTotalExpenses]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Dashboards de Despesas</h1>
        <Link
          to="/finances/expenses"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Despesas
        </Link>
      </div>

      <p className="themed-muted mb-6">
        Indicadores consolidados dos lançamentos de despesas.
      </p>

      <div className="themed-card themed-border border rounded-xl p-5 mb-4">
        <h2 className="font-semibold mb-3">Filtro por período</h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <button
            type="button"
            className={getPeriodButtonClass("thisMonth")}
            aria-pressed={isShortcutActive("thisMonth")}
            onClick={() => setPeriodFilters(getShortcutPeriod("thisMonth"))}
          >
            Mês atual
          </button>
          <button
            type="button"
            className={getPeriodButtonClass("lastMonth")}
            aria-pressed={isShortcutActive("lastMonth")}
            onClick={() => setPeriodFilters(getShortcutPeriod("lastMonth"))}
          >
            Mês passado
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <label className="text-sm">
            <span className="block themed-muted mb-1">De</span>
            <input
              type="date"
              className="themed-input rounded px-3 py-2 w-full"
              value={periodFilters.fromDate}
              onChange={(e) =>
                setPeriodFilters((prev) => ({
                  ...prev,
                  fromDate: e.target.value,
                }))
              }
            />
          </label>

          <label className="text-sm">
            <span className="block themed-muted mb-1">Até</span>
            <input
              type="date"
              className="themed-input rounded px-3 py-2 w-full"
              value={periodFilters.toDate}
              onChange={(e) =>
                setPeriodFilters((prev) => ({
                  ...prev,
                  toDate: e.target.value,
                }))
              }
            />
          </label>

          <button
            type="button"
            className="themed-border border rounded px-3 py-2 self-end hover:opacity-90 transition"
            onClick={() => setPeriodFilters({ fromDate: "", toDate: "" })}
          >
            Limpar período
          </button>
        </div>

        {invalidPeriod ? (
          <p className="text-sm text-red-500 mt-3">
            O período é inválido: a data inicial deve ser menor ou igual a data
            final.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total de Despesas</h2>
          <p className="text-2xl font-bold">{formatCurrency(totalExpenses)}</p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Ticket Medio</h2>
          <p className="text-2xl font-bold">{formatCurrency(averageExpense)}</p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Qtd. Lançamentos</h2>
          <p className="text-2xl font-bold">{launchCount}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total em Debito</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(paymentSplit.debit)}
          </p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total em Credito</h2>
          <p className="text-2xl font-bold">
            {formatCurrency(paymentSplit.credit)}
          </p>
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-4">
        <h2 className="font-semibold mb-3">Distribuição por Categoria</h2>
        {pieCategoriesSummary.length === 0 ? (
          <p className="themed-muted text-sm">Sem dados de categoria ainda.</p>
        ) : (
          <PieDonutChart
            slices={pieSlices}
            total={pieTotalExpenses}
            hoveredId={hoveredCategory}
            setHoveredId={setHoveredCategory}
            ariaLabel="Gráfico de pizza de despesas por categoria"
            countSuffix="lanç."
            onSelect={(category) =>
              setSelectedCategory({ id: category.id, name: category.label })
            }
          />
        )}
      </div>

      {selectedCategory ? (
        <div className="themed-card themed-border border rounded-xl p-5 mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="font-semibold">
                Lançamentos: {selectedCategory.name}
              </h2>
              <p className="themed-muted text-sm">
                {periodFilters.fromDate || periodFilters.toDate
                  ? `Período: ${periodFilters.fromDate || "início"} até ${periodFilters.toDate || "hoje"}`
                  : "Todos os períodos"}
              </p>
            </div>
            <button
              type="button"
              className="themed-border border rounded px-3 py-2 text-sm hover:opacity-90 transition"
              onClick={() => setSelectedCategory(null)}
            >
              Fechar lançamentos
            </button>
          </div>

          {invalidPeriod ? (
            <p className="themed-muted text-sm">
              Corrija o período para visualizar os lançamentos.
            </p>
          ) : categoryExpenses.key !== categoryRequestKey ? (
            <p className="themed-muted text-sm">Carregando lançamentos...</p>
          ) : displayedCategoryExpenses.length === 0 ? (
            <p className="themed-muted text-sm">
              Nenhum lançamento encontrado para esta categoria no período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="themed-muted border-b themed-border">
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Descrição</th>
                    <th className="py-2 pr-4">Pagamento</th>
                    <th className="py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCategoryExpenses.map((expense) => (
                    <tr
                      key={expense.id}
                      className="border-b themed-border last:border-0"
                    >
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {new Date(
                          `${expense.launch_date}T00:00:00`,
                        ).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="py-2 pr-4">{expense.description}</td>
                      <td className="py-2 pr-4">
                        {expense.payment_method === "credit"
                          ? "Crédito"
                          : "Débito"}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {formatCurrency(expense.value)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {displayedCategoryExpenses.length === 500 ? (
                <p className="themed-muted text-xs mt-3">
                  Exibindo os 500 lançamentos mais recentes.
                </p>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
