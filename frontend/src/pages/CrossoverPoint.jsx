import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  buildCrossoverProjection,
  calculateCrossoverPoint,
} from "../utils/crossoverPoint";

const STORAGE_KEY = "mylife.crossoverPoint.inputs";

const DEFAULT_INPUTS = {
  currentAge: 34,
  retirementAge: 60,
  monthlySpending: 4000,
  otherMonthlyIncome: 0,
  withdrawalRate: 5,
  realReturn: 7.5,
  currentInvested: 60000,
};

const FIELDS = [
  { key: "currentAge", label: "Sua idade hoje", suffix: "anos", step: 1 },
  {
    key: "retirementAge",
    label: 'Idade que quer se "aposentar"',
    suffix: "anos",
    step: 1,
  },
  {
    key: "monthlySpending",
    label: "Quanto quer gastar por mês (em reais de hoje)",
    prefix: "R$",
    step: 100,
  },
  {
    key: "otherMonthlyIncome",
    label: "Renda de outras fontes por mês (INSS, aluguel...)",
    prefix: "R$",
    step: 100,
  },
  {
    key: "withdrawalRate",
    label: "Taxa de retirada (ao ano)",
    suffix: "%",
    step: 0.1,
  },
  {
    key: "realReturn",
    label: "Rentabilidade acima da inflação (ao ano)",
    suffix: "%",
    step: 0.1,
  },
  {
    key: "currentInvested",
    label: "Quanto você já tem investido hoje",
    prefix: "R$",
    step: 1000,
  },
];

function loadInputs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return saved ? { ...DEFAULT_INPUTS, ...saved } : DEFAULT_INPUTS;
  } catch {
    return DEFAULT_INPUTS;
  }
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatPercent(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function ResultRow({ label, value, highlight = false }) {
  return (
    <div
      className={`flex items-center justify-between gap-4 py-2 px-3 rounded ${
        highlight ? "bg-green-100 text-green-900 font-semibold" : ""
      }`}
    >
      <span className={highlight ? "" : "themed-muted"}>{label}</span>
      <span className="font-semibold text-right whitespace-nowrap">
        {value}
      </span>
    </div>
  );
}

function ProjectionChart({ rows }) {
  if (rows.length < 2) {
    return null;
  }

  const width = 640;
  const height = 240;
  const pad = { top: 16, right: 16, bottom: 28, left: 72 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const maxY = Math.max(
    ...rows.map((r) => Math.max(r.invested, r.crossoverAtAge)),
    1,
  );
  const x = (i) => pad.left + (i / (rows.length - 1)) * innerW;
  const y = (v) => pad.top + innerH - (v / maxY) * innerH;
  const path = (key) =>
    rows.map((r, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(r[key])}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const ageStep = Math.max(1, Math.ceil(rows.length / 8));

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full h-auto"
      role="img"
      aria-label="Projeção do patrimônio atual versus ponto de virada por idade"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={width - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="currentColor"
            strokeOpacity="0.12"
          />
          <text
            x={pad.left - 8}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="11"
            fill="currentColor"
            opacity="0.7"
          >
            {formatCurrency(t)}
          </text>
        </g>
      ))}
      {rows.map((r, i) =>
        i % ageStep === 0 || i === rows.length - 1 ? (
          <text
            key={r.age}
            x={x(i)}
            y={height - 8}
            textAnchor="middle"
            fontSize="11"
            fill="currentColor"
            opacity="0.7"
          >
            {r.age}
          </text>
        ) : null,
      )}
      <path
        d={path("crossoverAtAge")}
        fill="none"
        stroke="#16a34a"
        strokeWidth="2.5"
      />
      <path
        d={path("invested")}
        fill="none"
        stroke="#2563eb"
        strokeWidth="2.5"
      />
    </svg>
  );
}

