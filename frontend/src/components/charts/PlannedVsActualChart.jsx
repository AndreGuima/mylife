import { useMemo, useState } from "react";

const WIDTH = 760;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 32, left: 72 };
const PLANNED_COLOR = "#3b82f6";
const ACTUAL_COLOR = "#f97316";
const OVER_COLOR = "#ef4444";

function formatShortDate(isoDate) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

function niceMax(value) {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const normalized = value / magnitude;
  const step = steps.find((s) => s >= normalized) ?? 10;
  return step * magnitude;
}

/**
 * Cumulative planned vs. actual line chart for a billing cycle.
 *
 * points: [{ date, planned, actual, daily, isThreshold }] with numeric values
 * (planned may be null when no limits are configured).
 */
export default function PlannedVsActualChart({
  points,
  referenceDate,
  formatValue,
}) {
  const [hoverIndex, setHoverIndex] = useState(null);

  const geometry = useMemo(() => {
    const innerW = WIDTH - PAD.left - PAD.right;
    const innerH = HEIGHT - PAD.top - PAD.bottom;
    const maxValue = niceMax(
      Math.max(
        0,
        ...points.map((p) => p.actual),
        ...points.map((p) => p.planned ?? 0),
      ),
    );
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;
    const x = (i) => PAD.left + i * stepX;
    const y = (v) => PAD.top + innerH - (v / maxValue) * innerH;

    const toPath = (key) =>
      points
        .map((p, i) =>
          p[key] == null
            ? null
            : `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`,
        )
        .filter(Boolean)
        .join(" ");

    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxValue);
    const labelEvery = Math.max(1, Math.ceil(points.length / 8));
    const todayIndex = points.findIndex((p) => p.date === referenceDate);

    return {
      innerW,
      innerH,
      stepX,
      x,
      y,
      ticks,
      labelEvery,
      todayIndex,
      plannedPath: toPath("planned"),
      actualPath: toPath("actual"),
    };
  }, [points, referenceDate]);

  if (points.length === 0) return null;

  const { x, y, ticks, labelEvery, todayIndex, stepX } = geometry;
  const hovered = hoverIndex != null ? points[hoverIndex] : null;
  const hasPlanned = points.some((p) => p.planned != null);

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-4 text-sm mb-2">
        {hasPlanned && (
          <span className="inline-flex items-center gap-2">
            <span
              className="inline-block w-5 border-t-2 border-dashed"
              style={{ borderColor: PLANNED_COLOR }}
            />
            Planejado (acumulado)
          </span>
        )}
        <span className="inline-flex items-center gap-2">
          <span
            className="inline-block w-5 border-t-2"
            style={{ borderColor: ACTUAL_COLOR }}
          />
          Realizado (acumulado)
        </span>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Gráfico de gastos planejados versus realizados no ciclo"
        onMouseLeave={() => setHoverIndex(null)}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              stroke="var(--line-color)"
            />
            <text
              x={PAD.left - 8}
              y={y(tick)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize="11"
              fill="var(--muted-text)"
            >
              {formatValue(tick)}
            </text>
          </g>
        ))}

        {points.map((p, i) =>
          i % labelEvery === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={x(i)}
              y={HEIGHT - 10}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted-text)"
            >
              {formatShortDate(p.date)}
            </text>
          ) : null,
        )}

        {todayIndex >= 0 && (
          <g>
            <line
              x1={x(todayIndex)}
              x2={x(todayIndex)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--muted-text)"
              strokeDasharray="2 3"
            />
            <text
              x={x(todayIndex) + 4}
              y={PAD.top + 10}
              fontSize="11"
              fill="var(--muted-text)"
            >
              hoje
            </text>
          </g>
        )}

        {hasPlanned && (
          <path
            d={geometry.plannedPath}
            fill="none"
            stroke={PLANNED_COLOR}
            strokeWidth="2"
            strokeDasharray="6 4"
          />
        )}
        <path
          d={geometry.actualPath}
          fill="none"
          stroke={ACTUAL_COLOR}
          strokeWidth="2.5"
        />

        {points.map((p, i) =>
          p.isThreshold && p.planned != null ? (
            <circle
              key={`th-${p.date}`}
              cx={x(i)}
              cy={y(p.planned)}
              r="4"
              fill={PLANNED_COLOR}
            />
          ) : null,
        )}

        {hovered && (
          <g>
            <line
              x1={x(hoverIndex)}
              x2={x(hoverIndex)}
              y1={PAD.top}
              y2={HEIGHT - PAD.bottom}
              stroke="var(--muted-text)"
              strokeOpacity="0.5"
            />
            <circle
              cx={x(hoverIndex)}
              cy={y(hovered.actual)}
              r="4"
              fill={
                hovered.planned != null && hovered.actual > hovered.planned
                  ? OVER_COLOR
                  : ACTUAL_COLOR
              }
            />
          </g>
        )}

        {points.map((p, i) => (
          <rect
            key={`hit-${p.date}`}
            x={x(i) - Math.max(stepX, 8) / 2}
            y={PAD.top}
            width={Math.max(stepX, 8)}
            height={HEIGHT - PAD.top - PAD.bottom}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}
      </svg>

      {hovered && (
        <div
          className="absolute top-8 themed-card themed-border border rounded px-3 py-2 text-sm shadow pointer-events-none"
          style={{
            left: `${(x(hoverIndex) / WIDTH) * 100}%`,
            transform:
              hoverIndex > points.length / 2
                ? "translateX(calc(-100% - 8px))"
                : "translateX(8px)",
          }}
        >
          <p className="font-semibold">{formatShortDate(hovered.date)}</p>
          {hovered.planned != null && (
            <p>Planejado: {formatValue(hovered.planned)}</p>
          )}
          <p>Realizado: {formatValue(hovered.actual)}</p>
          <p className="themed-muted">No dia: {formatValue(hovered.daily)}</p>
        </div>
      )}
    </div>
  );
}
