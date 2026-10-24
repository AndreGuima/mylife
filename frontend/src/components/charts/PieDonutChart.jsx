function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function PieDonutChart({
  slices,
  total,
  hoveredId,
  setHoveredId,
  ariaLabel,
  countSuffix,
  onSelect,
}) {
  const activeSlice = slices.find((slice) => slice.id === hoveredId) || null;

  if (slices.length === 0) {
    return (
      <p className="themed-muted text-sm">
        Sem dados suficientes para montar o grafico.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
      <div className="w-full max-w-[260px] mx-auto">
        <svg
          viewBox="0 0 220 220"
          role="img"
          aria-label={ariaLabel}
          className="w-full h-auto drop-shadow-sm"
        >
          <circle cx="110" cy="110" r="98" fill="rgba(255,255,255,0.04)" />
          {slices.map((slice) => {
            const isActive = hoveredId === slice.id;
            const hasActive = hoveredId !== null;
            const itemKey = `${slice.id}-${slice.total}`;

            return (
              <path
                key={itemKey}
                d={slice.path}
                fill={slice.color}
                className="transition-all duration-150"
                style={{
                  opacity: hasActive && !isActive ? 0.4 : 1,
                  stroke: isActive ? "var(--text-color)" : "transparent",
                  strokeWidth: isActive ? 2 : 0,
                  transform: isActive ? "scale(1.05)" : "scale(1)",
                  transformOrigin: "110px 110px",
                  transition: "transform 0.2s ease, opacity 0.2s ease",
                  cursor: "pointer",
                }}
                tabIndex={0}
                role={onSelect ? "button" : undefined}
                aria-label={
                  onSelect ? `Selecionar categoria ${slice.label}` : undefined
                }
                onClick={() => onSelect?.(slice)}
                onKeyDown={(event) => {
                  if (
                    onSelect &&
                    (event.key === "Enter" || event.key === " ")
                  ) {
                    event.preventDefault();
                    onSelect(slice);
                  }
                }}
                onMouseEnter={() => setHoveredId(slice.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(slice.id)}
                onBlur={() => setHoveredId(null)}
              />
            );
          })}
          <circle cx="110" cy="110" r="48" fill="var(--card-bg)" />
          {activeSlice ? (
            <>
              <text
                x="110"
                y="96"
                textAnchor="middle"
                className="fill-current text-[10px] font-medium themed-muted"
              >
                {activeSlice.label}
              </text>
              <text
                x="110"
                y="112"
                textAnchor="middle"
                className="fill-current text-[11px] font-semibold"
              >
                {formatCurrency(activeSlice.total)}
              </text>
              <text
                x="110"
                y="126"
                textAnchor="middle"
                className="fill-current text-[10px] themed-muted"
              >
                {activeSlice.percentage.toFixed(1)}%
              </text>
            </>
          ) : (
            <>
              <text
                x="110"
                y="104"
                textAnchor="middle"
                className="fill-current text-[10px] font-medium themed-muted"
              >
                Total
              </text>
              <text
                x="110"
                y="120"
                textAnchor="middle"
                className="fill-current text-[11px] font-semibold"
              >
                {formatCurrency(total)}
              </text>
            </>
          )}
        </svg>
      </div>

      <div className="space-y-2">
        {slices.map((slice) => {
          const isActive = hoveredId === slice.id;
          const hasActive = hoveredId !== null;
          const itemKey = `${slice.id}-${slice.total}`;

          return (
            <div
              key={itemKey}
              className="flex items-center justify-between text-sm themed-card themed-border border rounded-lg px-3 py-2 transition-all duration-150"
              style={{
                opacity: hasActive && !isActive ? 0.55 : 1,
                borderColor: isActive ? slice.color : undefined,
                boxShadow: isActive
                  ? "0 0 0 1px color-mix(in srgb, var(--text-color) 15%, transparent)"
                  : "none",
                cursor: "pointer",
              }}
              onMouseEnter={() => setHoveredId(slice.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSelect?.(slice)}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onKeyDown={(event) => {
                if (onSelect && (event.key === "Enter" || event.key === " ")) {
                  event.preventDefault();
                  onSelect(slice);
                }
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="truncate">{slice.label}</span>
              </div>
              <div className="text-right ml-3">
                <div className="font-medium">{formatCurrency(slice.total)}</div>
                <div className="themed-muted text-xs">
                  {slice.percentage.toFixed(1)}% • {slice.count} {countSuffix}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
