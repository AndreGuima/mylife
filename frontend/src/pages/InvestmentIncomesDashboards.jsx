import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { notify } from "../core/toast";
import investmentIncomesService from "../services/investmentIncomesService";
import investmentsService from "../services/investmentsService";
import PieDonutChart from "../components/charts/PieDonutChart";
import { describeArc } from "../utils/charts/pieMath";
import { localDateTimestamp, localMonthKey } from "../utils/localDate";

const PIE_COLORS = ["#0ea5e9", "#22c55e", "#f59e0b"];
const INCOME_SERIES = [
  { key: "dividend", label: "Dividendos", color: "#0ea5e9" },
  { key: "jcp", label: "JCP", color: "#22c55e" },
  { key: "rendimento", label: "Rendimentos", color: "#f59e0b" },
];
const PERIOD_BUTTON_BASE =
  "themed-border border rounded px-3 py-2 text-sm hover:opacity-90 transition";
const PERIOD_BUTTON_ACTIVE = "bg-blue-600 text-white border-blue-600";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toTimestamp(value) {
  return localDateTimestamp(value);
}

function monthKey(value) {
  return localMonthKey(value);
}

function monthLabel(key) {
  const [y, m] = String(key).split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", {
    month: "short",
    year: "numeric",
  });
}

