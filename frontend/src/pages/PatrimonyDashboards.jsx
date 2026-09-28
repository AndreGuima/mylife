import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PieDonutChart from "../components/charts/PieDonutChart";
import bankAccountsService from "../services/bankAccountsService";
import { notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import { describeArc } from "../utils/charts/pieMath";
import {
  buildPatrimonyComparisonSummary,
  getPatrimonyComparisonDelta,
} from "../utils/patrimonyComparison";

function toDateKey(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function toMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function toDateLabel(dateKey) {
  return new Date(`${dateKey}T00:00:00`).toLocaleDateString("pt-BR");
}

function toTimestamp(value) {
  const ts = new Date(value || "").getTime();
  return Number.isFinite(ts) ? ts : 0;
}

const PERIOD_OPTIONS = [
  { label: "1M", days: 30 },
  { label: "6M", days: 183 },
  { label: "1A", days: 365 },
  { label: "5A", days: 1825 },
  { label: "Máx", days: 3650 },
];

const LINE_COLORS = [
  "#2563eb",
  "#f59e0b",
  "#10b981",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#84cc16",
];

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

function computeAxisValues(minValue, maxValue, tickCount) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return {
      yMin: 0,
      yMax: 1,
      yValues: Array.from({ length: tickCount }, (_, idx) => idx),
    };
  }

  if (minValue === maxValue) {
    const delta = Math.max(Math.abs(minValue) * 0.02, 1);
    minValue -= delta;
    maxValue += delta;
  }

  const range = maxValue - minValue;
  const padding = Math.max(range * 0.2, Math.abs(maxValue) * 0.005, 1);
  const rawMin = minValue - padding;
  const rawMax = maxValue + padding;

  const rawStep = (rawMax - rawMin) / (tickCount - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  let niceNormalized = 1;
  if (normalized <= 1) niceNormalized = 1;
  else if (normalized <= 2) niceNormalized = 2;
  else if (normalized <= 5) niceNormalized = 5;
  else niceNormalized = 10;

  const step = niceNormalized * magnitude;
  const yMin = Math.floor(rawMin / step) * step;
  const yMax = Math.ceil(rawMax / step) * step;
  const yValues = Array.from({ length: tickCount }, (_, idx) => {
    const ratio = idx / (tickCount - 1);
    return yMax - (yMax - yMin) * ratio;
  });

  return { yMin, yMax, yValues };
}

function buildSeriesFromSnapshots(snapshots) {
  const latestByDate = new Map();

  (snapshots || []).forEach((snapshot) => {
    const dateKey = toDateKey(snapshot.snapshot_at);
    if (!dateKey) return;

    const existing = latestByDate.get(dateKey);
    if (
      !existing ||
      new Date(snapshot.snapshot_at) > new Date(existing.snapshot_at)
    ) {
      latestByDate.set(dateKey, snapshot);
    }
  });

  const points = [...latestByDate.entries()]
    .sort((a, b) => toTimestamp(a[0]) - toTimestamp(b[0]))
    .map(([dateKey, snapshot]) => ({
      dateKey,
      total: Number(snapshot.total_value || 0),
      snapshotAt: snapshot.snapshot_at,
      hasBreakdown: Boolean(snapshot.has_breakdown),
      accounts: Array.isArray(snapshot.accounts) ? snapshot.accounts : [],
    }));

  const accountEntries = [];
  const seenAccounts = new Set();

  points.forEach((point) => {
    point.accounts.forEach((account) => {
      const label =
        String(account.account_name || "").trim() || "Conta sem nome";
      const key =
        account.bank_account_id != null
          ? `id:${account.bank_account_id}`
          : `name:${label}`;

      if (seenAccounts.has(key)) return;

      seenAccounts.add(key);
      accountEntries.push({ key, label });
    });
  });

  const accountSeries = accountEntries.map((entry, index) => ({
    id: `account:${entry.key}`,
    label: entry.label,
    color: LINE_COLORS[(index % (LINE_COLORS.length - 1)) + 1],
    strokeWidth: 2,
    values: points.map((point) => {
      const account = point.accounts.find((item) => {
        const label =
          String(item.account_name || "").trim() || "Conta sem nome";
        const key =
          item.bank_account_id != null
            ? `id:${item.bank_account_id}`
            : `name:${label}`;
        return key === entry.key;
      });

      if (account) return Number(account.total_value || 0);
      return point.hasBreakdown ? 0 : null;
    }),
  }));

  return {
    points,
    lines: [
      {
        id: "total",
        label: "Montante total",
        color: LINE_COLORS[0],
        strokeWidth: 3,
        values: points.map((point) => point.total),
      },
      ...accountSeries,
    ],
  };
}

function buildAccountPieSlices(accounts) {
  const normalizedAccounts = (accounts || [])
    .map((account) => ({
      id: account.id,
      name: String(account.name || "").trim() || "Conta sem nome",
      total: Number(account.total_value || 0),
    }))
    .filter((account) => account.total > 0)
    .sort((a, b) => b.total - a.total);

  const total = normalizedAccounts.reduce(
    (acc, account) => acc + account.total,
    0,
  );

  if (total <= 0 || normalizedAccounts.length === 0) {
    return { total, slices: [] };
  }

  let startAngle = 0;
  const slices = normalizedAccounts.map((account, index) => {
    const percentage = total > 0 ? (account.total / total) * 100 : 0;
    const angle = (account.total / total) * 360;
    const endAngle = startAngle + angle;
    const slice = {
      id: `account-${account.id}`,
      label: account.name,
      total: account.total,
      count: 1,
      percentage,
      color: PIE_COLORS[index % PIE_COLORS.length],
      path: describeArc(110, 110, 95, startAngle, endAngle),
    };
    startAngle = endAngle;
    return slice;
  });

  return { total, slices };
}

function buildLinePath(points, values, xForIndex, yForValue) {
  return values
    .reduce((segments, value, index) => {
      if (value == null) return segments;
      const command =
        segments.length === 0 || values[index - 1] == null ? "M" : "L";
      segments.push(`${command} ${xForIndex(index)} ${yForValue(value)}`);
      return segments;
    }, [])
    .join(" ");
}

function PatrimonyLineChart({ chart }) {
  const { points, lines } = chart;
  const width = 900;
  const height = 320;
  const margin = { top: 20, right: 18, bottom: 42, left: 86 };
  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const yTicks = 5;
  const allValues = lines
    .flatMap((line) => line.values)
    .filter((value) => Number.isFinite(value));
  const minValue = allValues.length ? Math.min(...allValues) : 0;
  const maxValue = allValues.length ? Math.max(...allValues) : 0;
  const { yMin, yMax, yValues } = computeAxisValues(minValue, maxValue, yTicks);

  const xForIndex = (index) =>
    margin.left +
    (points.length === 1
      ? innerWidth / 2
      : (innerWidth * index) / (points.length - 1));
  const yForValue = (value) =>
    margin.top + innerHeight - ((value - yMin) / (yMax - yMin)) * innerHeight;

  const first = points[0];
  const middle = points[Math.floor(points.length / 2)];
  const last = points[points.length - 1];
  const xLabelPoints = [first, middle, last].filter(
    (point, index, arr) =>
      point &&
      arr.findIndex((item) => item?.dateKey === point.dateKey) === index,
  );

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex flex-wrap gap-3 mb-4 text-xs themed-muted">
        {lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2">
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: line.color }}
            />
            <span>{line.label}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[720px]">
        {yValues.map((value, idx) => {
          const y = yForValue(value);
          return (
            <g key={`y-${idx}`}>
              <line
                x1={margin.left}
                y1={y}
                x2={width - margin.right}
                y2={y}
                className="stroke-[var(--line-color)]"
                strokeWidth="1"
              />
              <text
                x={margin.left - 10}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[var(--muted-text)] text-[11px]"
              >
                {toMoney(value)}
              </text>
            </g>
          );
        })}

        {lines.map((line) => {
          const path = buildLinePath(points, line.values, xForIndex, yForValue);
          if (!path) return null;

          return (
            <g key={line.id}>
              <path
                d={path}
                fill="none"
                stroke={line.color}
                strokeWidth={line.strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {line.values.map((value, index) => {
                if (value == null) return null;
                return (
                  <circle
                    key={`${line.id}-${points[index].dateKey}`}
                    cx={xForIndex(index)}
                    cy={yForValue(value)}
                    r={line.id === "total" ? 4 : 3}
                    fill={line.color}
                  >
                    <title>{`${line.label} - ${toDateLabel(points[index].dateKey)} - ${toMoney(value)}`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}

        {xLabelPoints.map((point) => {
          const index = points.findIndex(
            (item) => item.dateKey === point.dateKey,
          );
          return (
            <text
              key={`x-${point.dateKey}`}
              x={xForIndex(index)}
              y={height - 14}
              textAnchor="middle"
              className="fill-[var(--muted-text)] text-[11px]"
            >
              {toDateLabel(point.dateKey)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function PatrimonyAccountsPieCard({ accounts }) {
  const { total, slices } = useMemo(
    () => buildAccountPieSlices(accounts),
    [accounts],
  );
  const [hoveredAccount, setHoveredAccount] = useState(null);

  return (
    <div className="themed-card themed-border border rounded-xl p-5 mt-4">
      <h2 className="text-xl font-semibold mb-2">
        Distribuição Atual por Conta
      </h2>
      <p className="themed-muted text-sm mb-4">
        Composição do patrimônio atual considerando o saldo de cada conta.
      </p>
      {slices.length === 0 ? (
        <p className="themed-muted text-sm">
          Sem contas com saldo para montar o gráfico.
        </p>
      ) : (
        <PieDonutChart
          slices={slices}
          total={total}
          hoveredId={hoveredAccount}
          setHoveredId={setHoveredAccount}
          ariaLabel="Gráfico de pizza da distribuição atual do patrimônio por conta"
          countSuffix="conta"
        />
      )}
    </div>
  );
}

export default function PatrimonyDashboards() {
  const [accounts, setAccounts] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [periodDays, setPeriodDays] = useState(365);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAccounts() {
      try {
        const accountsData = await bankAccountsService.list();
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar contas"));
      }
    }

    loadAccounts();
  }, []);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const snapshotsData = await bankAccountsService.snapshots(periodDays);
        setSnapshots(Array.isArray(snapshotsData) ? snapshotsData : []);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar dashboards"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [periodDays]);

  const chart = useMemo(() => buildSeriesFromSnapshots(snapshots), [snapshots]);
  const totalCurrent = chart.points.length
    ? chart.points[chart.points.length - 1].total
    : 0;
  const comparisonSummary = useMemo(
    () =>
      buildPatrimonyComparisonSummary(
        chart.points,
        chart.points.at(-1)?.dateKey,
      ),
    [chart.points],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6 gap-3">
        <h1 className="text-3xl font-bold">Dashboards de Patrimônio</h1>
        <Link
          to="/finances/patrimony"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Patrimônio
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Montante Atual</h2>
          <p className="text-2xl font-bold">{toMoney(totalCurrent)}</p>
          <p className="themed-muted text-sm mt-1">
            Soma das contas cadastradas
          </p>
        </div>
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Pontos no Gráfico</h2>
          <p className="text-2xl font-bold">{chart.points.length}</p>
          <p className="themed-muted text-sm mt-1">
            Datas com evolução registrada
          </p>
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mb-6">
        <h2 className="text-xl font-semibold mb-2">
          Comparativo de Patrimônio
        </h2>
        <p className="themed-muted text-sm mb-4">
          Acompanhamento rápido do patrimônio atual em relação a ontem, semana
          passada e mês passado.
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left themed-muted">
                <th className="py-2 pr-4">Período</th>
                <th className="py-2">Valor</th>
              </tr>
            </thead>
            <tbody>
              {comparisonSummary.map((item) => {
                const delta = getPatrimonyComparisonDelta(
                  item,
                  comparisonSummary,
                );
                const isPositive = delta.value >= 0;
                return (
                  <tr
                    key={item.label}
                    className="border-t border-[var(--border-color)]/60"
                  >
                    <td className="py-3 pr-4 font-medium">{item.label}</td>
                    <td className="py-3">
                      <div className="font-semibold">{toMoney(item.value)}</div>
                      <div
                        className={`text-xs ${isPositive ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {isPositive ? "+" : ""}
                        {toMoney(Math.abs(delta.value))}{" "}
                        {isPositive ? "acima" : "abaixo"} {delta.referenceLabel}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-2">
          Montante Geral ao Longo do Tempo
        </h2>
        <p className="themed-muted text-sm mb-4">
          Evolução do patrimônio total e de cada conta com base nos snapshots
          salvos nas alterações.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PERIOD_OPTIONS.map((option) => {
            const isActive = option.days === periodDays;
            return (
              <button
                key={option.label}
                type="button"
                onClick={() => setPeriodDays(option.days)}
                className={`px-3 py-1.5 rounded-lg border text-sm transition ${
                  isActive
                    ? "bg-blue-600 text-white border-blue-600"
                    : "themed-card themed-border border hover:opacity-90"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="themed-muted">Carregando dados...</p>
        ) : chart.points.length === 0 ? (
          <p className="themed-muted">
            Ainda não há contas cadastradas para gerar o gráfico.
          </p>
        ) : (
          <PatrimonyLineChart chart={chart} />
        )}
      </div>

      <PatrimonyAccountsPieCard accounts={accounts} />
    </div>
  );
}
