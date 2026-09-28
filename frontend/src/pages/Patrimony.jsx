import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import bankAccountsService from "../services/bankAccountsService";
import dreamsService from "../services/dreamsService";
import { confirm, notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";
import { buildPreviousAccountValuesByLastChange } from "../utils/patrimonyComparison";

function formatCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";

  const numberValue = Number(digits) / 100;
  return numberValue.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function parseCurrencyInput(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
}

const PATRIMONY_SHOW_VALUES_KEY = "patrimony_show_values";

export default function Patrimony() {
  const [accounts, setAccounts] = useState([]);
  const [dreams, setDreams] = useState([]);
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingValueId, setUpdatingValueId] = useState(null);
  const [updatingValueInput, setUpdatingValueInput] = useState("");
  const [savingValueId, setSavingValueId] = useState(null);
  const [showValues, setShowValues] = useState(() => {
    const stored = localStorage.getItem(PATRIMONY_SHOW_VALUES_KEY);
    if (stored === null) return true;
    return stored === "true";
  });

  const [filters, setFilters] = useState({
    name: "",
    objectiveDreamId: "",
    totalValue: "",
  });

  async function loadSnapshots() {
    try {
      const snapshotsData = await bankAccountsService.snapshots(7);
      setSnapshots(Array.isArray(snapshotsData) ? snapshotsData : []);
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao carregar snapshots"));
    }
  }

  useEffect(() => {
    async function loadData() {
      try {
        const [accountsData, dreamsData] = await Promise.all([
          bankAccountsService.list(),
          dreamsService.list(),
        ]);
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
        setDreams(Array.isArray(dreamsData) ? dreamsData : []);
        await loadSnapshots();
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar patrimônio"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  useEffect(() => {
    localStorage.setItem(PATRIMONY_SHOW_VALUES_KEY, String(showValues));
  }, [showValues]);

  const totalPatrimony = useMemo(
    () =>
      accounts.reduce(
        (acc, account) => acc + Number(account.total_value || 0),
        0,
      ),
    [accounts],
  );

  const formattedTotal = useMemo(
    () =>
      totalPatrimony.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      }),
    [totalPatrimony],
  );

  const maskedMoney = "R$ •••••";

  const accountsWithPreviousValue = useMemo(() => {
    const previousValuesByAccount =
      buildPreviousAccountValuesByLastChange(snapshots);

    return accounts.map((account) => ({
      ...account,
      previous_total_value: previousValuesByAccount.get(account.id) ?? null,
    }));
  }, [accounts, snapshots]);

  const filteredAccounts = useMemo(() => {
    const normalizedName = filters.name.trim().toLowerCase();
    const objectiveDreamId = Number(filters.objectiveDreamId);
    const minValue = parseCurrencyInput(filters.totalValue);

    return accountsWithPreviousValue.filter((account) => {
      const matchesName = normalizedName
        ? String(account.name || "")
            .toLowerCase()
            .includes(normalizedName)
        : true;
      const matchesObjective = objectiveDreamId
        ? account.objective_dream_id === objectiveDreamId
        : true;
      const matchesValue =
        Number.isFinite(minValue) && filters.totalValue !== ""
          ? Number(account.total_value || 0) >= minValue
          : true;

      return matchesName && matchesObjective && matchesValue;
    });
  }, [accountsWithPreviousValue, filters]);

  function handleRemove(accountId) {
    confirm({
      message: "Deseja remover esta conta bancária?",
      confirmText: "Remover",
      cancelText: "Cancelar",
      variant: "danger",
      onConfirm: async () => {
        try {
          await bankAccountsService.remove(accountId);
          setAccounts((prev) => prev.filter((item) => item.id !== accountId));
          notify.success("Conta removida");
        } catch (err) {
          notify.error(getApiErrorMessage(err, "Erro ao remover conta"));
        }
      },
    });
  }

  function startUpdateValue(account) {
    setUpdatingValueId(account.id);
    setUpdatingValueInput(
      formatCurrencyInput(String(account.total_value || "")),
    );
  }

  function cancelUpdateValue() {
    setUpdatingValueId(null);
    setUpdatingValueInput("");
  }

  async function handleUpdateValue(accountId) {
    const totalValue = parseCurrencyInput(updatingValueInput);

    if (!Number.isFinite(totalValue) || totalValue < 0) {
      notify.error("Informe um valor total válido");
      return;
    }

    setSavingValueId(accountId);
    try {
      const updated = await bankAccountsService.update(accountId, {
        total_value: totalValue,
      });
      setAccounts((prev) =>
        prev.map((item) => (item.id === accountId ? updated : item)),
      );
      notify.success("Valor atualizado");
      cancelUpdateValue();
      await loadSnapshots();
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao atualizar valor"));
    } finally {
      setSavingValueId(null);
    }
  }

  async function handleToggleInvestmentIncome(account) {
    try {
      const updated = await bankAccountsService.update(account.id, {
        allow_investment_income: !account.allow_investment_income,
      });
      setAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? updated : item)),
      );
      notify.success("Configuração de proventos atualizada");
      await loadSnapshots();
    } catch (err) {
      notify.error(
        getApiErrorMessage(err, "Erro ao atualizar configuração de proventos"),
      );
    }
  }

  async function handleTogglePayments(account) {
    try {
      const updated = await bankAccountsService.update(account.id, {
        allow_payments: !account.allow_payments,
      });
      setAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? updated : item)),
      );
      notify.success("Configuração de despesas atualizada");
      await loadSnapshots();
    } catch (err) {
      notify.error(
        getApiErrorMessage(err, "Erro ao atualizar configuração de despesas"),
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Patrimônio</h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowValues((prev) => !prev)}
            className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition inline-flex items-center gap-2"
            aria-label={showValues ? "Ocultar valores" : "Mostrar valores"}
            title={showValues ? "Ocultar valores" : "Mostrar valores"}
          >
            {showValues ? <EyeOff size={18} /> : <Eye size={18} />}
            <span className="hidden sm:inline">
              {showValues ? "Ocultar valores" : "Mostrar valores"}
            </span>
          </button>
          <Link
            to="/finances"
            className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
          >
            Voltar para Finanças
          </Link>
        </div>
      </div>

      <p className="themed-muted mb-6">
        Acompanhe seus ativos, passivos e evolução patrimonial.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total em Contas</h2>
          <p className="text-2xl font-bold">
            {showValues ? formattedTotal : maskedMoney}
          </p>
          <p className="themed-muted text-sm mt-1">Soma do valor total</p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Contas Cadastradas</h2>
          <p className="text-2xl font-bold">{accounts.length}</p>
          <p className="themed-muted text-sm mt-1">Quantidade de contas</p>
        </div>

        <Link
          to="/dreams"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Objetivos Disponíveis</h2>
          <p className="text-2xl font-bold">{dreams.length}</p>
          <p className="themed-muted text-sm mt-1">Sonhos para vincular</p>
        </Link>

        <Link
          to="/finances/patrimony/accounts"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Contas Bancárias</h2>
          <p className="text-2xl font-bold">Abrir</p>
          <p className="themed-muted text-sm mt-1">
            Cadastre e gerencie contas.
          </p>
        </Link>

        <Link
          to="/finances/patrimony/dashboards"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Dashboards</h2>
          <p className="text-2xl font-bold">Abrir</p>
          <p className="themed-muted text-sm mt-1">
            Visualize os painéis do patrimônio.
          </p>
        </Link>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5 mt-6">
        <h2 className="text-xl font-semibold mb-4">Filtrar Contas Bancárias</h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="text"
            className="themed-input rounded px-3 py-2"
            placeholder="Banco XYZ"
            autoComplete="off"
            name="bank-account-name-filter"
            value={filters.name}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, name: e.target.value }))
            }
          />

          <select
            className="themed-input rounded px-3 py-2"
            value={filters.objectiveDreamId}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                objectiveDreamId: e.target.value,
              }))
            }
          >
            <option value="">Todos os objetivos</option>
            {dreams.map((dream) => (
              <option key={dream.id} value={dream.id}>
                {dream.title}
              </option>
            ))}
          </select>

          <input
            type="text"
            inputMode="decimal"
            className="themed-input rounded px-3 py-2"
            placeholder="Valor mínimo"
            value={filters.totalValue}
            onChange={(e) =>
              setFilters((prev) => ({
                ...prev,
                totalValue: formatCurrencyInput(e.target.value),
              }))
            }
          />

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setFilters({
                  name: "",
                  objectiveDreamId: "",
                  totalValue: "",
                })
              }
              className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <h2 className="text-xl font-semibold mb-4">Contas Bancárias</h2>

        {loading ? (
          <p className="themed-muted">Carregando contas...</p>
        ) : filteredAccounts.length === 0 ? (
          <p className="themed-muted">
            Nenhuma conta encontrada para os filtros informados.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredAccounts.map((account) => {
              const isUpdatingValue = updatingValueId === account.id;
              const isSavingValue = savingValueId === account.id;

              return (
                <div
                  key={account.id}
                  className="themed-card themed-border border rounded-xl p-4"
                >
                  <h3 className="text-lg font-semibold">{account.name}</h3>
                  <p className="themed-muted text-sm mt-1">
                    Objetivo: {account.objective_dream_title}
                  </p>
                  <p className="themed-muted text-sm mt-1">
                    Proventos:{" "}
                    {account.allow_investment_income
                      ? "Habilitado"
                      : "Desabilitado"}
                  </p>
                  <p className="themed-muted text-sm mt-1">
                    Despesas:{" "}
                    {account.allow_payments ? "Permitido" : "Bloqueado"}
                  </p>
                  <p className="text-xl font-bold mt-2 flex items-center gap-2">
                    {showValues
                      ? Number(account.total_value).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })
                      : maskedMoney}
                    {showValues && account.previous_total_value != null && (
                      <span className="inline-flex items-center gap-1 text-sm">
                        {(() => {
                          const currentValue = Number(account.total_value || 0);
                          const previousValue = Number(
                            account.previous_total_value || 0,
                          );
                          const diffValue = currentValue - previousValue;
                          const formattedDiff = `${diffValue > 0 ? "+" : ""}${diffValue.toLocaleString(
                            "pt-BR",
                            {
                              style: "currency",
                              currency: "BRL",
                            },
                          )}`;

                          return (
                            <>
                              {currentValue > previousValue ? (
                                <ArrowUp className="h-4 w-4 text-emerald-600" />
                              ) : currentValue < previousValue ? (
                                <ArrowDown className="h-4 w-4 text-rose-600" />
                              ) : null}
                              <span
                                className={
                                  currentValue > previousValue
                                    ? "text-emerald-600"
                                    : currentValue < previousValue
                                      ? "text-rose-600"
                                      : ""
                                }
                              >
                                {formattedDiff}
                              </span>
                            </>
                          );
                        })()}
                      </span>
                    )}
                  </p>

                  {isUpdatingValue && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleUpdateValue(account.id);
                      }}
                      className="mt-3 flex items-center gap-2"
                    >
                      <input
                        type="text"
                        inputMode="decimal"
                        className="themed-input rounded px-3 py-2 w-full"
                        placeholder="Novo valor"
                        value={updatingValueInput}
                        onChange={(e) =>
                          setUpdatingValueInput(
                            formatCurrencyInput(e.target.value),
                          )
                        }
                      />
                      <button
                        type="submit"
                        disabled={isSavingValue}
                        className="bg-blue-600 text-white px-3 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSavingValue ? "Salvando..." : "Salvar"}
                      </button>
                      <button
                        type="button"
                        disabled={isSavingValue}
                        onClick={cancelUpdateValue}
                        className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 disabled:opacity-50"
                      >
                        Cancelar
                      </button>
                    </form>
                  )}

                  <div className="flex gap-4 text-sm mt-3">
                    <button
                      type="button"
                      onClick={() => handleToggleInvestmentIncome(account)}
                      className="themed-link hover:underline"
                    >
                      {account.allow_investment_income
                        ? "Desabilitar proventos"
                        : "Habilitar proventos"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePayments(account)}
                      className="themed-link hover:underline"
                    >
                      {account.allow_payments
                        ? "Bloquear despesas"
                        : "Permitir despesas"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        isUpdatingValue
                          ? cancelUpdateValue()
                          : startUpdateValue(account)
                      }
                      className="themed-link hover:underline"
                    >
                      {isUpdatingValue
                        ? "Cancelar atualização"
                        : "Atualizar Valor"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(account.id)}
                      className="text-red-600 hover:underline"
                    >
                      Remover
                    </button>
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