function monthTimestamp(key) {
  const [y, m] = String(key).split("-");
  const ts = new Date(Number(y), Number(m) - 1, 1).getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function IncomeTimelineChart({ items }) {
  const series = useMemo(() => {
    const grouped = new Map();
    items.forEach((item) => {
      const key = monthKey(item.received_at);
      if (!key) return;
      if (!grouped.has(key)) grouped.set(key, {});
      const type = String(item.income_type || "rendimento");
      const month = grouped.get(key);
      month[type] = (month[type] || 0) + Number(item.amount || 0);
    });

    const rows = [...grouped.entries()]
      .sort((a, b) => monthTimestamp(a[0]) - monthTimestamp(b[0]))
      .map(([key, amounts]) => ({ key, label: monthLabel(key), amounts }));
    return rows;
  }, [items]);

  if (!series.length) {
    return <p className="themed-muted text-sm">Sem dados ainda.</p>;
  }

  const width = 760;
  const height = 260;
  const padding = { top: 16, right: 16, bottom: 42, left: 74 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(
    1,
    ...series.flatMap((row) =>
      INCOME_SERIES.map((type) => row.amounts[type.key] || 0),
    ),
  );
  const x = (index) =>
    padding.left +
    (series.length === 1
      ? chartWidth / 2
      : (index / (series.length - 1)) * chartWidth);
  const y = (value) =>
    padding.top + chartHeight - (value / maxValue) * chartHeight;
  const tickValues = [0, maxValue / 2, maxValue];

  return (
    <div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mb-3 text-xs themed-muted">
        {INCOME_SERIES.map((type) => (
          <span key={type.key} className="inline-flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: type.color }}
            />
            {type.label}
          </span>
        ))}
      </div>
      <div className="w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full min-w-[560px]"
          role="img"
          aria-label="Evolução mensal dos recebimentos por tipo, em todo o período"
        >
          {tickValues.map((value) => {
            const tickY = y(value);
            return (
              <g key={value}>
                <line
                  x1={padding.left}
                  x2={width - padding.right}
                  y1={tickY}
                  y2={tickY}
                  stroke="var(--line-color)"
                  strokeDasharray="3 4"
                />
                <text
                  x={padding.left - 8}
                  y={tickY + 4}
                  textAnchor="end"
                  className="fill-current themed-muted"
                  fontSize="10"
                >
                  {formatCurrency(value)}
                </text>
              </g>
            );
          })}
          {INCOME_SERIES.map((type) => {
            const points = series
              .map(
                (row, index) => `${x(index)},${y(row.amounts[type.key] || 0)}`,
              )
              .join(" ");
            return (
              <g key={type.key}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={type.color}
                  strokeWidth="3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {series.map((row, index) => (
                  <circle
                    key={`${type.key}-${row.key}`}
                    cx={x(index)}
                    cy={y(row.amounts[type.key] || 0)}
                    r="3.5"
                    fill={type.color}
                  >
                    <title>{`${row.label} · ${type.label}: ${formatCurrency(row.amounts[type.key] || 0)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {series.map((row, index) => (
            <text
              key={row.key}
              x={x(index)}
              y={height - 12}
              textAnchor="middle"
              className="fill-current themed-muted"
              fontSize="10"
            >
              {series.length > 12 && index % Math.ceil(series.length / 10) !== 0
                ? ""
                : row.label}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function buildPieSlices(summary) {
  const total = summary.reduce((acc, item) => acc + Number(item.total || 0), 0);
  if (total <= 0 || summary.length === 0) return { total, slices: [] };

  let startAngle = 0;
  const slices = summary.map((item, index) => {
    const percentage = (item.total / total) * 100;
    const angle = (item.total / total) * 360;
    const endAngle = startAngle + angle;
    const slice = {
      id: item.type,
      label: item.label,
      ...item,
      percentage,
      color: PIE_COLORS[index % PIE_COLORS.length],
      path: describeArc(110, 110, 95, startAngle, endAngle),
    };
    startAngle = endAngle;
    return slice;
  });

  return { total, slices };
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

  if (shortcut === "lastMonth") {
    return {
      fromDate: formatInputDate(new Date(year, month - 1, 1)),
      toDate: formatInputDate(new Date(year, month, 0)),
    };
  }

  return {
    fromDate: formatInputDate(new Date(year, 0, 1)),
    toDate: formatInputDate(new Date(year, 11, 31)),
  };
}

function AssetTypePieCard({ summary }) {
  const { total, slices } = useMemo(() => buildPieSlices(summary), [summary]);
  const [hoveredType, setHoveredType] = useState(null);

  return (
    <div className="themed-card themed-border border rounded-xl p-5">
      <h2 className="font-semibold mb-3">Proventos por Tipo de Ativo</h2>
      <PieDonutChart
        slices={slices}
        total={total}
        hoveredId={hoveredType}
        setHoveredId={setHoveredType}
        ariaLabel="Gráfico de pizza de proventos por tipo de ativo"
        countSuffix="lançamentos"
      />
    </div>
  );
}

export default function InvestmentIncomesDashboards() {
  const [items, setItems] = useState([]);
  const [allTimeItems, setAllTimeItems] = useState([]);
  const [timelineTicker, setTimelineTicker] = useState("");
  const [investments, setInvestments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [periodFilters, setPeriodFilters] = useState(() =>
    getShortcutPeriod("thisMonth"),
  );

  const invalidPeriod =
    periodFilters.fromDate &&
    periodFilters.toDate &&
    periodFilters.fromDate > periodFilters.toDate;

  useEffect(() => {
    if (invalidPeriod) return;

    async function loadData() {
      setLoading(true);
      try {
        const [incomesData, investmentsData, allTimeIncomesData] =
          await Promise.all([
            investmentIncomesService.list({
              fromDate: periodFilters.fromDate,
              toDate: periodFilters.toDate,
            }),
            investmentsService.list(),
            investmentIncomesService.list(),
          ]);
        setItems(Array.isArray(incomesData) ? incomesData : []);
        setAllTimeItems(
          Array.isArray(allTimeIncomesData) ? allTimeIncomesData : [],
        );
        setInvestments(Array.isArray(investmentsData) ? investmentsData : []);
      } catch {
        notify.error("Erro ao carregar dashboard de proventos");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [invalidPeriod, periodFilters.fromDate, periodFilters.toDate]);

  const visibleItems = useMemo(
    () => (invalidPeriod ? [] : items),
    [invalidPeriod, items],
  );

  const totalAmount = useMemo(
    () => visibleItems.reduce((acc, item) => acc + Number(item.amount || 0), 0),
    [visibleItems],
  );

  const monthlySeries = useMemo(() => {
    const grouped = new Map();
    visibleItems.forEach((item) => {
      const key = monthKey(item.received_at);
      if (!key) return;
      grouped.set(key, (grouped.get(key) || 0) + Number(item.amount || 0));
    });

    return [...grouped.entries()]
      .sort((a, b) => monthTimestamp(a[0]) - monthTimestamp(b[0]))
      .map(([key, total]) => ({ key, label: monthLabel(key), total }));
  }, [visibleItems]);

  const typeSummary = useMemo(() => {
    const labels = {
      dividend: "Dividendo",
      provento: "Provento",
      jcp: "JCP",
      rendimento: "Rendimento",
    };

    const grouped = visibleItems.reduce((acc, item) => {
      const type = String(item.income_type || "provento");
      if (!acc[type]) {
        acc[type] = {
          type,
          label: labels[type] || "Provento",
          total: 0,
          count: 0,
        };
      }
      acc[type].total += Number(item.amount || 0);
      acc[type].count += 1;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [visibleItems]);

  const assetTypeSummary = useMemo(() => {
    const investmentTypeByTicker = new Map();

    investments.forEach((item) => {
      const ticker = String(item.ticker || "")
        .trim()
        .toUpperCase();
      const assetType = String(item.asset_type || "")
        .trim()
        .toLowerCase();

      if (!ticker || !assetType || investmentTypeByTicker.has(ticker)) return;
      investmentTypeByTicker.set(ticker, assetType);
    });

    const grouped = visibleItems.reduce((acc, item) => {
      const ticker = String(item.ticker || "")
        .trim()
        .toUpperCase();
      const assetType = investmentTypeByTicker.get(ticker);

      const normalizedType =
        assetType === "stock" || assetType === "acao" || assetType === "acoes"
          ? "stock"
          : assetType === "fii" || assetType === "fiis"
            ? "fii"
            : "unknown";

      if (!acc[normalizedType]) {
        acc[normalizedType] = {
          type: normalizedType,
          label:
            normalizedType === "stock"
              ? "Ações"
              : normalizedType === "fii"
                ? "FIIs"
                : "Sem vínculo",
          total: 0,
          count: 0,
        };
      }

      acc[normalizedType].total += Number(item.amount || 0);
      acc[normalizedType].count += 1;
      return acc;
    }, {});

    return Object.values(grouped).sort((a, b) => b.total - a.total);
  }, [investments, visibleItems]);

  const lastIncomeAt = useMemo(() => {
    if (!visibleItems.length) return null;
    const latest = [...visibleItems].sort(
      (a, b) => toTimestamp(b.received_at) - toTimestamp(a.received_at),
    )[0];
    return latest?.received_at || null;
  }, [visibleItems]);

  const timelineAssets = useMemo(
    () =>
      [
        ...new Set(
          allTimeItems
            .map((item) =>
              String(item.ticker || "")
                .trim()
                .toUpperCase(),
            )
            .filter(Boolean),
        ),
      ].sort(),
    [allTimeItems],
  );
  const timelineItems = useMemo(
    () =>
      timelineTicker
        ? allTimeItems.filter(
            (item) =>
              String(item.ticker || "")
                .trim()
                .toUpperCase() === timelineTicker,
          )
        : allTimeItems,
    [allTimeItems, timelineTicker],
  );

  const maxMonthly = Math.max(1, ...monthlySeries.map((item) => item.total));
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

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-bold">Dashboard de Proventos</h1>
        <Link
          to="/finances/investments/incomes"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Proventos
        </Link>
      </div>

      {loading ? (
        <p className="themed-muted">Carregando dashboard...</p>
      ) : (
        <>
          <div className="themed-card themed-border border rounded-xl p-5 mb-4">
            <h2 className="font-semibold mb-3">Filtro por período</h2>
            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className={getPeriodButtonClass("thisMonth")}
                aria-pressed={isShortcutActive("thisMonth")}
                onClick={() => setPeriodFilters(getShortcutPeriod("thisMonth"))}
              >
                Este mês
              </button>
              <button
                type="button"
                className={getPeriodButtonClass("lastMonth")}
                aria-pressed={isShortcutActive("lastMonth")}
                onClick={() => setPeriodFilters(getShortcutPeriod("lastMonth"))}
              >
                Mês passado
              </button>
              <button
                type="button"
                className={getPeriodButtonClass("thisYear")}
                aria-pressed={isShortcutActive("thisYear")}
                onClick={() => setPeriodFilters(getShortcutPeriod("thisYear"))}
              >
                Este ano
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
                O período é inválido: a data inicial deve ser menor ou igual a
                data final.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="themed-card themed-border border rounded-xl p-5">
              <h2 className="font-semibold mb-1">Total Recebido</h2>
              <p className="text-2xl font-bold">
                {formatCurrency(totalAmount)}
              </p>
            </div>
            <div className="themed-card themed-border border rounded-xl p-5">
              <h2 className="font-semibold mb-1">Lançamentos</h2>
              <p className="text-2xl font-bold">{visibleItems.length}</p>
            </div>
            <div className="themed-card themed-border border rounded-xl p-5">
              <h2 className="font-semibold mb-1">Último Recebimento</h2>
              <p className="text-2xl font-bold">
                {lastIncomeAt
                  ? new Date(`${lastIncomeAt}T00:00:00`).toLocaleDateString(
                      "pt-BR",
                    )
                  : "-"}
              </p>
            </div>
          </div>

          <div className="mb-4">
            <AssetTypePieCard summary={assetTypeSummary} />
          </div>

          <div className="themed-card themed-border border rounded-xl p-5 mb-4">
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div>
                <h2 className="font-semibold mb-1">
                  Evolução dos recebimentos por tipo
                </h2>
                <p className="themed-muted text-sm">
                  Histórico agrupado por mês
                  {timelineTicker
                    ? ` para ${timelineTicker}`
                    : " de todos os ativos"}
                  .
                </p>
              </div>
              <label className="text-sm">
                <span className="block themed-muted mb-1">Ativo</span>
                <select
                  className="themed-input themed-border border rounded px-3 py-2 min-w-48"
                  value={timelineTicker}
                  onChange={(event) => setTimelineTicker(event.target.value)}
                  aria-label="Selecionar ativo para a evolução dos recebimentos"
                >
                  <option value="">Todos os ativos</option>
                  {timelineAssets.map((ticker) => (
                    <option key={ticker} value={ticker}>
                      {ticker}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <IncomeTimelineChart items={timelineItems} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="themed-card themed-border border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Proventos por Tipo</h2>
              {typeSummary.length === 0 ? (
                <p className="themed-muted text-sm">Sem dados ainda.</p>
              ) : (
                <div className="space-y-2">
                  {typeSummary.map((item) => (
                    <div
                      key={item.type}
                      className="flex items-center justify-between themed-card themed-border border rounded-lg px-3 py-2 text-sm"
                    >
                      <span>{item.label}</span>
                      <span className="font-medium">
                        {formatCurrency(item.total)} ({item.count})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="themed-card themed-border border rounded-xl p-5">
              <h2 className="font-semibold mb-3">Evolução Mensal</h2>
              {monthlySeries.length === 0 ? (
                <p className="themed-muted text-sm">Sem dados ainda.</p>
              ) : (
                <div className="space-y-2">
                  {monthlySeries.map((item) => (
                    <div key={item.key}>
                      <div className="flex items-center justify-between text-xs themed-muted mb-1">
                        <span>{item.label}</span>
                        <span>{formatCurrency(item.total)}</span>
                      </div>
                      <div className="h-2 rounded bg-[var(--line-color)] overflow-hidden">
                        <div
                          className="h-full bg-blue-600"
                          style={{
                            width: `${(item.total / maxMonthly) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
