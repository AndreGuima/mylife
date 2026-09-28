import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DataTable from "../components/DataTable";
import bankAccountsService from "../services/bankAccountsService";
import dreamsService from "../services/dreamsService";
import { confirm, notify } from "../core/toast";
import { getApiErrorMessage } from "../core/apiError";

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

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getInitialAccountForm() {
  return {
    name: "",
    objectiveDreamId: "",
    totalValue: "",
    allowInvestmentIncome: false,
    allowPayments: true,
  };
}

export default function BankAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [dreams, setDreams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingAccount, setSavingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState(null);
  const [accountForm, setAccountForm] = useState(getInitialAccountForm);
  const [filters, setFilters] = useState({
    name: "",
    objectiveDreamId: "",
    totalValue: "",
  });

  useEffect(() => {
    async function loadData() {
      try {
        const [accountsData, dreamsData] = await Promise.all([
          bankAccountsService.list(),
          dreamsService.list(),
        ]);
        setAccounts(Array.isArray(accountsData) ? accountsData : []);
        setDreams(Array.isArray(dreamsData) ? dreamsData : []);
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar contas"));
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const totalBalance = useMemo(
    () =>
      accounts.reduce(
        (acc, account) => acc + Number(account.total_value || 0),
        0,
      ),
    [accounts],
  );

  const filteredAccounts = useMemo(() => {
    const normalizedName = filters.name.trim().toLowerCase();
    const objectiveDreamId = Number(filters.objectiveDreamId);
    const minValue = parseCurrencyInput(filters.totalValue);

    return accounts.filter((account) => {
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
  }, [accounts, filters]);

  function resetAccountForm() {
    setAccountForm(getInitialAccountForm());
    setEditingAccountId(null);
  }

  function startEditingAccount(account) {
    setEditingAccountId(account.id);
    setAccountForm({
      name: account.name,
      objectiveDreamId: String(account.objective_dream_id),
      totalValue: formatCurrencyInput(String(account.total_value || "")),
      allowInvestmentIncome: Boolean(account.allow_investment_income),
      allowPayments: Boolean(account.allow_payments),
    });
  }

  async function handleSaveAccount(e) {
    e.preventDefault();

    const name = String(accountForm.name || "").trim();
    const objectiveDreamId = Number(accountForm.objectiveDreamId);
    const totalValue = parseCurrencyInput(accountForm.totalValue);

    if (!name) {
      notify.error("Informe o nome da conta");
      return;
    }

    if (!objectiveDreamId) {
      notify.error("Selecione um objetivo");
      return;
    }

    if (!Number.isFinite(totalValue) || totalValue < 0) {
      notify.error("Informe um valor total válido");
      return;
    }

    setSavingAccount(true);
    try {
      const payload = {
        name,
        objective_dream_id: objectiveDreamId,
        total_value: totalValue,
        allow_investment_income: Boolean(accountForm.allowInvestmentIncome),
        allow_payments: Boolean(accountForm.allowPayments),
      };

      if (editingAccountId === null) {
        const created = await bankAccountsService.create(payload);
        setAccounts((prev) => [created, ...prev]);
        notify.success("Conta criada");
      } else {
        const updated = await bankAccountsService.update(
          editingAccountId,
          payload,
        );
        setAccounts((prev) =>
          prev.map((item) => (item.id === editingAccountId ? updated : item)),
        );
        notify.success("Conta atualizada");
      }

      resetAccountForm();
    } catch (err) {
      notify.error(
        getApiErrorMessage(
          err,
          editingAccountId === null
            ? "Erro ao criar conta"
            : "Erro ao atualizar conta",
        ),
      );
    } finally {
      setSavingAccount(false);
    }
  }

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

  async function handleToggleInvestmentIncome(account) {
    try {
      const updated = await bankAccountsService.update(account.id, {
        allow_investment_income: !account.allow_investment_income,
      });
      setAccounts((prev) =>
        prev.map((item) => (item.id === account.id ? updated : item)),
      );
      notify.success("Configuração de proventos atualizada");
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
    } catch (err) {
      notify.error(
        getApiErrorMessage(err, "Erro ao atualizar configuração de despesas"),
      );
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Contas Bancárias</h1>
        <Link
          to="/finances/patrimony"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Patrimônio
        </Link>
      </div>

      <p className="themed-muted mb-6">
        Cadastre e gerencie as contas usadas no cálculo do patrimônio.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Contas Cadastradas</h2>
          <p className="text-2xl font-bold">{accounts.length}</p>
          <p className="themed-muted text-sm mt-1">Quantidade de contas</p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Saldo Total</h2>
          <p className="text-2xl font-bold">{formatCurrency(totalBalance)}</p>
          <p className="themed-muted text-sm mt-1">Total consolidado</p>
        </div>

        <Link
          to="/dreams"
          className="themed-card themed-border border rounded-xl p-5 hover:shadow-md transition block"
        >
          <h2 className="font-semibold mb-1">Objetivos Disponíveis</h2>
          <p className="text-2xl font-bold">{dreams.length}</p>
          <p className="themed-muted text-sm mt-1">Sonhos para vincular</p>
        </Link>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5">
        <h2 className="text-xl font-semibold mb-4">
          {editingAccountId === null
            ? "Nova Conta Bancária"
            : "Alterar Conta Bancária"}
        </h2>

        <form
          onSubmit={handleSaveAccount}
          className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start"
        >
          <input
            type="text"
            className="themed-input rounded px-3 py-2 lg:col-span-4"
            placeholder="Nome da conta"
            autoComplete="off"
            value={accountForm.name}
            onChange={(e) =>
              setAccountForm((prev) => ({ ...prev, name: e.target.value }))
            }
          />

          <div className="relative lg:col-span-4">
            <Link
              to="/dreams"
              className="absolute -top-6 left-0 text-sm font-medium text-blue-500 hover:underline"
            >
              + adicionar objetivo
            </Link>

            <select
              className="themed-input rounded px-3 py-2 w-full"
              value={accountForm.objectiveDreamId}
              onChange={(e) =>
                setAccountForm((prev) => ({
                  ...prev,
                  objectiveDreamId: e.target.value,
                }))
              }
            >
              <option value="">Selecione um objetivo</option>
              {dreams.map((dream) => (
                <option key={dream.id} value={dream.id}>
                  {dream.title}
                </option>
              ))}
            </select>
          </div>

          <input
            type="text"
            inputMode="decimal"
            className="themed-input rounded px-3 py-2 lg:col-span-4"
            placeholder="Valor total"
            value={accountForm.totalValue}
            onChange={(e) =>
              setAccountForm((prev) => ({
                ...prev,
                totalValue: formatCurrencyInput(e.target.value),
              }))
            }
          />

          <div className="lg:col-span-8 flex flex-col sm:flex-row sm:flex-wrap gap-3 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(accountForm.allowInvestmentIncome)}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    allowInvestmentIncome: e.target.checked,
                  }))
                }
              />
              <span>Habilitar para proventos</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(accountForm.allowPayments)}
                onChange={(e) =>
                  setAccountForm((prev) => ({
                    ...prev,
                    allowPayments: e.target.checked,
                  }))
                }
              />
              <span>Permitir lançamento de despesas</span>
            </label>
          </div>

          <div className="lg:col-span-4 flex gap-2 lg:justify-end">
            <button
              type="submit"
              disabled={savingAccount}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {savingAccount
                ? "Salvando..."
                : editingAccountId === null
                  ? "Cadastrar"
                  : "Salvar alterações"}
            </button>
            <button
              type="button"
              onClick={resetAccountForm}
              className="themed-card themed-border border px-4 py-2 rounded hover:opacity-90"
            >
              Limpar
            </button>
          </div>
        </form>
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
        {loading ? (
          <p className="themed-muted">Carregando contas...</p>
        ) : (
          <DataTable
            title="Contas Cadastradas"
            columns={[
              { key: "name", label: "Conta" },
              { key: "objective", label: "Objetivo" },
              { key: "total_value", label: "Valor Total" },
              { key: "investment_income", label: "Proventos" },
              { key: "payments", label: "Despesas" },
              { key: "actions", label: "Ações", width: 520 },
            ]}
            data={filteredAccounts}
            renderRow={(account) => {
              return (
                <tr key={account.id} className="border themed-border">
                  <td className="p-2 border themed-border font-medium">
                    {account.name}
                  </td>
                  <td className="p-2 border themed-border">
                    {account.objective_dream_title || "—"}
                  </td>
                  <td className="p-2 border themed-border">
                    {formatCurrency(account.total_value)}
                  </td>
                  <td className="p-2 border themed-border">
                    {account.allow_investment_income
                      ? "Habilitado"
                      : "Desabilitado"}
                  </td>
                  <td className="p-2 border themed-border">
                    {account.allow_payments ? "Permitido" : "Bloqueado"}
                  </td>
                  <td className="p-2 border themed-border">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleInvestmentIncome(account)}
                        className="px-2 py-1 bg-slate-600 text-white rounded hover:opacity-90"
                      >
                        {account.allow_investment_income
                          ? "Desabilitar proventos"
                          : "Habilitar proventos"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleTogglePayments(account)}
                        className="px-2 py-1 bg-slate-600 text-white rounded hover:opacity-90"
                      >
                        {account.allow_payments
                          ? "Bloquear despesas"
                          : "Permitir despesas"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEditingAccount(account)}
                        className="px-2 py-1 bg-blue-500 text-white rounded"
                      >
                        Alterar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemove(account.id)}
                        className="px-2 py-1 bg-red-500 text-white rounded"
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