export default function CrossoverPoint() {
  const [inputs, setInputs] = useState(loadInputs);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(inputs));
  }, [inputs]);

  const result = useMemo(() => calculateCrossoverPoint(inputs), [inputs]);
  const projection = useMemo(() => buildCrossoverProjection(inputs), [inputs]);

  const crossingAge = useMemo(() => {
    const row = projection.find((r) => r.invested >= r.crossoverAtAge);
    return row ? row.age : null;
  }, [projection]);

  function handleChange(key, value) {
    setInputs((prev) => ({
      ...prev,
      [key]: value === "" ? "" : Number(value),
    }));
  }

  return (
    <div className="dreams-page p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold">Ponto de Virada</h1>
          <p className="themed-muted mt-2 max-w-3xl">
            Em vez de perseguir um número redondo como R$ 1 milhão, descubra
            quanto você precisa ter investido <strong>hoje</strong> para que, só
            com juros compostos, o patrimônio chegue ao valor que banca sua
            aposentadoria — e a partir daí parar de aportar.
          </p>
        </div>
        <Link
          to="/dreams"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="themed-card themed-border border rounded-xl p-5 space-y-4 h-fit">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Seus dados</h2>
            <button
              type="button"
              onClick={() => setInputs(DEFAULT_INPUTS)}
              className="text-sm text-blue-500 hover:underline"
            >
              Restaurar exemplo
            </button>
          </div>

          {FIELDS.map((field) => (
            <div key={field.key}>
              <label
                htmlFor={field.key}
                className="block text-sm font-medium mb-1"
              >
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                {field.prefix && (
                  <span className="themed-muted text-sm">{field.prefix}</span>
                )}
                <input
                  id={field.key}
                  type="number"
                  step={field.step}
                  value={inputs[field.key]}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  className="w-full border themed-border rounded px-3 py-2"
                />
                {field.suffix && (
                  <span className="themed-muted text-sm whitespace-nowrap">
                    {field.suffix}
                  </span>
                )}
              </div>
            </div>
          ))}
        </section>

        <section className="themed-card themed-border border rounded-xl p-5 h-fit">
          <h2 className="text-xl font-semibold mb-4">Resultado</h2>

          {!result.valid ? (
            <ul className="text-red-500 text-sm list-disc pl-5 space-y-1">
              {result.errors.map((err) => (
                <li key={err}>{err}</li>
              ))}
            </ul>
          ) : (
            <div className="space-y-1">
              <ResultRow
                label="Renda que os investimentos precisam pagar por mês"
                value={formatCurrency(result.requiredMonthlyIncome)}
              />
              <ResultRow
                label="Gasto por ano (renda mensal × 12)"
                value={formatCurrency(result.annualSpending)}
              />
              <ResultRow
                label="Patrimônio necessário (gasto anual ÷ taxa de retirada)"
                value={formatCurrency(result.requiredPatrimony)}
              />
              <ResultRow
                label="Anos até a aposentadoria"
                value={`${result.yearsToRetirement} anos`}
              />
              <ResultRow
                highlight
                label="Seu ponto de virada: quanto ter investido hoje"
                value={formatCurrency(result.crossoverPoint)}
              />
              <ResultRow
                label="Quanto do caminho você já fez"
                value={formatPercent(result.progress)}
              />
              <div className="px-3 pb-2">
                <div className="h-2 rounded bg-gray-200 overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${Math.min(result.progress, 1) * 100}%`,
                    }}
                  />
                </div>
              </div>
              <ResultRow
                label="Quanto falta para chegar ao ponto hoje"
                value={formatCurrency(result.remainingToCrossover)}
              />
              <ResultRow
                label="Ou: aporte mensal até a aposentadoria para chegar à meta"
                value={formatCurrency(result.monthlyContribution)}
              />

              <div
                className={`mt-4 rounded-lg p-4 text-sm ${
                  result.reached
                    ? "bg-green-50 text-green-900"
                    : "bg-blue-50 text-blue-900"
                }`}
              >
                {result.reached ? (
                  <>
                    <strong>Você já passou do ponto de virada!</strong> Mesmo
                    sem novos aportes, seus{" "}
                    {formatCurrency(inputs.currentInvested)} devem virar cerca
                    de {formatCurrency(result.projectedWithoutContributions)}{" "}
                    aos {inputs.retirementAge} anos. Você pode direcionar mais
                    recursos para o presente sem comprometer o futuro.
                  </>
                ) : (
                  <>
                    Sem novos aportes, seu patrimônio atual chegaria a{" "}
                    {formatCurrency(result.projectedWithoutContributions)} aos{" "}
                    {inputs.retirementAge} anos.
                    {crossingAge === null &&
                      " Para virar o jogo, é preciso aportar a diferença acima."}
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {result.valid && projection.length > 1 && (
        <section className="themed-card themed-border border rounded-xl p-5 mt-6">
          <h2 className="text-xl font-semibold mb-1">Projeção por idade</h2>
          <p className="themed-muted text-sm mb-4">
            A linha verde mostra quanto você precisaria ter em cada idade para
            estar no ponto de virada; a azul, seu patrimônio atual crescendo sem
            novos aportes. Quando a azul passa da verde, você virou o jogo.
          </p>
          <div className="flex gap-6 text-sm mb-2">
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-1 rounded bg-green-600" />
              Ponto de virada na idade
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-4 h-1 rounded bg-blue-600" />
              Patrimônio atual sem aportes
            </span>
          </div>
          <ProjectionChart rows={projection} />
        </section>
      )}

      <section className="themed-card themed-border border rounded-xl p-5 mt-6 text-sm space-y-2">
        <h2 className="text-xl font-semibold mb-2">Como interpretar</h2>
        <p>
          <strong>Taxa de retirada:</strong> quanto do patrimônio você retira
          por ano na aposentadoria. Cerca de 5% a.a. é uma referência para o
          cenário brasileiro (nos EUA, a famosa "regra dos 4%").
        </p>
        <p>
          <strong>Rentabilidade acima da inflação:</strong> o retorno real. Como
          tudo é calculado em reais de hoje, os valores já consideram a perda de
          poder de compra.
        </p>
        <p>
          <strong>Quanto mais cedo, menor o esforço:</strong> o ponto de virada
          aumenta a cada ano que passa, porque os juros têm menos tempo para
          trabalhar.
        </p>
        <p className="themed-muted">
          ⚠️ Os cálculos são uma base, não uma certeza. Manter um retorno real
          constante como 7,5% a.a. por décadas é um desafio — vale simular
          cenários mais conservadores.
        </p>
      </section>
    </div>
  );
}
