import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import bankAccountsService from "../services/bankAccountsService";
import creditCardsService from "../services/creditCardsService";
import expensesService from "../services/expensesService";
import { getApiErrorMessage } from "../core/apiError";
import { notify } from "../core/toast";

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function getCurrentPeriod() {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
}

function toDateInputValue(date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);
}

function getPeriodEndDate(year, month) {
  return new Date(year, month, 0);
}

export default function PayCreditCardInvoice() {
  const period = getCurrentPeriod();
  const monthOptions = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Março" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedCardId, setSelectedCardId] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(String(period.month));
  const [selectedYear, setSelectedYear] = useState(String(period.year));
  const [paymentDate, setPaymentDate] = useState(toDateInputValue(new Date()));
  const [creditExpenses, setCreditExpenses] = useState([]);
  const [selectedExpenseIds, setSelectedExpenseIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paying, setPaying] = useState(false);

  function handleInvoiceFilterChange(setter, value) {
    setter(value);
    setSelectedExpenseIds([]);
    setLoading(true);
  }

  useEffect(() => {
    async function loadInitialData() {
      try {
        const [cardsData, accountsData] = await Promise.all([
          creditCardsService.list(),
          bankAccountsService.list({ allow_payments: true }),
        ]);
        const list = Array.isArray(cardsData) ? cardsData : [];
        const accountList = Array.isArray(accountsData) ? accountsData : [];
        setCards(list);
        setAccounts(accountList);
        if (list.length > 0) {
          setSelectedCardId(String(list[0].id));
        }
        if (accountList.length > 0) {
          setSelectedAccountId(String(accountList[0].id));
        }
      } catch (err) {
        notify.error(
          getApiErrorMessage(err, "Erro ao carregar dados da fatura"),
        );
      }
    }

    loadInitialData();
  }, []);

  const fetchInvoiceExpenses = useCallback(async ({ cardId, month, year }) => {
    if (!cardId) {
      return [];
    }

    const numericMonth = Number(month);
    const numericYear = Number(year);
    const validMonth =
      Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12;
    const validYear =
      Number.isInteger(numericYear) &&
      numericYear >= 2000 &&
      numericYear <= 2100;

    if (!validMonth || !validYear) {
      return [];
    }

    const expensesData = await expensesService.list({
      limit: 500,
      offset: 0,
    });
    const periodEnd = getPeriodEndDate(numericYear, numericMonth);
    const list = Array.isArray(expensesData) ? expensesData : [];
    return list.filter((expense) => {
      const launchDate = expense.launch_date
        ? new Date(`${expense.launch_date}T00:00:00`)
        : null;
      const isUntilSelectedPeriod =
        launchDate instanceof Date &&
        !Number.isNaN(launchDate.getTime()) &&
        launchDate <= periodEnd;

      return (
        expense.payment_method === "credit" &&
        expense.invoice_paid_at == null &&
        String(expense.credit_card_id || "") === String(cardId) &&
        isUntilSelectedPeriod
      );
    });
  }, []);

  const loadInvoiceExpenses = useCallback(
    async ({
      cardId = selectedCardId,
      month = selectedMonth,
      year = selectedYear,
    } = {}) => {
      setLoading(true);
      try {
        const filtered = await fetchInvoiceExpenses({
          cardId,
          month,
          year,
        });
        setCreditExpenses(filtered);
        setSelectedExpenseIds(filtered.map((expense) => expense.id));
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar fatura"));
      } finally {
        setLoading(false);
      }
    },
    [fetchInvoiceExpenses, selectedCardId, selectedMonth, selectedYear],
  );

  useEffect(() => {
    async function loadSelectedInvoiceExpenses() {
      try {
        const filtered = await fetchInvoiceExpenses({
          cardId: selectedCardId,
          month: selectedMonth,
          year: selectedYear,
        });
        setCreditExpenses(filtered);
        setSelectedExpenseIds(filtered.map((expense) => expense.id));
      } catch (err) {
        notify.error(getApiErrorMessage(err, "Erro ao carregar fatura"));
      } finally {
        setLoading(false);
      }
    }

    loadSelectedInvoiceExpenses();
  }, [fetchInvoiceExpenses, selectedCardId, selectedMonth, selectedYear]);

  const totalInvoice = useMemo(
    () =>
      creditExpenses.reduce(
        (acc, expense) => acc + Number(expense.value || 0),
        0,
      ),
    [creditExpenses],
  );

  const totalSelected = useMemo(() => {
    const selectedSet = new Set(selectedExpenseIds);
    return creditExpenses.reduce((acc, expense) => {
      return selectedSet.has(expense.id)
        ? acc + Number(expense.value || 0)
        : acc;
    }, 0);
  }, [creditExpenses, selectedExpenseIds]);

  function handleToggleExpense(expenseId) {
    setSelectedExpenseIds((prev) => {
      if (prev.includes(expenseId)) {
        return prev.filter((id) => id !== expenseId);
      }
      return [...prev, expenseId];
    });
  }

  function handleToggleAll() {
    if (selectedExpenseIds.length === creditExpenses.length) {
      setSelectedExpenseIds([]);
      return;
    }
    setSelectedExpenseIds(creditExpenses.map((expense) => expense.id));
  }

  async function handlePayInvoice() {
    if (selectedExpenseIds.length === 0) {
      notify.error("Selecione ao menos um gasto para pagar a fatura");
      return;
    }
    if (!selectedAccountId) {
      notify.error("Selecione a conta que vai pagar a fatura");
      return;
    }

    setPaying(true);
    try {
      const result = await expensesService.payCreditInvoice({
        credit_card_id: Number(selectedCardId),
        bank_account_id: Number(selectedAccountId),
        expense_ids: selectedExpenseIds,
        launch_date: paymentDate,
      });
      await loadInvoiceExpenses();
      notify.success(
        `Fatura paga: ${result.paid_expense_ids.length} gasto(s), total ${formatCurrency(result.total_paid)}.`,
      );
      setSelectedExpenseIds([]);
    } catch (err) {
      notify.error(getApiErrorMessage(err, "Erro ao pagar fatura"));
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Pagar Fatura do Cartao</h1>
        <Link
          to="/finances/expenses"
          className="themed-card themed-border border px-3 py-2 rounded hover:opacity-90 transition"
        >
          Voltar para Despesas
        </Link>
      </div>

      <p className="themed-muted mb-6">
        Selecione cartao e periodo para montar a fatura com os gastos no
        credito.
      </p>

      <div className="themed-card themed-border border rounded-xl p-5 mb-6">
        <h2 className="text-xl font-semibold mb-4">Filtros da Fatura</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            className="themed-input rounded px-3 py-2"
            value={selectedCardId}
            onChange={(event) =>
              handleInvoiceFilterChange(setSelectedCardId, event.target.value)
            }
          >
            <option value="">Selecione o cartao</option>
            {cards.map((card) => (
              <option key={card.id} value={card.id}>
                {card.name}
              </option>
            ))}
          </select>

          <select
            className="themed-input rounded px-3 py-2"
            value={selectedMonth}
            onChange={(event) =>
              handleInvoiceFilterChange(setSelectedMonth, event.target.value)
            }
          >
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>
                {month.label}
              </option>
            ))}
          </select>

          <input
            type="number"
            className="themed-input rounded px-3 py-2"
            min="2000"
            max="2100"
            value={selectedYear}
            onChange={(event) =>
              handleInvoiceFilterChange(setSelectedYear, event.target.value)
            }
            placeholder="Ano"
          />

          <select
            className="themed-input rounded px-3 py-2"
            value={selectedAccountId}
            onChange={(event) => setSelectedAccountId(event.target.value)}
          >
            <option value="">Conta para pagamento</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mt-3">
          <input
            type="date"
            className="themed-input rounded px-3 py-2"
            value={paymentDate}
            onChange={(event) => setPaymentDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total da Fatura</h2>
          <p className="text-2xl font-bold">{formatCurrency(totalInvoice)}</p>
          <p className="themed-muted text-sm mt-1">
            Soma de todos os gastos no periodo
          </p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Total Selecionado</h2>
          <p className="text-2xl font-bold">{formatCurrency(totalSelected)}</p>
          <p className="themed-muted text-sm mt-1">
            Valor que sera pago nesta fatura
          </p>
        </div>

        <div className="themed-card themed-border border rounded-xl p-5">
          <h2 className="font-semibold mb-1">Lancamentos</h2>
          <p className="text-2xl font-bold">{creditExpenses.length}</p>
          <p className="themed-muted text-sm mt-1">
            Gastos no credito encontrados
          </p>
        </div>
      </div>

      <div className="themed-card themed-border border rounded-xl p-5">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Gastos da Fatura</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleToggleAll}
              className="px-3 py-2 rounded themed-card themed-border border hover:opacity-90 transition"
              disabled={creditExpenses.length === 0}
            >
              {selectedExpenseIds.length === creditExpenses.length
                ? "Desmarcar tudo"
                : "Selecionar tudo"}
            </button>

            <button
              type="button"
              onClick={handlePayInvoice}
              className="px-3 py-2 rounded bg-emerald-600 text-white hover:bg-emerald-500 transition disabled:opacity-60"
              disabled={
                paying ||
                loading ||
                selectedExpenseIds.length === 0 ||
                !selectedAccountId ||
                !selectedCardId ||
                !paymentDate
              }
            >
              {paying ? "Processando..." : "Pagar Fatura"}
            </button>
          </div>
        </div>

        {loading ? (
          <p className="themed-muted">Carregando gastos...</p>
        ) : creditExpenses.length === 0 ? (
          <p className="themed-muted">
            Nenhum gasto no credito encontrado para esse cartao e periodo.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b themed-border">
                  <th className="text-left py-2 pr-3">Incluir</th>
                  <th className="text-left py-2 pr-3">Data</th>
                  <th className="text-left py-2 pr-3">Descricao</th>
                  <th className="text-left py-2 pr-3">Categoria</th>
                  <th className="text-left py-2 pr-3">Valor</th>
                </tr>
              </thead>
              <tbody>
                {creditExpenses.map((expense) => (
                  <tr key={expense.id} className="border-b themed-border/60">
                    <td className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={selectedExpenseIds.includes(expense.id)}
                        onChange={() => handleToggleExpense(expense.id)}
                      />
                    </td>
                    <td className="py-2 pr-3">{expense.launch_date || "-"}</td>
                    <td className="py-2 pr-3">{expense.description || "-"}</td>
                    <td className="py-2 pr-3">
                      {expense.expense_category_name || "Sem categoria"}
                    </td>
                    <td className="py-2 pr-3 font-semibold">
                      {formatCurrency(expense.value)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
